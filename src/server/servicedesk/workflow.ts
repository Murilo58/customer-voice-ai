import { Prisma, TicketStatus } from "@/generated/prisma/client";
import { isUuid, newId } from "@/lib/security";
import { getDb, type Db } from "@/server/db/client";
import { withTenant, type Tx } from "@/server/db/tenant";
import { queueEmail } from "@/server/email/outbound";
import { DomainError } from "@/server/errors";
import type { ClaimedJob } from "@/server/jobs/outbox";
import { enqueueJob } from "@/server/jobs/outbox";
import { can } from "@/server/organizations/permissions";
import { requirePermission, type TenantActor } from "@/server/organizations/service";
import { myTeamIds } from "@/server/organizations/teams";
import { nextIntervals, type Interval } from "@/server/sla/engine";
import { businessSecondsFor, refreshSla } from "@/server/sla/service";
import { canTransition, REOPEN_WINDOW_DAYS, resolutionBlockers } from "./status";
import { pendingReviewFields, recordFieldReview } from "./triage-review";

// Fluxo do atendimento (I-3): status (RN-05, RN-06, RN-07), atribuição (RF-ATD-06),
// equipe e respostas públicas (RF-ATD-04, RF-EML-01).

export const AUTOCLOSE_JOB = "ticket.autoclose";
const MAX_BODY = 20_000;

type Actor = { type: "user"; actor: TenantActor } | { type: "system"; organizationId: string };

async function event(tx: Tx, who: Actor, ticketId: string, type: string, data: Record<string, unknown>) {
  const organizationId = who.type === "user" ? who.actor.organizationId : who.organizationId;
  await tx.ticketEvent.create({
    data: {
      id: newId(), organizationId, ticketId, type, data: data as Prisma.InputJsonValue,
      actorType: who.type, actorId: who.type === "user" ? who.actor.userId : null,
    },
  });
}

function ticketId(id: string): string {
  if (!isUuid(id)) throw new DomainError("ticket_not_found", "");
  return id;
}

/**
 * Aplica a transição com verificação otimista do status atual: duas ações simultâneas
 * não produzem transição inválida (a segunda recebe "ticket_changed").
 */
async function transition(
  tx: Tx,
  who: Actor,
  t: SlaTicketRow,
  to: TicketStatus,
  extra: Prisma.TicketUncheckedUpdateManyInput = {},
  data: Record<string, unknown> = {},
) {
  if (!canTransition(t.status, to, who.type)) throw new DomainError("invalid_transition", "");
  const now = new Date();
  const fields: Prisma.TicketUncheckedUpdateManyInput = { status: to, ...extra };
  // Relógio do SLA: corre em Novo/Aberto, pausa nos demais (RN-21, RN-22)
  fields.slaIntervals = nextIntervals(t.slaIntervals as unknown as Interval[], t.status, to, now) as unknown as Prisma.InputJsonValue;
  if (to === "resolved") {
    Object.assign(fields, { resolvedAt: now, resolutionSeq: { increment: 1 }, resolutionBusinessSecs: await businessSecondsFor(tx, t.slaSnapshot, t.createdAt, now) });
  }
  if (t.status === "resolved" && to === "open") fields.resolvedAt = null;
  if (to === "closed") fields.closedAt = now;
  if (to === "cancelled") fields.cancelledAt = now;
  const r = await tx.ticket.updateMany({ where: { id: t.id, status: t.status }, data: fields });
  if (r.count !== 1) throw new DomainError("ticket_changed", "");
  await event(tx, who, t.id, "ticket.status_changed", { from: t.status, to, ...data });
  await refreshSla(tx, who.type === "user" ? who.actor.organizationId : who.organizationId, t.id, now);
  if (to === "resolved") {
    const organizationId = who.type === "user" ? who.actor.organizationId : who.organizationId;
    const seq = t.resolutionSeq + 1;
    // Fechamento automático após o prazo de reabertura (RN-07): job agendado, ignorado se reaberto.
    await enqueueJob(tx, {
      type: AUTOCLOSE_JOB, organizationId, payload: { ticketId: t.id, resolutionSeq: seq },
      idempotencyKey: `${t.id}:${seq}`, runAfter: new Date(now.getTime() + REOPEN_WINDOW_DAYS * 86_400_000),
    });
  }
}

const SLA_FIELDS = { id: true, status: true, resolutionSeq: true, slaIntervals: true, slaSnapshot: true, createdAt: true } as const;
type SlaTicketRow = { id: string; status: TicketStatus; resolutionSeq: number; slaIntervals: Prisma.JsonValue; slaSnapshot: Prisma.JsonValue; createdAt: Date };

