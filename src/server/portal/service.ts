import { Prisma } from "@/generated/prisma/client";
import { formatProtocol } from "@/lib/labels";
import { generateToken, hashToken, isUuid, newId } from "@/lib/security";
import { prepareFiles, putInQuarantine, PORTAL_VISIBLE_KINDS, type IncomingFile } from "@/server/attachments/service";
import { recordAudit } from "@/server/audit/audit";
import { getDb, type Db } from "@/server/db/client";
import { withPublicSlug, withTenant } from "@/server/db/tenant";
import { queueEmail } from "@/server/email/outbound";
import { DomainError } from "@/server/errors";
import { hitRateLimit, RATE_RULES } from "@/server/security/rate-limit";
import { magicLinkToken, rateKey, verifyCsatSignature } from "@/server/security/tokens";
import { verifyTurnstile, type TurnstileVerifier } from "@/server/security/turnstile";
import { createCustomerTicket, validEmail, validName } from "@/server/servicedesk/customer";
import { addCustomerMessage } from "@/server/servicedesk/workflow";

// Portal público do cliente (RF-POR-01 a 06). Identidade própria: link mágico de uso único (15 min)
// e sessão de portal (24 h) por organização. O cliente só vê os próprios chamados, sem notas internas,
// triagem, eventos internos ou mensagens em quarentena (CA-07.2).

export const PORTAL_COOKIE = "cva_portal";
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
export const PORTAL_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface PortalDeps {
  db?: Db;
  verifyBot?: TurnstileVerifier;
}

export interface PortalOrg {
  id: string;
  name: string;
  slug: string;
  ticketPrefix: string;
}

/** Organização ativa pelo slug (pré-contexto público). Suspensa ou inexistente: null. */
export async function resolvePortalOrg(slug: string, db: Db = getDb()): Promise<PortalOrg | null> {
  if (!/^[a-z0-9-]{3,48}$/.test(slug)) return null;
  return withPublicSlug(slug, (tx) => tx.organization.findFirst({ where: { slug, status: "active" }, select: { id: true, name: true, slug: true, ticketPrefix: true } }), db);
}

async function requireOrg(slug: string, db?: Db): Promise<PortalOrg> {
  const org = await resolvePortalOrg(slug, db);
  if (!org) throw new DomainError("portal_not_found", "");
  return org;
}

async function botCheck(token: string, ip: string, deps: PortalDeps) {
  if (!(await (deps.verifyBot ?? verifyTurnstile)(token, ip))) throw new DomainError("bot_check_failed", "");
}

function text(value: string, code: string, min: number, max: number): string {
  const v = value.trim();
  if (v.length < min || v.length > max) throw new DomainError(code, "");
  return v;
}

// ---------- Abertura pelo formulário público (RF-POR-01, RF-POR-02; CA-05.1 a CA-05.4) ----------

export interface PortalTicketInput {
  name: string;
  email: string;
  subject: string;
  description: string;
  botToken: string;
  ip: string;
  files?: IncomingFile[];
}

export async function submitPortalTicket(slug: string, input: PortalTicketInput, deps: PortalDeps = {}) {
  const org = await requireOrg(slug, deps.db);
  await botCheck(input.botToken, input.ip, deps);
  const email = validEmail(input.email);
  const name = validName(input.name);
  const subject = text(input.subject, "invalid_subject", 3, 200);
  const description = text(input.description, "invalid_description", 10, 20_000);
  if (!(await hitRateLimit(rateKey("portal_submit_ip", org.id, input.ip), RATE_RULES.portalSubmitIp, deps.db))
    || !(await hitRateLimit(rateKey("portal_submit_email", org.id, email), RATE_RULES.portalSubmitEmail, deps.db))) {
    throw new DomainError("rate_limited", "");
  }
  const files = prepareFiles(input.files ?? []);
  await putInQuarantine(org.id, files);
  const created = await withTenant({ organizationId: org.id }, (tx) =>
    createCustomerTicket(tx, org.id, { email, name, subject, description, channel: "portal", files }, deps.db), deps.db);
  return { protocol: created.protocol, number: created.number, rejected: created.rejected, jobIds: [created.jobId, created.emailJobId].filter((v): v is string => !!v) };
}

