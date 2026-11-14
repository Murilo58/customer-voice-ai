import { createHash } from "node:crypto";
import type { MessageKind } from "@/generated/prisma/client";
import { isUuid, newId } from "@/lib/security";
import { recordAudit } from "@/server/audit/audit";
import { getDb, type Db } from "@/server/db/client";
import { withTenant, type Tx } from "@/server/db/tenant";
import { DomainError } from "@/server/errors";
import type { ClaimedJob } from "@/server/jobs/outbox";
import { enqueueJob } from "@/server/jobs/outbox";
import { requirePermission, type TenantActor } from "@/server/organizations/service";
import { CONTENT_TYPE, MAX_ATTACHMENTS_PER_MESSAGE, sanitizeFileName, validateUpload, type AttachmentKind, type RejectReason } from "./policy";
import { sanitizeAttachment } from "./sanitize";
import { getStorage, storageKey } from "./storage";

// Ciclo do anexo (RSG-19; ADR-008): pendente → liberado | em quarentena | recusado.
// O original vai para quarantine/{org}/{id}; só o arquivo sanitizado vai para released/{org}/{id}.

export const SANITIZE_JOB = "attachment.sanitize";
const SANITIZE_ATTEMPTS = 3;

export interface IncomingFile {
  name: string;
  size: number;
  declaredType: string;
  content: Buffer;
}

export interface PreparedFile {
  id: string;
  name: string;
  declaredType: string;
  size: number;
  kind?: AttachmentKind;
  content?: Buffer;
  rejected?: RejectReason;
}

/** Valida cada arquivo (RSG-12, RSG-17). Recusados viram registro "recusado", sem armazenar o conteúdo. */
export function prepareFiles(files: IncomingFile[]): PreparedFile[] {
  return files.map((f, i) => {
    const base = { id: newId(), name: sanitizeFileName(f.name), declaredType: (f.declaredType || "application/octet-stream").slice(0, 100), size: f.size };
    if (i >= MAX_ATTACHMENTS_PER_MESSAGE) return { ...base, rejected: "too_many_files" as const };
    const v = validateUpload(f.name, f.size, f.content);
    return v.ok ? { ...base, kind: v.kind, content: f.content } : { ...base, rejected: v.reason };
  });
}

/**
 * Campo de arquivo deixado vazio. O navegador envia a parte com `filename=""` e 0 bytes; nas server actions
 * do Next o React remonta o arquivo com `new File(chunks, filename)` e o busboy entrega `filename` indefinido,
 * então o nome chega como a string "undefined". Nenhum dos dois casos é um arquivo escolhido pelo usuário.
 */
export function isEmptyFileField(v: File): boolean {
  return v.size === 0 && (!v.name || v.name === "undefined");
}

/** Lê arquivos de um formulário (portal ou atendimento). Campos vazios são ignorados. */
export async function filesFromForm(form: FormData, field = "attachments"): Promise<IncomingFile[]> {
  const out: IncomingFile[] = [];
  for (const v of form.getAll(field)) {
    if (typeof v === "string" || isEmptyFileField(v)) continue;
    // Arquivo grande demais é recusado sem ler o conteúdo inteiro.
    const content = v.size > 4 * 1024 * 1024 + 1 ? Buffer.alloc(0) : Buffer.from(await v.arrayBuffer());
    out.push({ name: v.name, size: v.size, declaredType: v.type, content });
  }
  return out;
}

/** Grava os originais aceitos em quarentena ANTES da transação: se ela falhar, sobra só um objeto órfão em quarentena. */
export async function putInQuarantine(organizationId: string, files: PreparedFile[]): Promise<void> {
  const storage = getStorage();
  for (const f of files) {
    if (f.rejected || !f.content) continue;
    await storage.put(storageKey("quarantine", organizationId, f.id), f.content, "application/octet-stream");
  }
}

/** Registra os anexos e os jobs de sanitização na transação da mensagem. */
export async function recordAttachments(
  tx: Tx,
  organizationId: string,
  target: { ticketId: string; messageId: string | null },
  uploadedBy: "contact" | "user" | "email",
  files: PreparedFile[],
): Promise<{ accepted: number; rejected: { name: string; reason: string }[] }> {
  const rejected: { name: string; reason: string }[] = [];
  for (const f of files) {
    const accepted = !f.rejected && f.kind;
    await tx.attachment.create({
      data: {
        id: f.id, organizationId, ticketId: target.ticketId, messageId: target.messageId,
        storageKey: accepted ? storageKey("quarantine", organizationId, f.id) : null,
        originalNameSanitized: f.name, declaredType: f.declaredType, detectedType: f.kind ?? null, sizeBytes: Math.min(f.size, 4 * 1024 * 1024),
        status: accepted ? "pending" : "rejected", sanitizeReason: f.rejected ?? null, uploadedBy,
        processedAt: accepted ? null : new Date(),
      },
    });
    if (accepted) {
      await enqueueJob(tx, { type: SANITIZE_JOB, organizationId, payload: { attachmentId: f.id }, idempotencyKey: f.id, maxAttempts: SANITIZE_ATTEMPTS });
    } else {
      rejected.push({ name: f.name, reason: f.rejected! });
    }
  }
  return { accepted: files.length - rejected.length, rejected };
}