async function loadTicket(tx: Tx, id: string) {
  const t = await tx.ticket.findUnique({
    where: { id },
    select: {
      ...SLA_FIELDS, type: true, categoryId: true, teamId: true, assigneeMembershipId: true, firstRespondedAt: true,
      contact: { select: { email: true, anonymizedAt: true } },
    },
  });
  if (!t) throw new DomainError("ticket_not_found", "");
  return t;
}

// ---------- Status (RF-ATD-07; RN-05, RN-06; CA-10.2, CA-10.3) ----------

export async function changeStatus(actor: TenantActor, id: string, to: string, opts: { reason?: string } = {}, db: Db = getDb()) {
  await requirePermission(actor, "service.access", db);
  if (!Object.values(TicketStatus).includes(to as TicketStatus)) throw new DomainError("invalid_status", "");
  const target = to as TicketStatus;
  const reason = (opts.reason ?? "").trim();
  if (target === "cancelled" && (reason.length < 5 || reason.length > 500)) throw new DomainError("cancel_reason_required", "");
  await withTenant(actor, async (tx) => {
    const t = await loadTicket(tx, ticketId(id));
    const who: Actor = { type: "user", actor };
    if (!canTransition(t.status, target)) throw new DomainError("invalid_transition", "");
    if (target === "resolved") {
      const blockers = resolutionBlockers({ type: t.type, categoryId: t.categoryId, pendingReviewFields: await pendingReviewFields(tx, t.id) });
      if (blockers.length) throw new DomainError("resolution_blocked", "");
    }
    await transition(tx, who, t, target, target === "cancelled" ? { cancelReason: reason } : {}, target === "cancelled" ? { reason } : {});
    if (target === "resolved" && !t.contact.anonymizedAt) {
      await queueEmail(tx, {
        organizationId: actor.organizationId, ticketId: t.id, template: "ticket_resolved", to: t.contact.email,
        idempotencyKey: `resolved:${t.id}:${t.resolutionSeq + 1}`,
      });
    }
  }, db);
}

/** Fecha automaticamente se continuar resolvido na mesma resolução (RN-07). Idempotente. */
export async function autoCloseTicket(organizationId: string, payload: { ticketId: string; resolutionSeq: number }, db: Db = getDb()) {
  return withTenant({ organizationId }, async (tx) => {
    const t = await tx.ticket.findUnique({ where: { id: payload.ticketId }, select: SLA_FIELDS });
    if (!t || t.status !== "resolved" || t.resolutionSeq !== payload.resolutionSeq) return "skipped" as const;
    await transition(tx, { type: "system", organizationId }, t, "closed", {}, { auto: true });
    return "closed" as const;
  }, db);
}

export function autoCloseJobHandler(deps: { db?: Db } = {}) {
  return async (job: ClaimedJob) => {
    if (!job.organization_id) throw new Error("Job de fechamento sem organização.");
    await autoCloseTicket(job.organization_id, job.payload as { ticketId: string; resolutionSeq: number }, deps.db);
  };
}

// ---------- Atribuição (RF-ATD-06; CA-10.5) ----------

const ASSIGNABLE: readonly TicketStatus[] = ["new", "open", "waiting_customer", "waiting_third_party"];

async function setAssignee(tx: Tx, actor: TenantActor, t: { id: string; assigneeMembershipId: string | null }, to: string | null) {
  if (t.assigneeMembershipId === to) return;
  await tx.ticket.update({ where: { id: t.id }, data: { assigneeMembershipId: to } });
  await event(tx, { type: "user", actor }, t.id, "ticket.assigned", { from: t.assigneeMembershipId, to });
}

/** O atendente assume chamados da fila das suas equipes; chamado sem equipe está na fila geral. */
export async function assumeTicket(actor: TenantActor, id: string, db: Db = getDb()) {
  await requirePermission(actor, "service.access", db);
  await withTenant(actor, async (tx) => {
    const t = await loadTicket(tx, ticketId(id));
    if (!ASSIGNABLE.includes(t.status)) throw new DomainError("ticket_not_assignable", "");
    if (t.teamId && !can(actor.role, "tickets.assign", actor.executiveRead) && !(await myTeamIds(tx, actor.membershipId)).includes(t.teamId)) {
      throw new DomainError("not_team_member", "");
    }
    await setAssignee(tx, actor, t, actor.membershipId);
    // Novo → Aberto ao ser assumido (RN-05).
    if (t.status === "new") await transition(tx, { type: "user", actor }, t, "open", {}, { auto: "assumed" });
  }, db);
}

