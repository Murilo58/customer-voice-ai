import { after } from "next/server";
import { handleResendEvent, verifySvixSignature } from "@/server/email/webhook";
import { defaultJobHandlers } from "@/server/jobs/handlers";
import { runJobById } from "@/server/jobs/outbox";

// Webhook do Resend (ADR-007). Sem segredo configurado ou assinatura inválida: recusado.
// Responde rápido; o processamento do recebimento roda após a resposta e pelo varredor.

export const dynamic = "force-dynamic";

const MAX_BODY = 256 * 1024;

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response("Not Found", { status: 404 });
  const body = await req.text();
  if (body.length > MAX_BODY) return new Response("Payload Too Large", { status: 413 });
  if (!verifySvixSignature(secret, req.headers, body)) return new Response("Unauthorized", { status: 401 });
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  const result = await handleResendEvent(req.headers.get("svix-id")!, payload);
  const jobId = result.jobId;
  if (jobId) after(() => runJobById(jobId, defaultJobHandlers()).catch((e) => console.error("[inbound] after", e)));
  return Response.json({ ok: true });
}
