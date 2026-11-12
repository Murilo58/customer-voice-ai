import { formatProtocol } from "@/lib/labels";
import { newId } from "@/lib/security";
import { getDb, type Db } from "@/server/db/client";
import { withTenant, type Tx } from "@/server/db/tenant";
import type { ClaimedJob } from "@/server/jobs/outbox";
import { enqueueJob } from "@/server/jobs/outbox";
import { csatSignature, magicLinkToken, replyToken } from "@/server/security/tokens";
import { REOPEN_WINDOW_DAYS } from "@/server/servicedesk/status";
import { appUrl, getEmailSender, inboundDomain, type EmailSender } from "./sender";

// E-mails transacionais (RF-EML-01) pela outbox (ADR-006, ADR-007).
// O conteúdo tem somente a mensagem nova e o link, nunca o histórico (RN-19; CA-10.6).
// Nota interna nunca gera e-mail (RN-09). Respostas voltam por r+{token}@ (RN-15a).

export const EMAIL_JOB = "email.send";
export type EmailTemplate = "ticket_created" | "public_reply" | "ticket_resolved" | "magic_link";

/** Marcador que separa a resposta nova do histórico citado (RF-EML-06). */
export const REPLY_MARKER = "##- Responda acima desta linha -##";

export interface QueueEmailInput {
  organizationId: string;
  ticketId?: string | null;
  messageId?: string | null;
  portalTokenId?: string | null;
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
      id, organizationId: input.organizationId, ticketId: input.ticketId ?? null, messageId: input.messageId ?? null, portalTokenId: input.portalTokenId ?? null,
      template: input.template, toAddress: input.to.toLowerCase(), rfcMessageId: `<${id}@${host}>`, idempotencyKey: input.idempotencyKey,
    },
    skipDuplicates: true,
  });
  if (created.count !== 1) return null;
  return enqueueJob(tx, { type: EMAIL_JOB, organizationId: input.organizationId, payload: { outboundEmailId: id }, idempotencyKey: id });
}

/** Acompanhamento pelo portal: o cliente pede o link mágico informando o e-mail (RF-POR-03). */
export function trackingLink(slug: string): string {
  return appUrl(`/p/${slug}/entrar`);
}

export function csatLink(slug: string, ticketId: string, resolutionSeq: number): string {
  return appUrl(`/p/${slug}/avaliar?t=${ticketId}&r=${resolutionSeq}&s=${csatSignature(ticketId, resolutionSeq)}`);
}

export function replyAddress(ticketId: string): string | undefined {
  const domain = inboundDomain();
  return domain ? `r+${replyToken(ticketId)}@${domain}` : undefined;
}

interface RenderVars {
  protocol: string | null;
  subject: string | null;
  organizationName: string;
  body: string | null;
  link: string;
  csatLink?: string | null;
  canReplyByEmail?: boolean;
}

export function renderEmail(template: EmailTemplate, v: RenderVars): { subject: string; text: string } {
  const marker = v.canReplyByEmail ? `${REPLY_MARKER}\n\n` : "";
  const footer = `\n\n—\n${v.organizationName}${v.protocol ? ` · Chamado ${v.protocol}` : ""}\nAcompanhe pelo link: ${v.link}\nNão inclua dados sensíveis na resposta.`;
  switch (template) {
    case "ticket_created":
      return {
        subject: `[${v.protocol}] Recebemos sua manifestação`,
        text: `${marker}Recebemos sua manifestação "${v.subject}". O protocolo é ${v.protocol}.${footer}`,
      };
    case "public_reply":
      return { subject: `[${v.protocol}] ${v.subject}`, text: `${marker}${v.body ?? ""}${footer}` };
    case "ticket_resolved":
      return {
        subject: `[${v.protocol}] Chamado resolvido`,
        text: `${marker}Seu chamado foi marcado como resolvido. Se o problema continuar, responda em até ${REOPEN_WINDOW_DAYS} dias para reabri-lo.`
          + (v.csatLink ? `\n\nComo foi o atendimento? Avalie de 1 a 5: ${v.csatLink}` : "") + footer,
      };
    case "magic_link":
      return {
        subject: `Acesso aos seus chamados — ${v.organizationName}`,
        text: `Use o link abaixo para acessar seus chamados. Ele funciona uma única vez e expira em 15 minutos.\n\n${v.link}\n\nSe você não pediu este acesso, ignore esta mensagem.\n\n—\n${v.organizationName}`,
      };
  }
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
          ticket: { select: { id: true, number: true, subject: true, contact: { select: { anonymizedAt: true } } } },
          organization: { select: { name: true, slug: true, ticketPrefix: true } },
        },
      }), db);
    // Já enviado ou descartado: entrega pelo menos uma vez, sem duplicar.
    if (!email || email.status !== "queued") return;
    const template = email.template as EmailTemplate;
    if ((template !== "magic_link" && !email.ticket) || email.ticket?.contact.anonymizedAt || (template === "magic_link" && !email.portalTokenId)) {
      await withTenant(scope, (tx) => tx.outboundEmail.update({ where: { id }, data: { status: "failed", lastError: "contact_anonymized" } }), db);
      return;
    }
    const slug = email.organization.slug;
    const resolvedSeq = /^resolved:[0-9a-f-]{36}:(\d+)$/.exec(email.idempotencyKey)?.[1];
    const content = renderEmail(template, {
      protocol: email.ticket ? formatProtocol(email.organization.ticketPrefix, email.ticket.number) : null,
      subject: email.ticket?.subject ?? null,
      organizationName: email.organization.name,
      body: email.message?.bodyText ?? null,
      link: template === "magic_link" ? appUrl(`/p/${slug}/acesso/${magicLinkToken(email.portalTokenId!)}`) : trackingLink(slug),
      csatLink: email.ticket && resolvedSeq ? csatLink(slug, email.ticket.id, Number(resolvedSeq)) : null,
      canReplyByEmail: !!email.ticket && !!inboundDomain(),
    });
    try {
      const r = await (deps.sender ?? getEmailSender()).send({
        to: email.toAddress, ...content, idempotencyKey: email.idempotencyKey, organizationId,
        replyTo: email.ticket ? replyAddress(email.ticket.id) : undefined,
      });
      await withTenant(scope, (tx) => tx.outboundEmail.update({ where: { id }, data: { status: "sent", sentAt: new Date(), providerEmailId: r.providerId, lastError: null } }), db);
    } catch (e) {
      const message = String((e as Error)?.message ?? e).slice(0, 300);
      const last = job.attempts >= job.max_attempts;
      await withTenant(scope, (tx) => tx.outboundEmail.update({ where: { id }, data: { lastError: message, ...(last ? { status: "failed" as const } : {}) } }), db);
      throw e;
    }
  };
}
