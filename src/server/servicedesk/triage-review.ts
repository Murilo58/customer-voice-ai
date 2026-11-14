import { TicketPriority, TicketType, type Prisma } from "@/generated/prisma/client";
import { newId } from "@/lib/security";
import { recordAudit } from "@/server/audit/audit";
import { getDb, type Db } from "@/server/db/client";
import { withTenant, type Tx } from "@/server/db/tenant";
import { DomainError } from "@/server/errors";
import { requirePermission, type TenantActor } from "@/server/organizations/service";
import { getTriageProvider, type TriageProvider } from "@/server/ai/provider";
import { REVIEWABLE_FIELDS, TRIAGE_JOB, loadTriageContext, type ReviewableField, type TriageField } from "@/server/ai/triage";
import { buildTriageInput, idempotencyKey } from "@/server/ai/triage-schema";
import { enqueueJob } from "@/server/jobs/outbox";
import { refreshSla } from "@/server/sla/service";

// Revisão humana da triagem (RF-TRI-05, RF-TRI-06; RN-11) e reprocessamento (RF-TRI-08).

async function latestRun(tx: Tx, ticketId: string) {
  return tx.triageRun.findFirst({
    where: { ticketId, status: "succeeded" },
    orderBy: { createdAt: "desc" },
    include: { reviews: { include: { reviewer: { select: { user: { select: { name: true } } } } } } },
  });
}

export async function getTriageView(actor: TenantActor, ticketId: string, db: Db = getDb()) {
  await requirePermission(actor, "service.access", db);
  return withTenant(actor, async (tx) => {
    const run = await latestRun(tx, ticketId);
    const lastAttempt = await tx.triageRun.findFirst({ where: { ticketId }, orderBy: { createdAt: "desc" }, select: { status: true, errorCode: true, createdAt: true, model: true } });
    // Motivo da última indisponibilidade (ai_disabled, quota_exhausted, global_budget ou falha), para explicar no painel.
    const unavailable = await tx.ticketEvent.findFirst({ where: { ticketId, type: "triage.unavailable" }, orderBy: { createdAt: "desc" }, select: { data: true } });
    const unavailableReason = ((unavailable?.data ?? {}) as { reason?: string }).reason ?? null;
    return { run, lastAttempt, unavailableReason };
  }, db);
}

/** Valida o valor escolhido por pessoa: enums fixos ou item ativo da taxonomia da organização. */
async function validateFieldValue(tx: Tx, field: ReviewableField, value: string): Promise<Prisma.TicketUncheckedUpdateInput> {
  if (field === "type") {
    if (!Object.values(TicketType).includes(value as TicketType)) throw new DomainError("invalid_type", "");
    return { type: value as TicketType };
  }
  if (field === "priority") {
    if (!Object.values(TicketPriority).includes(value as TicketPriority)) throw new DomainError("invalid_priority", "");
    return { priority: value as TicketPriority, priorityManual: true };
  }
  const exists = field === "category" ? await tx.category.findFirst({ where: { id: value, active: true } }) : await tx.reason.findFirst({ where: { id: value, active: true } });
  if (!exists) throw new DomainError(field === "category" ? "invalid_category" : "invalid_reason", "");
  return field === "category" ? { categoryId: value } : { reasonId: value };
}

async function finishIfReviewed(tx: Tx, ticketId: string, runId: string) {
  const pending = await tx.triageReview.count({ where: { triageRunId: runId, outcome: "pending" } });
  if (pending === 0) await tx.ticket.update({ where: { id: ticketId }, data: { triageState: "reviewed" } });
}

/** Campos com sugestão da IA ainda não revisada (RN-06; visão "Aguardando revisão da triagem"). */
export async function pendingReviewFields(tx: Tx, ticketId: string): Promise<string[]> {
  const run = await latestRun(tx, ticketId);
  return (run?.reviews ?? []).filter((r) => r.outcome === "pending").map((r) => r.field);
}

/**
 * Se houver sugestão pendente para o campo, registra aceito/alterado com os valores original e novo
 * (CA-08.3). Retorna false quando não havia sugestão pendente.
 */
export async function recordFieldReview(tx: Tx, actor: TenantActor, ticketId: string, field: TriageField, value: string | null): Promise<boolean> {
  const run = await latestRun(tx, ticketId);
  const review = run?.reviews.find((r) => r.field === field && r.outcome === "pending");
  if (!run || !review) return false;
  const outcome = review.suggestedValue === value ? "accepted" : "changed";
  await tx.triageReview.update({ where: { id: review.id }, data: { outcome, finalValue: value, reviewerMembershipId: actor.membershipId, reviewedAt: new Date() } });
  await tx.ticketEvent.create({ data: { id: newId(), organizationId: actor.organizationId, ticketId, type: "triage.field_reviewed", actorType: "user", actorId: actor.userId, data: { field, suggested: review.suggestedValue, final: value, outcome } } });
  await recordAudit(tx, { organizationId: actor.organizationId, actorType: "user", actorId: actor.userId, action: "triage.reviewed", targetType: "ticket", targetId: ticketId, details: { triageRunId: run.id, field, outcome } });
  await finishIfReviewed(tx, ticketId, run.id);
  return true;
}

