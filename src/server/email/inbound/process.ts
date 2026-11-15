import { hashToken, newId } from "@/lib/security";
import { prepareFiles, putInQuarantine, recordAttachments, type IncomingFile, type PreparedFile } from "@/server/attachments/service";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_MESSAGE, sanitizeFileName } from "@/server/attachments/policy";
import { getDb, type Db } from "@/server/db/client";
import { withReplyToken, withTenant, type Tx } from "@/server/db/tenant";
import { inboundDomain } from "@/server/email/sender";
import type { ClaimedJob } from "@/server/jobs/outbox";
import { enqueueJob } from "@/server/jobs/outbox";
import { resolvePortalOrg } from "@/server/portal/service";
import { createCustomerTicket, validName } from "@/server/servicedesk/customer";
import { addCustomerMessage } from "@/server/servicedesk/workflow";
import {
  authFailed, classifyRecipients, contentHash, extractReply, htmlToText, isAutomated, MAX_INBOUND_TEXT,
  parseAddress, sanitizeEmailHtml, type InboundEmail,
} from "./parse";
import { getInboundProvider, inboundApiKey, type InboundProvider } from "./provider";

// Recebimento de e-mail (ADR-007; RF-EML-02 a 06, RF-EML-08; RN-15 a RN-19).
// Webhook/reconciliação → inbound_receipts (plataforma, só o id do provedor) → job inbound.process:
// obtém a mensagem pela API, resolve a organização pelo destinatário e classifica.

export const INBOUND_JOB = "inbound.process";
export const RECONCILE_JOB = "inbound.reconcile";
const LOOP_LIMIT_PER_HOUR = 10;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

/** Registra o recebimento (idempotente pelo id do provedor) e cria o job de processamento. */
export async function registerReceipt(providerEmailId: string, db: Db = getDb()): Promise<string | null> {
  if (!/^[A-Za-z0-9-]{8,80}$/.test(providerEmailId)) return null;
  return db.$transaction(async (tx) => {
    const id = newId();
    const r = await tx.inboundReceipt.createMany({ data: { id, providerEmailId }, skipDuplicates: true });
    if (r.count !== 1) return null;
    return enqueueJob(tx as Tx, { type: INBOUND_JOB, organizationId: null, payload: { receiptId: id }, idempotencyKey: providerEmailId });
  });
}

type Decision =
  | { kind: "discard"; reason: string }
  | { kind: "reply"; organizationId: string; ticketId: string }
  | { kind: "new"; organizationId: string }
  | { kind: "quarantine"; organizationId: string; reason: string };

/** RN-15 (a, b) e RN-17 (iii, iv): vínculo pelo token r+ e organização pelo endereço {slug}@. */
export async function decideTarget(email: InboundEmail, domain: string, db: Db = getDb()): Promise<Decision> {
  const recipients = classifyRecipients([...email.receivedFor, ...email.to, ...email.cc], domain);
  const orgIds = new Set<string>();
  for (const slug of new Set(recipients.flatMap((r) => (r.kind === "org" ? [r.slug] : [])))) {
    const org = await resolvePortalOrg(slug, db);
    if (org) orgIds.add(org.id);
  }
  const tokens = [...new Set(recipients.flatMap((r) => (r.kind === "reply" ? [r.token] : [])))];
  if (!tokens.length) {
    const [orgId] = [...orgIds];
    return orgId ? { kind: "new", organizationId: orgId } : { kind: "discard", reason: "no_recipient" };
  }
  const tickets: { organizationId: string; id: string }[] = [];
  for (const token of tokens) {
    if (token === "invalid") continue;
    const t = await withReplyToken(hashToken(token), (tx) => tx.ticket.findFirst({ where: { replyTokenHash: hashToken(token) }, select: { organizationId: true, id: true } }), db);
    if (t) tickets.push(t);
  }
  const anyInvalid = tickets.length < tokens.length;
  const [firstOrg] = [...orgIds];
  if (!tickets.length) {
    // Token inválido, expirado ou de outra plataforma (RN-17 iii): quarentena da organização do endereço, se houver.
    return firstOrg ? { kind: "quarantine", organizationId: firstOrg, reason: "invalid_token" } : { kind: "discard", reason: "invalid_token" };
  }
  const t = tickets[0]!;
  // Vínculos contraditórios: tokens de chamados diferentes, token inválido junto, ou endereço de outra organização (RN-17 iv; RN-15 b).
  const contradictory = tickets.some((x) => x.id !== t.id) || anyInvalid || [...orgIds].some((o) => o !== t.organizationId);
  if (contradictory) return { kind: "quarantine", organizationId: t.organizationId, reason: "contradictory_links" };
  return { kind: "reply", organizationId: t.organizationId, ticketId: t.id };
}

interface Target {
  ticketId: string;
  messageId: string | null;
}

