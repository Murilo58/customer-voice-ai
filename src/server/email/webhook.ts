import { createHmac, timingSafeEqual } from "node:crypto";
import type { OutboundEmailStatus } from "@/generated/prisma/client";
import { isUuid, newId } from "@/lib/security";
import { getDb, type Db } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { registerReceipt } from "./inbound/process";

// Webhook do Resend (ADR-007): assinatura Svix verificada; recebimento só registra o id e cria o job;
// eventos de entrega atualizam o status do e-mail de saída (RF-EML-07; CA-10.7).

const TOLERANCE_SECONDS = 5 * 60;

/** Verifica a assinatura Svix: HMAC-SHA256 de "id.timestamp.corpo" com o segredo whsec_ (base64). */
export function verifySvixSignature(secret: string, headers: Headers, body: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!secret.startsWith("whsec_") || !id || !timestamp || !signatures || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`, "utf8").digest();
  return signatures.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const got = Buffer.from(sig, "base64");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

const STATUS: Record<string, OutboundEmailStatus> = {
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
};

/** Ordem de precedência: um evento atrasado não rebaixa um estado final. */
const RANK: Record<OutboundEmailStatus, number> = { queued: 0, sent: 1, delayed: 2, delivered: 3, failed: 4, bounced: 4, complained: 5 };

type Json = Record<string, unknown>;

function orgTag(tags: unknown): string | null {
  if (Array.isArray(tags)) {
    const t = (tags as Json[]).find((x) => x?.name === "org");
    return typeof t?.value === "string" ? t.value : null;
  }
  if (tags && typeof tags === "object") {
    const v = (tags as Json).org;
    return typeof v === "string" ? v : null;
  }
  return null;
}

export async function handleResendEvent(eventId: string, payload: Json, db: Db = getDb()): Promise<{ jobId?: string | null; handled: string }> {
  const type = typeof payload.type === "string" ? payload.type : "";
  const data = (payload.data as Json | undefined) ?? {};
  const emailId = typeof data.email_id === "string" ? data.email_id : null;
  if (!emailId) return { handled: "ignored" };
  if (type === "email.received") return { jobId: await registerReceipt(emailId, db), handled: "received" };
  const status = STATUS[type];
  const organizationId = orgTag(data.tags);
  if (!status || !organizationId || !isUuid(organizationId)) return { handled: "ignored" };
  await withTenant({ organizationId }, async (tx) => {
    const email = await tx.outboundEmail.findFirst({ where: { providerEmailId: emailId }, select: { id: true, status: true } });
    if (!email) return;
    const occurredAt = typeof payload.created_at === "string" && !Number.isNaN(Date.parse(payload.created_at)) ? new Date(payload.created_at) : new Date();
    const r = await tx.emailEvent.createMany({ data: { id: newId(), organizationId, outboundEmailId: email.id, providerEventId: eventId.slice(0, 200), type, occurredAt }, skipDuplicates: true });
    if (r.count === 1 && RANK[status] >= RANK[email.status]) await tx.outboundEmail.update({ where: { id: email.id }, data: { status } });
  }, db);
  return { handled: "status" };
}
