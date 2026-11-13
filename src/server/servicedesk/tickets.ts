import { Prisma, TicketChannel, TicketPriority, TicketStatus, TicketType } from "@/generated/prisma/client";
import { formatProtocol, parseProtocol } from "@/lib/labels";
import { hashToken, isUuid, newId } from "@/lib/security";
import { replyToken } from "@/server/security/tokens";
import { recordAttachments, type PreparedFile } from "@/server/attachments/service";
import { getDb, type Db } from "@/server/db/client";
import { withTenant, type Tx } from "@/server/db/tenant";
import { DomainError } from "@/server/errors";
import { requirePermission, type TenantActor } from "@/server/organizations/service";
import { TRIAGE_JOB } from "@/server/ai/triage";
import { enqueueJob } from "@/server/jobs/outbox";
import { activeTeamIds, myTeamIds } from "@/server/organizations/teams";
import { ACTIVE_STATUSES } from "./status";
import { zonedDayStart as calendarDayStart } from "@/server/sla/calendar";
import { nextIntervals } from "@/server/sla/engine";
import { buildSnapshot, refreshSla } from "@/server/sla/service";

const MAX_BODY = 20_000;

function body(value: string, code: string, min = 1): string {
  const v = value.trim();
  if (v.length < min || v.length > MAX_BODY) throw new DomainError(code, "");
  return v;
}

function enumValue<T extends string>(values: Record<string, T>, value: string | null | undefined, code: string): T | null {
  if (value === null || value === undefined || value === "") return null;
  if (!Object.values(values).includes(value as T)) throw new DomainError(code, "");
  return value as T;
}

async function addEvent(tx: Tx, actor: TenantActor, ticketId: string, type: string, data: Record<string, unknown> = {}) {
  await tx.ticketEvent.create({
    data: { id: newId(), organizationId: actor.organizationId, ticketId, type, actorType: "user", actorId: actor.userId, data: data as Prisma.InputJsonValue },
  });
}

// ---------- Criação manual (RF-ATD-01, RF-ATD-02, RF-ATD-03; CA-19.1) ----------

export interface ManualTicketInput {
  contactId: string;
  subject: string;
  description: string;
  type?: string | null;
  priority?: string | null;
  teamId?: string | null;
}

export interface NewTicketData {
  id?: string;
  contactId: string;
  subject: string;
  description: string;
  channel: TicketChannel;
  type?: TicketType | null;
  priority?: TicketPriority | null;
  teamId?: string | null;
  parentTicketId?: string | null;
  createdBy: { type: "user"; userId: string } | { type: "contact"; contactId: string } | { type: "system" };
}

/**
 * Insere o chamado na transação corrente (já com contexto da organização): protocolo, snapshot de SLA,
 * token de resposta por e-mail (RN-15a), evento de criação e a tarefa de triagem (RF-TRI-01; CA-08.6).
 */
export async function insertTicket(tx: Tx, organizationId: string, data: NewTicketData) {
  const id = data.id ?? newId();
  // Protocolo sequencial por organização com bloqueio de linha (RN-01): nunca reutilizado.
  const [seq] = await tx.$queryRaw<{ ticket_seq: number; ticket_prefix: string; timezone: string; business_hours: unknown }[]>`
    UPDATE organizations SET ticket_seq = ticket_seq + 1 WHERE id = app_current_org() RETURNING ticket_seq, ticket_prefix, timezone, business_hours`;
  if (!seq) throw new DomainError("organization_not_found", "");
  // Calendário e metas vigentes na criação (CA-12.3); o relógio do SLA começa a correr (Novo).
  const now = new Date();
  const slaSnapshot = await buildSnapshot(tx, { timezone: seq.timezone, businessHours: seq.business_hours });
  const priority = data.priority ?? "medium";
  await tx.ticket.create({
    data: {
      id, organizationId, number: seq.ticket_seq, contactId: data.contactId, subject: data.subject, description: data.description, channel: data.channel,
      type: data.type ?? null, priority, teamId: data.teamId ?? null, parentTicketId: data.parentTicketId ?? null,
      // Sem prioridade escolhida, a triagem sugere pela RN-10.
      priorityManual: !!data.priority,
      replyTokenHash: hashToken(replyToken(id)),
      createdAt: now,
      slaSnapshot: slaSnapshot as unknown as Prisma.InputJsonValue,
      slaIntervals: nextIntervals([], null, "new", now) as unknown as Prisma.InputJsonValue,
    },
  });
  await refreshSla(tx, organizationId, id, now);
  const by = data.createdBy;
  await tx.ticketEvent.create({
    data: {
      id: newId(), organizationId, ticketId: id, type: "ticket.created",
      actorType: by.type, actorId: by.type === "user" ? by.userId : by.type === "contact" ? by.contactId : null,
      data: { channel: data.channel, priority, type: data.type ?? null, teamId: data.teamId ?? null, ...(data.parentTicketId ? { parentTicketId: data.parentTicketId } : {}) },
    },
  });
  const jobId = await enqueueJob(tx, { type: TRIAGE_JOB, organizationId, payload: { ticketId: id }, idempotencyKey: id });
  return { id, number: seq.ticket_seq, protocol: formatProtocol(seq.ticket_prefix, seq.ticket_seq), jobId };
}

