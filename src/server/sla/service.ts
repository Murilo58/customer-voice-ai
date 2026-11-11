import { Prisma, TicketPriority } from "@/generated/prisma/client";
import { newId } from "@/lib/security";
import { getDb, type Db } from "@/server/db/client";
import { withTenant, type Tx } from "@/server/db/tenant";
import type { ClaimedJob } from "@/server/jobs/outbox";
import { enqueueJob } from "@/server/jobs/outbox";
import { requirePermission, type TenantActor } from "@/server/organizations/service";
import { businessSeconds, parseWeek, type Calendar } from "./calendar";
import { computeSla, METRICS, type Interval, type Metric, type SlaSnapshot } from "./engine";

// Persistência do SLA: prazos para filtros e visões, registro único de risco e violação
// (RF-SLA-04, RF-SLA-05; CA-12.2, CA-12.5) e verificação agendada pela outbox.

export const SLA_JOB = "sla.check";
/** Margem para o job não rodar antes do instante por diferença de relógio. */
const JOB_MARGIN_MS = 5_000;

export async function holidaySet(tx: Tx): Promise<Set<string>> {
  const rows = await tx.holiday.findMany({ select: { date: true } });
  return new Set(rows.map((r) => r.date.toISOString().slice(0, 10)));
}

/** Snapshot do calendário e das metas na criação do chamado. */
export async function buildSnapshot(tx: Tx, org: { timezone: string; businessHours: unknown }): Promise<SlaSnapshot> {
  const policies = await tx.slaPolicy.findMany();
  return {
    timezone: org.timezone,
    week: parseWeek(org.businessHours),
    policies: Object.fromEntries(policies.map((p) => [p.priority, { firstResponseMinutes: p.firstResponseMinutes, resolutionMinutes: p.resolutionMinutes, businessHours: p.businessHours }])),
  };
}

export function snapshotCalendar(snapshot: SlaSnapshot, holidays: ReadonlySet<string>): Calendar {
  return { timezone: snapshot.timezone, week: snapshot.week, holidays };
}

/** Tempo em horas úteis entre a criação e o marco (indicadores RN-40, RN-41). */
export async function businessSecondsFor(tx: Tx, snapshot: unknown, from: Date, to: Date): Promise<number | null> {
  if (!snapshot) return null;
  return businessSeconds(from, to, snapshotCalendar(snapshot as SlaSnapshot, await holidaySet(tx)));
}

async function recipients(tx: Tx, assigneeMembershipId: string | null): Promise<string[]> {
  const managers = await tx.membership.findMany({ where: { status: "active", role: "manager", executiveRead: false }, select: { id: true } });
  const ids = new Set(managers.map((m) => m.id));
  if (assigneeMembershipId) {
    const a = await tx.membership.findUnique({ where: { id: assigneeMembershipId }, select: { status: true } });
    if (a?.status === "active") ids.add(assigneeMembershipId);
  }
  if (ids.size === 0) {
    const admins = await tx.membership.findMany({ where: { status: "active", role: "admin" }, select: { id: true } });
    admins.forEach((m) => ids.add(m.id));
  }
  return [...ids];
}

/**
 * Recalcula o SLA do chamado: grava prazos, registra uma única vez o risco e a violação de cada meta
 * já cruzados e agenda as próximas verificações. Chamado em toda mudança de status, prioridade ou resposta.
 */