/** "Confirmar todos": registra cada sugestão pendente como aceita, com revisor e data (CA-08.2). */
export async function confirmAllSuggestions(actor: TenantActor, ticketId: string, db: Db = getDb()) {
  await requirePermission(actor, "service.access", db);
  await withTenant(actor, async (tx) => {
    const run = await latestRun(tx, ticketId);
    if (!run) throw new DomainError("triage_not_found", "");
    const pending = run.reviews.filter((r) => r.outcome === "pending");
    if (!pending.length) throw new DomainError("nothing_to_review", "");
    const now = new Date();
    await tx.$executeRaw`UPDATE triage_reviews SET outcome = 'accepted', final_value = suggested_value,
      reviewer_membership_id = ${actor.membershipId}::uuid, reviewed_at = ${now}
      WHERE triage_run_id = ${run.id}::uuid AND outcome = 'pending'`;
    await tx.ticket.update({ where: { id: ticketId }, data: { triageState: "reviewed" } });
    await tx.ticketEvent.create({ data: { id: newId(), organizationId: actor.organizationId, ticketId, type: "triage.reviewed", actorType: "user", actorId: actor.userId, data: { accepted: pending.map((r) => r.field), changed: [] } } });
    await recordAudit(tx, { organizationId: actor.organizationId, actorType: "user", actorId: actor.userId, action: "triage.reviewed", targetType: "ticket", targetId: ticketId, details: { triageRunId: run.id, accepted: pending.length } });
  }, db);
}

/**
 * Revisa ou define um campo. Se houver sugestão pendente, registra aceito/alterado com os valores
 * original e novo; o modelo e a versão do prompt ficam na execução vinculada (CA-08.3).
 */
export async function setClassificationField(actor: TenantActor, ticketId: string, field: ReviewableField, value: string, db: Db = getDb()) {
  await requirePermission(actor, "service.access", db);
  if (!REVIEWABLE_FIELDS.includes(field)) throw new DomainError("invalid_field", "");
  await withTenant(actor, async (tx) => {
    const ticket = await tx.ticket.findUnique({ where: { id: ticketId }, select: { type: true, categoryId: true, reasonId: true, priority: true } });
    if (!ticket) throw new DomainError("ticket_not_found", "");
    const data = await validateFieldValue(tx, field, value);
    const current = { type: ticket.type, category: ticket.categoryId, reason: ticket.reasonId, priority: ticket.priority }[field];
    await tx.ticket.update({ where: { id: ticketId }, data });
    if (field === "priority" && current !== value) await refreshSla(tx, actor.organizationId, ticketId);
    const reviewed = await recordFieldReview(tx, actor, ticketId, field, value);
    if (!reviewed && current !== value) {
      await tx.ticketEvent.create({ data: { id: newId(), organizationId: actor.organizationId, ticketId, type: "ticket.field_changed", actorType: "user", actorId: actor.userId, data: { field, from: current, to: value } } });
    }
  }, db);
}

/**
 * Reprocessamento (RF-TRI-08). Sem forçar, só executa se a chave de idempotência mudou (RIA-06).
 * Forçado: justificativa obrigatória, auditado, consome cota e gera nova execução.
 */
export async function requestReprocess(
  actor: TenantActor,
  ticketId: string,
  opts: { force?: boolean; reason?: string } = {},
  deps: { provider?: TriageProvider; db?: Db } = {},
): Promise<"enqueued" | "unchanged"> {
  const db = deps.db ?? getDb();
  await requirePermission(actor, "triage.reprocess", db);
  const reason = (opts.reason ?? "").trim();
  if (opts.force && (reason.length < 10 || reason.length > 500)) throw new DomainError("reprocess_reason_required", "");
  const model = (deps.provider ?? getTriageProvider()).model;
  return withTenant(actor, async (tx) => {
    const ctx = await loadTriageContext(tx, ticketId);
    if (!ctx) throw new DomainError("ticket_not_found", "");
    const key = idempotencyKey(buildTriageInput(ctx.ticket, ctx.taxonomy), model);
    if (!opts.force) {
      const same = await tx.triageRun.findFirst({ where: { ticketId, idempotencyKey: key, forced: false } });
      if (same) return "unchanged";
      await enqueueJob(tx, { type: TRIAGE_JOB, organizationId: actor.organizationId, payload: { ticketId }, idempotencyKey: `${ticketId}:${key}` });
    } else {
      await enqueueJob(tx, {
        type: TRIAGE_JOB, organizationId: actor.organizationId, payload: { ticketId, forced: true, forcedReason: reason, forcedBy: actor.userId },
        idempotencyKey: `${ticketId}:forced:${newId()}`,
      });
      await recordAudit(tx, { organizationId: actor.organizationId, actorType: "user", actorId: actor.userId, action: "triage.reprocess_forced", targetType: "ticket", targetId: ticketId, details: { reason } });
    }
    await tx.ticketEvent.create({ data: { id: newId(), organizationId: actor.organizationId, ticketId, type: "triage.reprocess_requested", actorType: "user", actorId: actor.userId, data: { forced: !!opts.force } } });
    return "enqueued" as const;
  }, db);
}