export async function createManualTicket(actor: TenantActor, input: ManualTicketInput, db: Db = getDb()) {
  await requirePermission(actor, "service.access", db);
  const subject = input.subject.trim();
  if (subject.length < 1 || subject.length > 200) throw new DomainError("invalid_subject", "");
  const description = body(input.description, "invalid_description");
  const type = enumValue(TicketType, input.type, "invalid_type");
  const priority = enumValue(TicketPriority, input.priority, "invalid_priority");

  return withTenant(actor, async (tx) => {
    const contact = await tx.contact.findUnique({ where: { id: input.contactId }, select: { id: true, anonymizedAt: true } });
    if (!contact || contact.anonymizedAt) throw new DomainError("contact_not_found", "");
    const [teamId = null] = await activeTeamIds(tx, input.teamId ? [input.teamId] : []);
    return insertTicket(tx, actor.organizationId, {
      contactId: contact.id, subject, description, channel: "manual", type, priority, teamId, createdBy: { type: "user", userId: actor.userId },
    });
  }, db);
}

// ---------- Listagem, filtros, busca e visões (RF-ATD-10, RF-ATD-11, RF-ATD-12; CA-11.1 a CA-11.5) ----------

export const TICKET_VIEWS = ["mine", "team_unassigned", "sla_risk", "triage_review"] as const;
export const SLA_FILTERS = ["on_time", "at_risk", "breached"] as const;
export type TicketView = (typeof TICKET_VIEWS)[number];

export interface TicketFilters {
  q?: string;
  view?: string;
  status?: string;
  priority?: string;
  type?: string;
  channel?: string;
  teamId?: string;
  /** "me", "none" ou ID do vínculo */
  assignee?: string;
  categoryId?: string;
  risk?: string;
  /** Período de criação, AAAA-MM-DD no fuso da organização */
  from?: string;
  to?: string;
  /** Situação de SLA: no prazo, em risco ou violado (RF-ATD-10) */
  sla?: string;
  /** "sla" = menor prazo de SLA primeiro */
  sort?: string;
}

const LIST_LIMIT = 100;
/** Limite de candidatos ordenados por prazo de SLA em memória. */
const SLA_SORT_LIMIT = 5_000;

/** Situação de SLA de uma linha, a partir dos prazos gravados (RF-SLA-03). */
export function slaSituation(t: { firstResponseDueAt: Date | null; firstResponseRiskAt: Date | null; resolutionDueAt: Date | null; resolutionRiskAt: Date | null }, now = new Date()) {
  const passed = (d: Date | null) => !!d && d <= now;
  if (passed(t.firstResponseDueAt) || passed(t.resolutionDueAt)) return "breached" as const;
  if (passed(t.firstResponseRiskAt) || passed(t.resolutionRiskAt)) return "at_risk" as const;
  if (t.firstResponseDueAt || t.resolutionDueAt) return "on_time" as const;
  return null;
}

/** Início do dia no fuso da organização; datas inválidas viram erro de domínio. */
export function zonedDayStart(date: string, timeZone: string): Date {
  try {
    return calendarDayStart(date, timeZone);
  } catch {
    throw new DomainError("invalid_period", "");
  }
}

/** IDs que casam com a busca textual: índice GIN em assunto e descrição; nome e e-mail do contato (RF-ATD-11). */
async function searchTicketIds(tx: Tx, q: string): Promise<string[]> {
  const like = `%${q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT t.id FROM tickets t
    JOIN contacts c ON c.organization_id = t.organization_id AND c.id = t.contact_id
    WHERE to_tsvector('portuguese', t.subject || ' ' || t.description) @@ websearch_to_tsquery('portuguese', ${q})
       OR lower(t.subject) LIKE ${like}
       OR (c.anonymized_at IS NULL AND (lower(c.name) LIKE ${like} OR c.email LIKE ${like}))
    ORDER BY t.created_at DESC
    LIMIT 500`;
  return rows.map((r) => r.id);
}