/** Classifica e grava na organização. Retorna o destino dos anexos (mensagem associada ou abertura). */
async function classifyAndStore(tx: Tx, email: InboundEmail, decision: Exclude<Decision, { kind: "discard" }>, db?: Db): Promise<Target | null> {
  const organizationId = decision.organizationId;
  const from = parseAddress(email.from);
  const html = email.html ? sanitizeEmailHtml(email.html) : null;
  const fullText = (email.text ?? (html ? htmlToText(html) : "")).slice(0, MAX_INBOUND_TEXT + 1);
  const subject = email.subject.replace(/\s+/g, " ").trim().slice(0, 200);
  const hash = contentHash(from.address, subject, fullText);
  const meta = email.attachments.map((a) => ({ id: a.id, name: sanitizeFileName(a.filename), type: a.contentType.slice(0, 100), size: a.size }));
  const inboundId = newId();
  const base = {
    id: inboundId, organizationId, providerEmailId: email.providerId, messageId: email.messageId?.slice(0, 500) ?? null,
    fromAddress: from.address.slice(0, 254), fromName: from.name, toAddresses: [...email.to, ...email.cc].slice(0, 50).map((a) => a.slice(0, 254)),
    subject, bodyText: fullText.slice(0, MAX_INBOUND_TEXT), bodyHtmlSanitized: html, authSpf: email.auth?.spf ?? null, authDkim: email.auth?.dkim ?? null,
    authDmarc: email.auth?.dmarc ?? null, contentHash: hash, attachmentsMeta: meta,
  };
  const store = (classification: "new_ticket" | "associated" | "automated" | "quarantined" | "duplicate" | "rejected", reason: string | null, ticketId: string | null = null, extra: { possibleDuplicate?: boolean } = {}) =>
    tx.inboundMessage.create({ data: { ...base, classification, reason, ticketId, ...extra } });
  const toQuarantine = async (reason: string) => {
    await store("quarantined", reason, decision.kind === "reply" ? decision.ticketId : null);
    await tx.quarantineItem.create({ data: { id: newId(), organizationId, inboundMessageId: inboundId, reason } });
    return null;
  };

  // RN-18: Message-ID já processado na organização.
  if (email.messageId && (await tx.inboundMessage.findFirst({ where: { messageId: email.messageId.slice(0, 500) }, select: { id: true } }))) {
    await store("duplicate", "message_id");
    return null;
  }
  // RN-19: acima do limite de tamanho.
  if (fullText.length > MAX_INBOUND_TEXT || (email.sizeBytes ?? 0) > 25 * 1024 * 1024) {
    await store("rejected", "too_large");
    return null;
  }
  // RN-16: mensagens automáticas não geram chamado nem resposta.
  const automated = isAutomated(email);
  if (automated) {
    await store("automated", automated);
    return null;
  }
  if (decision.kind === "quarantine") return toQuarantine(decision.reason);
  // RN-16: proteção contra loop — mais de 10 mensagens do mesmo remetente em 1 hora.
  const recent = await tx.inboundMessage.count({ where: { fromAddress: base.fromAddress, createdAt: { gt: new Date(Date.now() - 3_600_000) } } });
  if (recent >= LOOP_LIMIT_PER_HOUR) return toQuarantine("loop_protection");
  if (email.spam) return toQuarantine("spam");
  const possibleDuplicate = !email.messageId
    && !!(await tx.inboundMessage.findFirst({ where: { contentHash: hash, createdAt: { gt: new Date(Date.now() - DUPLICATE_WINDOW_MS) } }, select: { id: true } }));

  if (decision.kind === "reply") {
    const ticket = await tx.ticket.findUnique({ where: { id: decision.ticketId }, select: { id: true, contact: { select: { id: true, email: true, anonymizedAt: true } } } });
    if (!ticket || ticket.contact.anonymizedAt) return toQuarantine("invalid_token");
    // RN-15 c / RN-17 i e ii: remetente diferente do contato ou falha de autenticação.
    if (ticket.contact.email !== from.address) return toQuarantine("sender_mismatch");
    if (authFailed(email.auth)) return toQuarantine("auth_failed");
    const reply = extractReply(fullText) || fullText.trim() || "(mensagem sem texto)";
    await store("associated", possibleDuplicate ? "possible_duplicate" : null, ticket.id, { possibleDuplicate });
    const r = await addCustomerMessage(tx, organizationId, ticket.id, ticket.contact.id, { text: reply, html, source: "email", inboundMessageId: inboundId });
    if (r.createdTicket) {
      await tx.inboundMessage.update({ where: { id: inboundId }, data: { classification: "new_ticket", reason: "follow_up", ticketId: r.ticketId } });
      return { ticketId: r.ticketId, messageId: null };
    }
    return { ticketId: r.ticketId, messageId: r.messageId ?? null };
  }

  // Nova manifestação (CA-06.1; CA-06.6: protocolo no assunto não associa).
  const created = await createCustomerTicket(tx, organizationId, {
    email: from.address, name: validName(from.name ?? "", from.address), subject: subject || "(sem assunto)",
    description: (fullText.trim() || "(mensagem sem texto)").slice(0, 20_000), channel: "email", limitAutoEmail: true,
  }, db);
  await store("new_ticket", possibleDuplicate ? "possible_duplicate" : null, created.id, { possibleDuplicate });
  return { ticketId: created.id, messageId: null };
}