// ---------- Link mágico (RF-POR-03; CA-07.1) ----------

/** Resposta idêntica com ou sem contato cadastrado (sem enumeração de e-mails). */
export async function requestMagicLink(slug: string, input: { email: string; botToken: string; ip: string }, deps: PortalDeps = {}) {
  const org = await requireOrg(slug, deps.db);
  await botCheck(input.botToken, input.ip, deps);
  const email = validEmail(input.email);
  if (!(await hitRateLimit(rateKey("magic_ip", input.ip), RATE_RULES.magicLinkIp, deps.db))
    || !(await hitRateLimit(rateKey("magic_email", org.id, email), RATE_RULES.magicLinkEmail, deps.db))) {
    throw new DomainError("rate_limited", "");
  }
  return withTenant({ organizationId: org.id }, async (tx) => {
    const contact = await tx.contact.findFirst({ where: { email, anonymizedAt: null }, select: { id: true } });
    if (!contact) return { jobId: null };
    const id = newId();
    await tx.portalAccessToken.create({ data: { id, organizationId: org.id, contactId: contact.id, tokenHash: hashToken(magicLinkToken(id)), expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS) } });
    const jobId = await queueEmail(tx, { organizationId: org.id, portalTokenId: id, template: "magic_link", to: email, idempotencyKey: `magic:${id}` });
    return { jobId };
  }, deps.db);
}