export async function listTickets(actor: TenantActor, filters: TicketFilters = {}, db: Db = getDb()) {
  await requirePermission(actor, "service.access", db);
  const status = enumValue(TicketStatus, filters.status, "invalid_status");
  const priority = enumValue(TicketPriority, filters.priority, "invalid_priority");
  const type = enumValue(TicketType, filters.type, "invalid_type");
  const channel = enumValue(TicketChannel, filters.channel, "invalid_channel");
  const view = filters.view ? (TICKET_VIEWS.includes(filters.view as TicketView) ? (filters.view as TicketView) : null) : undefined;
  if (view === null) throw new DomainError("invalid_view", "");
  for (const id of [filters.teamId, filters.categoryId]) if (id && !isUuid(id)) throw new DomainError("invalid_filter", "");
  if (filters.assignee && !["me", "none"].includes(filters.assignee) && !isUuid(filters.assignee)) throw new DomainError("invalid_filter", "");
  if (filters.sla && !SLA_FILTERS.includes(filters.sla as (typeof SLA_FILTERS)[number])) throw new DomainError("invalid_filter", "");
  if (filters.sort && filters.sort !== "sla") throw new DomainError("invalid_filter", "");
  const now = new Date();
  const q = (filters.q ?? "").trim().slice(0, 100);
  const number = q ? parseProtocol(q) : null;

  return withTenant(actor, async (tx) => {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { ticketPrefix: true, timezone: true } });
    const and: Prisma.TicketWhereInput[] = [];
    if (status) and.push({ status });
    if (priority) and.push({ priority });
    if (type) and.push({ type });
    if (channel) and.push({ channel });
    if (filters.teamId) and.push({ teamId: filters.teamId });
    if (filters.categoryId) and.push({ categoryId: filters.categoryId });
    if (filters.risk === "1") and.push({ escalationRisk: true });
    if (filters.assignee) and.push({ assigneeMembershipId: filters.assignee === "me" ? actor.membershipId : filters.assignee === "none" ? null : filters.assignee });
    if (filters.from) and.push({ createdAt: { gte: zonedDayStart(filters.from, org.timezone) } });
    if (filters.to) and.push({ createdAt: { lt: new Date(zonedDayStart(filters.to, org.timezone).getTime() + 86_400_000) } });
    if (view === "mine") and.push({ assigneeMembershipId: actor.membershipId, status: { in: [...ACTIVE_STATUSES] } });
    if (view === "team_unassigned") and.push({ teamId: { in: await myTeamIds(tx, actor.membershipId) }, assigneeMembershipId: null, status: { in: [...ACTIVE_STATUSES] } });
    if (view === "triage_review") and.push({ triageState: "suggested" });
    // CA-11.3: 80% ou mais do prazo consumido, em chamados ativos
    if (view === "sla_risk") and.push({ status: { in: [...ACTIVE_STATUSES] }, OR: [{ firstResponseRiskAt: { lte: now } }, { resolutionRiskAt: { lte: now } }] });
    if (filters.sla) {
      const breached: Prisma.TicketWhereInput = { OR: [{ firstResponseDueAt: { lte: now } }, { resolutionDueAt: { lte: now } }] };
      const risk: Prisma.TicketWhereInput = { OR: [{ firstResponseRiskAt: { lte: now } }, { resolutionRiskAt: { lte: now } }] };
      and.push({ status: { in: [...ACTIVE_STATUSES] } });
      if (filters.sla === "breached") and.push(breached);
      // Negações explícitas com nulo: NOT sobre coluna nula não seleciona linha no SQL.
      const notPassed = (field: "firstResponseDueAt" | "firstResponseRiskAt" | "resolutionDueAt" | "resolutionRiskAt"): Prisma.TicketWhereInput => ({ OR: [{ [field]: null }, { [field]: { gt: now } }] });
      if (filters.sla === "at_risk") and.push(risk, notPassed("firstResponseDueAt"), notPassed("resolutionDueAt"));
      if (filters.sla === "on_time") and.push({ OR: [{ firstResponseDueAt: { gt: now } }, { resolutionDueAt: { gt: now } }] }, notPassed("firstResponseRiskAt"), notPassed("resolutionRiskAt"));
    }
    if (q) and.push(number ? { number } : { id: { in: await searchTicketIds(tx, q) } });

    // Ordenação pelo prazo de SLA mais próximo (primeira resposta ou resolução)
    let order: Map<string, number> | null = null;
    if (filters.sort === "sla") {
      const candidates = await tx.ticket.findMany({
        where: { AND: [...and, { OR: [{ firstResponseDueAt: { not: null } }, { resolutionDueAt: { not: null } }] }] },
        select: { id: true, firstResponseDueAt: true, resolutionDueAt: true },
        take: SLA_SORT_LIMIT,
      });
      const due = (c: (typeof candidates)[number]) => Math.min(c.firstResponseDueAt?.getTime() ?? Infinity, c.resolutionDueAt?.getTime() ?? Infinity);
      const ordered = candidates.sort((a, b) => due(a) - due(b)).map((c) => c.id);
      and.push({ id: { in: ordered.slice(0, LIST_LIMIT + 1) } });
      order = new Map(ordered.map((id, i) => [id, i]));
    }
    const rows = await tx.ticket.findMany({
      where: { AND: and },
      select: {
        id: true, number: true, subject: true, status: true, priority: true, type: true, channel: true, createdAt: true, triageState: true, escalationRisk: true,
        firstResponseDueAt: true, firstResponseRiskAt: true, resolutionDueAt: true, resolutionRiskAt: true,
        contact: { select: { name: true } },
        team: { select: { name: true } },
        assignee: { select: { user: { select: { name: true } } } },
      },
      orderBy: [{ createdAt: "desc" }, { number: "desc" }],
      take: LIST_LIMIT + 1,
    });
    if (order) rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return {
      rows: rows.slice(0, LIST_LIMIT).map((r) => ({ ...r, protocol: formatProtocol(org.ticketPrefix, r.number), sla: slaSituation(r, now) })),
      truncated: rows.length > LIST_LIMIT,
    };
  }, db);
}