/** Anexos do e-mail: mesmas validações do portal (RF-EML-05; CA-06.5). Falha de download vira "recusado". */
async function fetchAttachments(provider: InboundProvider, email: InboundEmail): Promise<PreparedFile[]> {
  const incoming: IncomingFile[] = [];
  const failed: PreparedFile[] = [];
  for (const meta of email.attachments.slice(0, MAX_ATTACHMENTS_PER_MESSAGE + 1)) {
    if (meta.size > MAX_ATTACHMENT_BYTES || incoming.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
      incoming.push({ name: meta.filename, size: meta.size, declaredType: meta.contentType, content: Buffer.alloc(0) });
      continue;
    }
    try {
      const content = await provider.attachment(email.providerId, meta);
      incoming.push({ name: meta.filename, size: content.length, declaredType: meta.contentType, content });
    } catch {
      failed.push({ id: newId(), name: sanitizeFileName(meta.filename), declaredType: meta.contentType.slice(0, 100), size: Math.min(meta.size, MAX_ATTACHMENT_BYTES), rejected: "empty" });
    }
  }
  return [...prepareFiles(incoming), ...failed];
}

export async function processReceipt(receiptId: string, deps: { provider?: InboundProvider; db?: Db } = {}) {
  const db = deps.db ?? getDb();
  const receipt = await db.inboundReceipt.findUnique({ where: { id: receiptId } });
  if (!receipt || receipt.status !== "pending") return "skipped" as const;
  const finish = (status: "processed" | "discarded", reason: string | null, organizationId: string | null = null) =>
    db.inboundReceipt.update({ where: { id: receiptId }, data: { status, reason, organizationId, processedAt: new Date() } });
  const domain = inboundDomain();
  if (!domain) throw new Error("INBOUND_EMAIL_DOMAIN não configurado.");
  const provider = deps.provider ?? getInboundProvider();
  const email = await provider.get(receipt.providerEmailId);
  if (!email) return finish("discarded", "not_found").then(() => "discarded" as const);
  const decision = await decideTarget(email, domain, db);
  // Destinatário sem organização: descartado e registrado só no recebimento, sem conteúdo (DATA_MODEL 3.7).
  if (decision.kind === "discard") return finish("discarded", decision.reason).then(() => "discarded" as const);
  const scope = { organizationId: decision.organizationId };

  // Reprocessamento: a mensagem já gravada não é classificada de novo; só os anexos pendentes são concluídos.
  const target = await withTenant(scope, async (tx) => {
    const existing = await tx.inboundMessage.findUnique({ where: { providerEmailId: email.providerId }, select: { id: true, classification: true, ticketId: true } });
    if (existing) {
      if (!existing.ticketId || (existing.classification !== "associated" && existing.classification !== "new_ticket")) return null;
      const msg = await tx.ticketMessage.findFirst({ where: { inboundMessageId: existing.id }, select: { id: true } });
      const t: Target = { ticketId: existing.ticketId, messageId: existing.classification === "associated" ? (msg?.id ?? null) : null };
      const already = await tx.attachment.count({ where: { ticketId: t.ticketId, messageId: t.messageId, uploadedBy: "email" } });
      return already ? null : t;
    }
    return classifyAndStore(tx, email, decision, db);
  }, db);

  if (target && email.attachments.length) {
    const files = await fetchAttachments(provider, email);
    await putInQuarantine(decision.organizationId, files);
    await withTenant(scope, (tx) => recordAttachments(tx, decision.organizationId, target, "email", files), db);
  }
  await finish("processed", null, decision.organizationId);
  return "processed" as const;
}

export function inboundJobHandler(deps: { provider?: InboundProvider; db?: Db } = {}) {
  return async (job: ClaimedJob) => {
    const id = (job.payload as { receiptId?: string } | null)?.receiptId;
    if (!id) throw new Error("Job de recebimento inválido.");
    await processReceipt(id, deps);
  };
}

/** Reconciliação: registra recebimentos que não chegaram por webhook (endpoint desativado ou falha). */
export async function reconcileInbound(deps: { provider?: InboundProvider; db?: Db } = {}) {
  const provider = deps.provider ?? getInboundProvider();
  let registered = 0;
  for (const id of await provider.listRecent(50)) if (await registerReceipt(id, deps.db)) registered++;
  return registered;
}

export function reconcileJobHandler(deps: { provider?: InboundProvider; db?: Db } = {}) {
  return async () => {
    await reconcileInbound(deps);
  };
}

/** Agenda a reconciliação a cada 10 minutos (chamado pelo varredor), se o recebimento estiver configurado. */
export async function scheduleReconcile(db: Db = getDb()) {
  if (!inboundDomain() || !inboundApiKey()) return null;
  const slot = Math.floor(Date.now() / 600_000);
  return db.$transaction((tx) => enqueueJob(tx as Tx, { type: RECONCILE_JOB, organizationId: null, payload: {}, idempotencyKey: `reconcile:${slot}`, maxAttempts: 1 }));
}