/** Gestor/Administrador atribui ou reatribui a um membro ativo da equipe do chamado (ou remove o responsável). */
export async function assignTicket(actor: TenantActor, id: string, membershipId: string | null, db: Db = getDb()) {
  await requirePermission(actor, "tickets.assign", db);
  await withTenant(actor, async (tx) => {
    const t = await loadTicket(tx, ticketId(id));
    if (!ASSIGNABLE.includes(t.status)) throw new DomainError("ticket_not_assignable", "");
    if (membershipId) {
      if (!isUuid(membershipId)) throw new DomainError("member_not_found", "");
      const m = await tx.membership.findUnique({ where: { id: membershipId }, select: { status: true, executiveRead: true, teamLinks: { select: { teamId: true } } } });
      if (!m || m.status !== "active" || m.executiveRead) throw new DomainError("member_not_found", "");
      if (t.teamId && !m.teamLinks.some((l) => l.teamId === t.teamId)) throw new DomainError("assignee_not_in_team", "");
    }
    await setAssignee(tx, actor, t, membershipId);
  }, db);
}

/** Troca a equipe (fila). Revisa a sugestão de equipe da IA, se houver; responsável fora da nova equipe é removido. */
export async function setTicketTeam(actor: TenantActor, id: string, teamId: string | null, db: Db = getDb()) {
  await requirePermission(actor, "tickets.assign", db);
  await withTenant(actor, async (tx) => {
    const t = await loadTicket(tx, ticketId(id));
    if (teamId) {
      if (!isUuid(teamId)) throw new DomainError("invalid_team", "");
      const team = await tx.team.findUnique({ where: { id: teamId }, select: { archivedAt: true } });
      if (!team || team.archivedAt) throw new DomainError("invalid_team", "");
    }
    const reviewed = await recordFieldReview(tx, actor, t.id, "team", teamId);
    if (t.teamId === teamId) return;
    await tx.ticket.update({ where: { id: t.id }, data: { teamId } });
    if (!reviewed) await event(tx, { type: "user", actor }, t.id, "ticket.team_changed", { from: t.teamId, to: teamId });
    if (teamId && t.assigneeMembershipId) {
      const inTeam = await tx.teamMember.findFirst({ where: { teamId, membershipId: t.assigneeMembershipId } });
      if (!inTeam) await setAssignee(tx, actor, t, null);
    }
  }, db);
}

// ---------- Resposta pública (RF-ATD-04; RF-EML-01; CA-10.1) ----------

const REPLYABLE: readonly TicketStatus[] = ["new", "open", "waiting_customer", "waiting_third_party"];

export async function addPublicReply(actor: TenantActor, id: string, text: string, db: Db = getDb()) {
  await requirePermission(actor, "service.access", db);
  const bodyText = text.trim();
  if (bodyText.length < 1 || bodyText.length > MAX_BODY) throw new DomainError("invalid_reply", "");
  const messageId = newId();
  return withTenant(actor, async (tx) => {
    const t = await loadTicket(tx, ticketId(id));
    if (!REPLYABLE.includes(t.status)) throw new DomainError("ticket_not_replyable", "");
    if (t.contact.anonymizedAt) throw new DomainError("contact_anonymized", "");
    await tx.ticketMessage.create({ data: { id: messageId, organizationId: actor.organizationId, ticketId: t.id, kind: "public_reply", authorMembershipId: actor.membershipId, bodyText } });
    if (!t.firstRespondedAt) {
      // Primeira resposta pública humana encerra a meta de primeira resposta (RN-20, RN-40).
      const now = new Date();
      await tx.ticket.update({ where: { id: t.id }, data: { firstRespondedAt: now, firstResponseBusinessSecs: await businessSecondsFor(tx, t.slaSnapshot, t.createdAt, now) } });
    }
    // Novo → Aberto ao ser respondido (RN-05).
    if (t.status === "new") await transition(tx, { type: "user", actor }, t, "open", {}, { auto: "replied" });
    else await refreshSla(tx, actor.organizationId, t.id);
    const jobId = await queueEmail(tx, { organizationId: actor.organizationId, ticketId: t.id, messageId, template: "public_reply", to: t.contact.email, idempotencyKey: `reply:${messageId}` });
    return { messageId, jobId };
  }, db);
}