// ---------- Detalhe e linha do tempo (RF-ATD-05; CA-18.2) ----------

export interface AttachmentView {
  id: string;
  name: string;
  status: string;
  sizeBytes: number;
  reason: string | null;
}

export type TimelineItem =
  | {
      kind: "message"; id: string; at: Date; messageKind: string; author: string | null; body: string; emailStatus: string | null;
      source: string; unverifiedSender: boolean; html: string | null; attachments: AttachmentView[];
    }
  | { kind: "event"; id: string; at: Date; type: string; actorName: string | null; data: unknown };

export async function getTicket(actor: TenantActor, number: number, db: Db = getDb()) {
  await requirePermission(actor, "service.access", db);
  return withTenant(actor, async (tx) => {
    const ticket = await tx.ticket.findUnique({
      where: { organizationId_number: { organizationId: actor.organizationId, number } },
      include: {
        contact: { select: { id: true, name: true, email: true, company: { select: { id: true, name: true } } } },
        organization: { select: { ticketPrefix: true } },
        category: { select: { id: true, name: true } },
        reason: { select: { id: true, name: true } },
        team: { select: { id: true, name: true, archivedAt: true } },
        assignee: { select: { id: true, user: { select: { name: true } } } },
      },
    });
    if (!ticket) return null;
    const [messages, events, attachments, csat] = await Promise.all([
      tx.ticketMessage.findMany({
        where: { ticketId: ticket.id },
        include: { author: { select: { user: { select: { name: true } } } }, authorContact: { select: { name: true } }, outbound: { select: { status: true } } },
        orderBy: { createdAt: "asc" },
      }),
      tx.ticketEvent.findMany({ where: { ticketId: ticket.id }, orderBy: { createdAt: "asc" } }),
      tx.attachment.findMany({ where: { ticketId: ticket.id }, orderBy: { createdAt: "asc" } }),
      tx.csatResponse.findMany({ where: { ticketId: ticket.id }, orderBy: { resolutionSeq: "asc" }, select: { resolutionSeq: true, score: true, comment: true, createdAt: true } }),
    ]);
    const view = (a: (typeof attachments)[number]): AttachmentView => ({ id: a.id, name: a.originalNameSanitized, status: a.status, sizeBytes: a.sizeBytes, reason: a.sanitizeReason });
    const byMessage = new Map<string, AttachmentView[]>();
    for (const a of attachments) if (a.messageId) byMessage.set(a.messageId, [...(byMessage.get(a.messageId) ?? []), view(a)]);
    // Nomes dos atores de eventos: membros da organização ativa (vínculos visíveis pelo RLS).
    const actorIds = [...new Set(events.map((e) => e.actorId).filter((v): v is string => !!v))];
    const members = actorIds.length
      ? await tx.membership.findMany({ where: { userId: { in: actorIds } }, select: { userId: true, user: { select: { name: true } } } })
      : [];
    const nameOf = new Map(members.map((m) => [m.userId, m.user.name]));
    // Nomes de responsáveis, equipes, categorias e motivos citados nos eventos (inclusive itens arquivados).
    const refs = events.flatMap((e) => (["ticket.assigned", "ticket.team_changed", "triage.field_reviewed", "ticket.field_changed"].includes(e.type) ? Object.values(e.data as Record<string, unknown>) : []))
      .filter((v): v is string => isUuid(v as string));
    const [refMembers, refTeams, refCategories, refReasons] = refs.length
      ? await Promise.all([
          tx.membership.findMany({ where: { id: { in: refs } }, select: { id: true, user: { select: { name: true } } } }),
          tx.team.findMany({ where: { id: { in: refs } }, select: { id: true, name: true } }),
          tx.category.findMany({ where: { id: { in: refs } }, select: { id: true, name: true } }),
          tx.reason.findMany({ where: { id: { in: refs } }, select: { id: true, name: true } }),
        ])
      : [[], [], [], []];
    const names: Record<string, string> = Object.fromEntries([
      ...refMembers.map((m) => [m.id, m.user.name]),
      ...[...refTeams, ...refCategories, ...refReasons].map((t) => [t.id, t.name]),
    ]);
    const timeline: TimelineItem[] = [
      ...messages.map((m) => ({
        kind: "message" as const, id: m.id, at: m.createdAt, messageKind: m.kind, body: m.bodyText,
        author: m.unverifiedSender ? `remetente externo, liberado por ${m.author?.user.name ?? "membro"}` : (m.author?.user.name ?? m.authorContact?.name ?? null),
        emailStatus: m.outbound[0]?.status ?? null, source: m.source, unverifiedSender: m.unverifiedSender, html: m.bodyHtmlSanitized, attachments: byMessage.get(m.id) ?? [],
      })),
      ...events.map((e) => ({ kind: "event" as const, id: e.id, at: e.createdAt, type: e.type, actorName: e.actorId ? (nameOf.get(e.actorId) ?? null) : null, data: e.data })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime() || (a.kind === "event" ? -1 : 1));
    const { organization, ...rest } = ticket;
    // Anexos da abertura (sem mensagem) e avaliações (CSAT) aparecem no topo do chamado.
    const openingAttachments = attachments.filter((a) => !a.messageId).map(view);
    return { ticket: { ...rest, protocol: formatProtocol(organization.ticketPrefix, ticket.number) }, timeline, names, openingAttachments, csat };
  }, db);
}

// ---------- Notas internas (RF-ATD-04, parte interna) ----------

export async function addInternalNote(actor: TenantActor, ticketId: string, text: string, opts: { files?: PreparedFile[] } = {}, db: Db = getDb()) {
  await requirePermission(actor, "service.access", db);
  const bodyText = body(text, "invalid_note");
  const id = newId();
  try {
    return await withTenant(actor, async (tx) => {
      await tx.ticketMessage.create({
        data: { id, organizationId: actor.organizationId, ticketId, kind: "internal_note", authorMembershipId: actor.membershipId, bodyText },
      });
      const r = opts.files?.length ? await recordAttachments(tx, actor.organizationId, { ticketId, messageId: id }, "user", opts.files) : null;
      return { id, rejected: r?.rejected ?? [] };
    }, db);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") throw new DomainError("ticket_not_found", "");
    throw e;
  }
}

// ---------- Classificação manual: tipo e prioridade, com histórico ----------

export async function updateTicketFields(actor: TenantActor, ticketId: string, input: { type?: string | null; priority?: string | null }, db: Db = getDb()) {
  await requirePermission(actor, "service.access", db);
  const type = enumValue(TicketType, input.type, "invalid_type");
  const priority = enumValue(TicketPriority, input.priority, "invalid_priority");
  await withTenant(actor, async (tx) => {
    const t = await tx.ticket.findUnique({ where: { id: ticketId }, select: { type: true, priority: true } });
    if (!t) throw new DomainError("ticket_not_found", "");
    const data: Prisma.TicketUpdateInput = {};
    if (type && type !== t.type) {
      data.type = type;
      await addEvent(tx, actor, ticketId, "ticket.field_changed", { field: "type", from: t.type, to: type });
    }
    if (priority && priority !== t.priority) {
      data.priority = priority;
      data.priorityManual = true;
      await addEvent(tx, actor, ticketId, "ticket.field_changed", { field: "priority", from: t.priority, to: priority });
    }
    if (Object.keys(data).length) await tx.ticket.update({ where: { id: ticketId }, data });
    // Mudar a prioridade recalcula o prazo a partir da criação (RN-24).
    if (data.priority) await refreshSla(tx, actor.organizationId, ticketId);
  }, db);
}
