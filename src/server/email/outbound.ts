import { formatProtocol } from "@/lib/labels";
import { newId } from "@/lib/security";
import { getDb, type Db } from "@/server/db/client";
import { withTenant, type Tx } from "@/server/db/tenant";
import type { ClaimedJob } from "@/server/jobs/outbox";
import { enqueueJob } from "@/server/jobs/outbox";
import { REOPEN_WINDOW_DAYS } from "@/server/servicedesk/status";
import { appUrl, getEmailSender, type EmailSender } from "./sender";

// E-mails transacionais do atendimento (RF-EML-01) pela outbox (ADR-006, ADR-007).
// O conteúdo tem somente a mensagem nova e o link de acompanhamento, nunca o histórico (RN-19; CA-10.6).
// Nota interna nunca gera e-mail (RN-09).

export const EMAIL_JOB = "email.send";
export type EmailTemplate = "public_reply" | "ticket_resolved";

export interface QueueEmailInput {
  organizationId: string;
  ticketId: string;
  messageId?: string | null;
  template: EmailTemplate;
  to: string;
  idempotencyKey: string;
}

/** Registra o e-mail e o job na transação do fato que o origina. Repetição com a mesma chave não duplica. */
export async function queueEmail(tx: Tx, input: QueueEmailInput): Promise<string | null> {
  const id = newId();
  const host = new URL(appUrl("/")).hostname;
  const created = await tx.outboundEmail.createMany({
    data: {
      id, organizationId: input.organizationId, ticketId: input.ticketId, messageId: input.messageId ?? null, template: input.template,
      toAddress: input.to.toLowerCase(), rfcMessageId: `<${id}@${host}>`, idempotencyKey: input.idempotencyKey,
    },
    skipDuplicates: true,
  });
  if (created.count !== 1) return null;
  return enqueueJob(tx, { type: EMAIL_JOB, organizationId: input.organizationId, payload: { outboundEmailId: id }, idempotencyKey: id });
}

/** Link de acompanhamento pelo portal do cliente (rota pública entregue no I-4). */
export function trackingLink(slug: string): string {
  return appUrl(`/p/${slug}`);
}

export function renderEmail(
  template: EmailTemplate,
  v: { protocol: string; subject: string; organizationName: string; body: string | null; link: string },
): { subject: string; text: string } {
  const footer = `\n\n—\n${v.organizationName} · Chamado ${v.protocol}\nAcompanhe pelo link: ${v.link}\nNão inclua dados sensíveis na resposta.`;
  if (template === "public_reply") return { subject: `[${v.protocol}] ${v.subject}`, text: `${v.body ?? ""}${footer}` };
  return {
    subject: `[${v.protocol}] Chamado resolvido`,
    text: `Seu chamado foi marcado como resolvido. Se o problema continuar, você pode reabri-lo em até ${REOPEN_WINDOW_DAYS} dias.${footer}`,
  };
}

export function emailJobHandler(deps: { sender?: EmailSender; db?: Db } = {}) {
  return async (job: ClaimedJob) => {
    const db = deps.db ?? getDb();
    const organizationId = job.organization_id;
    const id = (job.payload as { outboundEmailId?: string } | null)?.outboundEmailId;
    if (!organizationId || !id) throw new Error("Job de e-mail inválido.");
    const scope = { organizationId };
    const email = await withTenant(scope, (tx) =>
      tx.outboundEmail.findUnique({
        where: { id },
        include: {
          message: { select: { bodyText: true } },
          ticket: { select: { number: true, subject: true, contact: { select: { anonymizedAt: true } } } },
          organization: { select: { name: true, slug: true, ticketPrefix: true } },
        },
      }), db);
    // Já enviado ou descartado: entrega pelo menos uma vez, sem duplicar.
    if (!email || email.status !== "queued") return;
    if (!email.ticket || email.ticket.contact.anonymizedAt) {
      await withTenant(scope, (tx) => tx.outboundEmail.update({ where: { id }, data: { status: "failed", lastError: "contact_anonymized" } }), db);
      return;
    }
    const content = renderEmail(email.template as EmailTemplate, {
      protocol: formatProtocol(email.organization.ticketPrefix, email.ticket.number),
      subject: email.ticket.subject,
      organizationName: email.organization.name,
      body: email.message?.bodyText ?? null,
      link: trackingLink(email.organization.slug),
    });
    try {
      const r = await (deps.sender ?? getEmailSender()).send({ to: email.toAddress, ...content, messageId: email.rfcMessageId, idempotencyKey: email.idempotencyKey });
      await withTenant(scope, (tx) => tx.outboundEmail.update({ where: { id }, data: { status: "sent", sentAt: new Date(), providerEmailId: r.providerId, lastError: null } }), db);
    } catch (e) {
      const message = String((e as Error)?.message ?? e).slice(0, 300);
      const last = job.attempts >= job.max_attempts;
      await withTenant(scope, (tx) => tx.outboundEmail.update({ where: { id }, data: { lastError: message, ...(last ? { status: "failed" as const } : {}) } }), db);
      throw e;
    }
  };
}