async function quarantine(tx: Tx, organizationId: string, id: string, reason: string) {
  await tx.attachment.update({ where: { id }, data: { status: "quarantined", sanitizeReason: reason.slice(0, 200), processedAt: new Date() } });
  await recordAudit(tx, { organizationId, actorType: "system", action: "attachment.quarantined", targetType: "attachment", targetId: id, details: { reason } });
  // Alerta ao Administrador (RSG-19).
  const admins = await tx.membership.findMany({ where: { role: "admin", status: "active" }, select: { id: true } });
  const a = await tx.attachment.findUnique({ where: { id }, select: { ticketId: true } });
  await tx.notification.createMany({
    data: admins.map((m) => ({ id: newId(), organizationId, membershipId: m.id, type: "attachment.quarantined", ticketId: a?.ticketId ?? null, data: { reason } })),
  });
}

/** Sanitiza um anexo pendente. Idempotente: anexo fora de "pendente" é ignorado. */
export async function sanitizePending(organizationId: string, attachmentId: string, opts: { lastAttempt?: boolean } = {}, db: Db = getDb()) {
  const scope = { organizationId };
  const a = await withTenant(scope, (tx) => tx.attachment.findUnique({ where: { id: attachmentId } }), db);
  if (!a || a.status !== "pending" || !a.storageKey || !a.detectedType) return "skipped" as const;
  const storage = getStorage();
  try {
    const original = await storage.get(a.storageKey);
    if (!original) throw new Error("original_missing");
    const sha256 = createHash("sha256").update(original).digest("hex");
    const result = await sanitizeAttachment(a.detectedType as AttachmentKind, original);
    if (!result.ok) {
      await withTenant(scope, async (tx) => {
        await tx.attachment.update({ where: { id: a.id }, data: { sha256 } });
        await quarantine(tx, organizationId, a.id, result.reason);
      }, db);
      return "quarantined" as const;
    }
    const releasedKey = storageKey("released", organizationId, a.id);
    // Reprocessamento após falha parcial: o objeto liberado pode já existir.
    if (!(await storage.get(releasedKey))) await storage.put(releasedKey, result.data, result.contentType);
    await withTenant(scope, (tx) => tx.attachment.update({
      where: { id: a.id },
      data: { status: "released", storageKey: releasedKey, sanitizer: result.sanitizer, sha256, sizeBytes: Math.min(result.data.length, 4 * 1024 * 1024), processedAt: new Date() },
    }), db);
    await storage.delete(a.storageKey);
    return "released" as const;
  } catch (e) {
    // Falha fechada: continua pendente; esgotadas as tentativas, vai para a quarentena.
    if (opts.lastAttempt) {
      await withTenant(scope, (tx) => quarantine(tx, organizationId, a.id, "technical_error"), db);
      return "quarantined" as const;
    }
    throw e;
  }
}

export function sanitizeJobHandler(deps: { db?: Db } = {}) {
  return async (job: ClaimedJob) => {
    const id = (job.payload as { attachmentId?: string } | null)?.attachmentId;
    if (!job.organization_id || !id) throw new Error("Job de anexo inválido.");
    await sanitizePending(job.organization_id, id, { lastAttempt: job.attempts >= job.max_attempts }, deps.db);
  };
}

// ---------- Download autenticado (RSG-18; CA-10.8) ----------

export interface DownloadFile {
  name: string;
  contentType: string;
  data: Buffer;
}

async function readReleased(organizationId: string, a: { id: string; status: string; storageKey: string | null; detectedType: string | null; originalNameSanitized: string }): Promise<DownloadFile> {
  if (a.status !== "released" || !a.storageKey || !a.detectedType) throw new DomainError("attachment_not_found", "");
  const data = await getStorage().get(a.storageKey);
  if (!data) throw new DomainError("attachment_not_found", "");
  return { name: a.originalNameSanitized, contentType: CONTENT_TYPE[a.detectedType as AttachmentKind], data };
}

/** Membro com acesso a chamados na organização do anexo. */
export async function downloadForMember(actor: TenantActor, attachmentId: string, db: Db = getDb()): Promise<DownloadFile> {
  await requirePermission(actor, "service.access", db);
  if (!isUuid(attachmentId)) throw new DomainError("attachment_not_found", "");
  const a = await withTenant(actor, (tx) => tx.attachment.findUnique({ where: { id: attachmentId } }), db);
  if (!a) throw new DomainError("attachment_not_found", "");
  return readReleased(actor.organizationId, a);
}

/** Mensagens que o portal pode ver (nota interna e mensagem não verificada nunca; RF-POR-04, CA-07.2). */
export const PORTAL_VISIBLE_KINDS: readonly MessageKind[] = ["customer_message", "public_reply"];

/** Sessão do portal: só anexos de chamados do contato, em mensagens públicas ou na abertura. */
export async function downloadForContact(organizationId: string, contactIds: string[], attachmentId: string, db: Db = getDb()): Promise<DownloadFile> {
  if (!isUuid(attachmentId)) throw new DomainError("attachment_not_found", "");
  const a = await withTenant({ organizationId }, (tx) =>
    tx.attachment.findUnique({ where: { id: attachmentId }, include: { ticket: { select: { contactId: true } }, message: { select: { kind: true, unverifiedSender: true } } } }), db);
  if (!a || !contactIds.includes(a.ticket.contactId)) throw new DomainError("attachment_not_found", "");
  if (a.message && (!PORTAL_VISIBLE_KINDS.includes(a.message.kind) || a.message.unverifiedSender)) throw new DomainError("attachment_not_found", "");
  return readReleased(organizationId, a);
}

/** Resposta HTTP do download: sempre como anexo, tipo fixado, nosniff, sem cache, sandbox (ADR-008 seção 4). */
export function downloadResponse(file: DownloadFile): Response {
  const ascii = file.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Content-Length": String(file.data.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "sandbox",
    },
  });
}