/** Consome o link (uso único, atômico) e abre a sessão do portal. */
export async function consumeMagicLink(slug: string, token: string, db: Db = getDb()) {
  const org = await requireOrg(slug, db);
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new DomainError("magic_link_invalid", "");
  const tokenHash = hashToken(token);
  return withTenant({ organizationId: org.id }, async (tx) => {
    const now = new Date();
    const t = await tx.portalAccessToken.findUnique({ where: { tokenHash }, select: { id: true, contactId: true, contact: { select: { anonymizedAt: true } } } });
    if (!t || t.contact.anonymizedAt) throw new DomainError("magic_link_invalid", "");
    const used = await tx.portalAccessToken.updateMany({ where: { id: t.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (used.count !== 1) throw new DomainError("magic_link_invalid", "");
    const session = generateToken();
    const expiresAt = new Date(now.getTime() + PORTAL_SESSION_TTL_MS);
    await tx.portalSession.create({ data: { id: newId(), organizationId: org.id, contactId: t.contactId, sessionHash: session.tokenHash, expiresAt } });
    await recordAudit(tx, { organizationId: org.id, actorType: "contact", actorId: t.contactId, action: "portal.login", targetType: "contact", targetId: t.contactId });
    return { sessionToken: session.token, expiresAt };
  }, db);
}

// ---------- Sessão do portal ----------

export interface PortalSessionInfo {
  organization: PortalOrg;
  contact: { id: string; name: string; email: string };
  /** O contato é único por e-mail na organização (índice único); a lista protege o vínculo histórico. */
  contactIds: string[];
  sessionHash: string;
}

export async function getPortalSession(slug: string, sessionToken: string | undefined, db: Db = getDb()): Promise<PortalSessionInfo | null> {
  if (!sessionToken || !/^[A-Za-z0-9_-]{20,100}$/.test(sessionToken)) return null;
  const org = await resolvePortalOrg(slug, db);
  if (!org) return null;
  const sessionHash = hashToken(sessionToken);
  return withTenant({ organizationId: org.id }, async (tx) => {
    const s = await tx.portalSession.findUnique({ where: { sessionHash }, select: { expiresAt: true, revokedAt: true, contact: { select: { id: true, name: true, email: true, anonymizedAt: true } } } });
    if (!s || s.revokedAt || s.expiresAt.getTime() <= Date.now() || s.contact.anonymizedAt) return null;
    return { organization: org, contact: { id: s.contact.id, name: s.contact.name, email: s.contact.email }, contactIds: [s.contact.id], sessionHash };
  }, db);
}

export async function logoutPortal(session: PortalSessionInfo, db: Db = getDb()) {
  await withTenant({ organizationId: session.organization.id }, (tx) =>
    tx.portalSession.updateMany({ where: { sessionHash: session.sessionHash, revokedAt: null }, data: { revokedAt: new Date() } }), db);
}

// ---------- Chamados do contato (RF-POR-04; CA-07.2) ----------

export async function listPortalTickets(session: PortalSessionInfo, db: Db = getDb()) {
  const rows = await withTenant({ organizationId: session.organization.id }, (tx) =>
    tx.ticket.findMany({
      where: { contactId: { in: session.contactIds } },
      select: { number: true, subject: true, status: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }), db);
  return rows.map((t) => ({ ...t, protocol: formatProtocol(session.organization.ticketPrefix, t.number) }));
}

export interface PortalAttachment {
  id: string;
  name: string;
  status: string;
  sizeBytes: number;
}

export async function getPortalTicket(session: PortalSessionInfo, number: number, db: Db = getDb()) {
  if (!Number.isInteger(number) || number < 1) return null;
  return withTenant({ organizationId: session.organization.id }, async (tx) => {
    const t = await tx.ticket.findFirst({
      where: { number, contactId: { in: session.contactIds } },
      select: { id: true, number: true, subject: true, description: true, status: true, createdAt: true, resolutionSeq: true, parentTicketId: true },
    });
    if (!t) return null;
    const [messages, attachments, csat] = await Promise.all([
      tx.ticketMessage.findMany({
        where: { ticketId: t.id, kind: { in: [...PORTAL_VISIBLE_KINDS] }, unverifiedSender: false },
        select: { id: true, kind: true, bodyText: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      tx.attachment.findMany({
        where: { ticketId: t.id, OR: [{ messageId: null }, { message: { kind: { in: [...PORTAL_VISIBLE_KINDS] }, unverifiedSender: false } }] },
        select: { id: true, messageId: true, originalNameSanitized: true, status: true, sizeBytes: true },
        orderBy: { createdAt: "asc" },
      }),
      tx.csatResponse.findFirst({ where: { ticketId: t.id, resolutionSeq: t.resolutionSeq }, select: { score: true } }),
    ]);
    const att = (a: (typeof attachments)[number]): PortalAttachment => ({ id: a.id, name: a.originalNameSanitized, status: a.status, sizeBytes: a.sizeBytes });
    return {
      protocol: formatProtocol(session.organization.ticketPrefix, t.number),
      number: t.number, subject: t.subject, description: t.description, status: t.status, createdAt: t.createdAt, ticketId: t.id,
      openingAttachments: attachments.filter((a) => !a.messageId).map(att),
      // Respostas da equipe aparecem como "Atendimento"; o nome do atendente não é exposto.
      messages: messages.map((m) => ({ id: m.id, fromCustomer: m.kind === "customer_message", body: m.bodyText, createdAt: m.createdAt, attachments: attachments.filter((a) => a.messageId === m.id).map(att) })),
      canRate: (t.status === "resolved" || t.status === "closed") && t.resolutionSeq > 0 && !csat,
      rated: csat?.score ?? null,
      resolutionSeq: t.resolutionSeq,
      canReply: t.status !== "cancelled",
    };
  }, db);
}

export async function portalReply(session: PortalSessionInfo, number: number, input: { text: string; files?: IncomingFile[] }, db: Db = getDb()) {
  if (!(await hitRateLimit(rateKey("portal_reply", session.sessionHash), RATE_RULES.portalReply, db))) throw new DomainError("rate_limited", "");
  const bodyText = text(input.text, "invalid_reply", 1, 20_000);
  const orgId = session.organization.id;
  const files = prepareFiles(input.files ?? []);
  await putInQuarantine(orgId, files);
  return withTenant({ organizationId: orgId }, async (tx) => {
    const t = await tx.ticket.findFirst({ where: { number, contactId: { in: session.contactIds } }, select: { id: true, status: true } });
    if (!t) throw new DomainError("ticket_not_found", "");
    if (t.status === "cancelled") throw new DomainError("ticket_not_replyable", "");
    return addCustomerMessage(tx, orgId, t.id, session.contact.id, { text: bodyText, source: "portal", files });
  }, db);
}

// ---------- CSAT (RF-POR-05; CA-13.1) ----------

export interface CsatInput {
  ticketId: string;
  resolutionSeq: number;
  score: number;
  comment?: string | null;
}

/** Avaliação pelo portal (sessão) ou pelo link assinado do e-mail. Uma vez por resolução. */
export async function submitCsat(slug: string, input: CsatInput, auth: { session: PortalSessionInfo } | { signature: string }, db: Db = getDb()) {
  const org = await requireOrg(slug, db);
  if (!isUuid(input.ticketId) || !Number.isInteger(input.resolutionSeq) || input.resolutionSeq < 1) throw new DomainError("csat_invalid", "");
  if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) throw new DomainError("csat_invalid_score", "");
  const comment = (input.comment ?? "").trim().slice(0, 1000) || null;
  if ("signature" in auth && !verifyCsatSignature(input.ticketId, input.resolutionSeq, auth.signature)) throw new DomainError("csat_invalid", "");
  if ("session" in auth && auth.session.organization.id !== org.id) throw new DomainError("csat_invalid", "");
  return withTenant({ organizationId: org.id }, async (tx) => {
    const t = await tx.ticket.findUnique({ where: { id: input.ticketId }, select: { id: true, status: true, resolutionSeq: true, contactId: true } });
    if (!t || ("session" in auth && !auth.session.contactIds.includes(t.contactId))) throw new DomainError("csat_invalid", "");
    // Só Resolvido ou Fechado e só para a resolução vigente (CA-13.1).
    if ((t.status !== "resolved" && t.status !== "closed") || t.resolutionSeq !== input.resolutionSeq) throw new DomainError("csat_not_available", "");
    try {
      await tx.$executeRaw`SAVEPOINT csat_insert`;
      await tx.csatResponse.create({ data: { id: newId(), organizationId: org.id, ticketId: t.id, resolutionSeq: t.resolutionSeq, score: input.score, comment } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT csat_insert`;
        throw new DomainError("csat_already", "");
      }
      throw e;
    }
    await tx.ticketEvent.create({
      data: { id: newId(), organizationId: org.id, ticketId: t.id, type: "ticket.csat_received", actorType: "contact", actorId: t.contactId, data: { score: input.score, resolutionSeq: t.resolutionSeq } },
    });
    return { score: input.score };
  }, db);
}

/** Dados do link de avaliação do e-mail (sem sessão): protocolo e estado. */
export async function csatLinkInfo(slug: string, ticketId: string, resolutionSeq: number, signature: string, db: Db = getDb()) {
  const org = await resolvePortalOrg(slug, db);
  if (!org || !isUuid(ticketId) || !Number.isInteger(resolutionSeq) || !verifyCsatSignature(ticketId, resolutionSeq, signature)) return null;
  return withTenant({ organizationId: org.id }, async (tx) => {
    const t = await tx.ticket.findUnique({ where: { id: ticketId }, select: { number: true, status: true, resolutionSeq: true } });
    if (!t) return null;
    const done = await tx.csatResponse.findFirst({ where: { ticketId, resolutionSeq }, select: { score: true } });
    const available = (t.status === "resolved" || t.status === "closed") && t.resolutionSeq === resolutionSeq && !done;
    return { organization: org, protocol: formatProtocol(org.ticketPrefix, t.number), available, rated: done?.score ?? null };
  }, db);
}