export async function refreshSla(tx: Tx, organizationId: string, ticketId: string, now = new Date()): Promise<void> {
  const t = await tx.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, status: true, priority: true, firstRespondedAt: true, resolvedAt: true, cancelledAt: true, slaSnapshot: true, slaIntervals: true, assigneeMembershipId: true },
  });
  if (!t || !t.slaSnapshot) return;
  const holidays = await holidaySet(tx);
  const sla = computeSla({ ...t, snapshot: t.slaSnapshot as unknown as SlaSnapshot, intervals: t.slaIntervals as unknown as Interval[] }, now, holidays);
  await tx.ticket.update({
    where: { id: t.id },
    data: {
      firstResponseDueAt: sla.first_response.dueAt, firstResponseRiskAt: sla.first_response.riskAt,
      resolutionDueAt: sla.resolution.dueAt, resolutionRiskAt: sla.resolution.riskAt,
    },
  });

  const existing = await tx.slaEvent.findMany({ where: { ticketId: t.id }, select: { metric: true, kind: true } });
  const has = new Set(existing.map((e) => `${e.metric}:${e.kind}`));
  const fresh: { metric: Metric; kind: "risk" | "breach"; at: Date }[] = [];
  for (const m of METRICS) {
    const c = sla[m].crossed;
    if (c.risk && !has.has(`${m}:risk`)) fresh.push({ metric: m, kind: "risk", at: c.risk });
    if (c.breach && !has.has(`${m}:breach`)) fresh.push({ metric: m, kind: "breach", at: c.breach });
  }
  if (fresh.length) {
    // Único por chamado e meta (índice único): execuções concorrentes não duplicam.
    const inserted = await tx.slaEvent.createMany({
      data: fresh.map((f) => ({ id: newId(), organizationId, ticketId: t.id, metric: f.metric, kind: f.kind, occurredAt: f.at })),
      skipDuplicates: true,
    });
    if (inserted.count === fresh.length) {
      // Se risco e violação forem cruzados juntos, só a violação gera alerta.
      const alerts = fresh.filter((f) => f.kind === "breach" || !fresh.some((x) => x.metric === f.metric && x.kind === "breach"));
      const to = await recipients(tx, t.assigneeMembershipId);
      await tx.notification.createMany({
        data: alerts.flatMap((a) => to.map((membershipId) => ({
          id: newId(), organizationId, membershipId, ticketId: t.id, type: `sla.${a.kind}`, data: { metric: a.metric, at: a.at.toISOString() } as Prisma.InputJsonValue,
        }))),
      });
      await tx.ticketEvent.createMany({
        data: fresh.map((f) => ({ id: newId(), organizationId, ticketId: t.id, type: `sla.${f.kind}`, actorType: "system" as const, data: { metric: f.metric, at: f.at.toISOString() } })),
      });
    }
  }

  // Próximas verificações (risco e prazo futuros)
  for (const m of METRICS) {
    for (const [kind, at] of [["risk", sla[m].riskAt], ["breach", sla[m].dueAt]] as const) {
      if (!at || at <= now || has.has(`${m}:${kind}`)) continue;
      await enqueueJob(tx, {
        type: SLA_JOB, organizationId, payload: { ticketId: t.id, at: at.toISOString() },
        idempotencyKey: `${t.id}:${m}:${kind}:${at.toISOString()}`, runAfter: new Date(at.getTime() + JOB_MARGIN_MS),
      });
    }
  }
}

export function slaJobHandler(deps: { db?: Db } = {}) {
  return async (job: ClaimedJob) => {
    const p = job.payload as { ticketId?: string; at?: string } | null;
    if (!job.organization_id || !p?.ticketId) throw new Error("Job de SLA inválido.");
    // Antes do instante (relógio): nova tentativa pela espera exponencial da outbox.
    if (p.at && Date.now() < new Date(p.at).getTime()) throw new Error("sla_check_early");
    await withTenant({ organizationId: job.organization_id }, (tx) => refreshSla(tx, job.organization_id!, p.ticketId!), deps.db ?? getDb());
  };
}

export const PRIORITIES = Object.values(TicketPriority);

/** Tempo restante e situação de cada meta para exibição no chamado (RF-SLA-03; CA-12.4). */
export async function getTicketSla(actor: TenantActor, ticketId: string, db: Db = getDb()) {
  await requirePermission(actor, "service.access", db);
  return withTenant(actor, async (tx) => {
    const t = await tx.ticket.findUnique({
      where: { id: ticketId },
      select: { status: true, priority: true, firstRespondedAt: true, resolvedAt: true, cancelledAt: true, slaSnapshot: true, slaIntervals: true },
    });
    if (!t?.slaSnapshot) return null;
    return computeSla({ ...t, snapshot: t.slaSnapshot as unknown as SlaSnapshot, intervals: t.slaIntervals as unknown as Interval[] }, new Date(), await holidaySet(tx));
  }, db);
}
