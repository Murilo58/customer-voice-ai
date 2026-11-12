import { Prisma, TicketChannel } from "@/generated/prisma/client";
import { isUuid } from "@/lib/security";
import { getDb, type Db } from "@/server/db/client";
import { withTenant, type Tx } from "@/server/db/tenant";
import { DomainError } from "@/server/errors";
import { requirePermission, type TenantActor } from "@/server/organizations/service";
import { localDate, zonedDayStart } from "@/server/sla/calendar";

// Dashboard operacional (RF-DSH-01 a 04). Todos os indicadores vêm de consultas ao banco, com as
// definições de RN-40 a RN-45 e RN-13; nenhum valor é produzido pela IA. RLS restringe à organização.

export interface DashboardFilters {
  from?: string;
  to?: string;
  teamId?: string;
  categoryId?: string;
  channel?: string;
}

const DEFAULT_DAYS = 30;
const MAX_DAYS = 366;

interface Stat { avg: number | null; median: number | null }
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const stat = (r: { avg: unknown; median: unknown } | undefined): Stat => ({ avg: num(r?.avg), median: num(r?.median) });
const pct = (ok: number, bad: number) => (ok + bad ? ok / (ok + bad) : null);

export async function getDashboard(actor: TenantActor, filters: DashboardFilters = {}, db: Db = getDb()) {
  await requirePermission(actor, "dashboard.read", db);
  if (filters.teamId && !isUuid(filters.teamId)) throw new DomainError("invalid_filter", "");
  if (filters.categoryId && !isUuid(filters.categoryId)) throw new DomainError("invalid_filter", "");
  if (filters.channel && !Object.values(TicketChannel).includes(filters.channel as TicketChannel)) throw new DomainError("invalid_channel", "");

  return withTenant(actor, async (tx) => {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
    const today = localDate(new Date(), org.timezone);
    const toDate = filters.to || today;
    const fromDate = filters.from || localDate(new Date(Date.now() - (DEFAULT_DAYS - 1) * 86_400_000), org.timezone);
    let start: Date, end: Date;
    try {
      start = zonedDayStart(fromDate, org.timezone);
      end = new Date(zonedDayStart(toDate, org.timezone).getTime() + 86_400_000);
    } catch {
      throw new DomainError("invalid_period", "");
    }
    if (end <= start || end.getTime() - start.getTime() > MAX_DAYS * 86_400_000) throw new DomainError("invalid_period", "");

    // Filtros de equipe, categoria e canal (RF-DSH-03), aplicados a todos os indicadores
    const f = Prisma.sql`
      ${filters.teamId ? Prisma.sql`AND t.team_id = ${filters.teamId}::uuid` : Prisma.empty}
      ${filters.categoryId ? Prisma.sql`AND t.category_id = ${filters.categoryId}::uuid` : Prisma.empty}
      ${filters.channel ? Prisma.sql`AND t.channel = ${filters.channel}::ticket_channel` : Prisma.empty}`;
    const q = <T>(sql: Prisma.Sql) => tx.$queryRaw<T[]>(sql);

    const [counts] = await q<{ received: bigint; resolved: bigint; backlog: bigint }>(Prisma.sql`
      SELECT
        count(*) FILTER (WHERE t.created_at >= ${start} AND t.created_at < ${end}) AS received,
        -- RN-41: última transição para Resolvido dentro do período
        count(*) FILTER (WHERE t.status IN ('resolved', 'closed') AND t.resolved_at >= ${start} AND t.resolved_at < ${end}) AS resolved,
        -- RN-44: qualquer status diferente de Resolvido, Fechado ou Cancelado no fim do período
        count(*) FILTER (WHERE t.created_at < ${end}
          AND NOT (t.status IN ('resolved', 'closed') AND t.resolved_at < ${end})
          AND NOT (t.status = 'cancelled' AND coalesce(t.cancelled_at, '-infinity') < ${end})) AS backlog
      FROM tickets t WHERE true ${f}`);

    const distribution = (column: "category" | "type" | "priority") =>
      q<{ key: string | null; label: string | null; total: bigint }>(
        column === "category"
          ? Prisma.sql`SELECT t.category_id::text AS key, c.name AS label, count(*) AS total FROM tickets t
              LEFT JOIN categories c ON c.organization_id = t.organization_id AND c.id = t.category_id
              WHERE t.created_at >= ${start} AND t.created_at < ${end} ${f} GROUP BY 1, 2 ORDER BY 3 DESC`
          : Prisma.sql`SELECT ${Prisma.raw(`t.${column}::text`)} AS key, NULL AS label, count(*) AS total FROM tickets t
              WHERE t.created_at >= ${start} AND t.created_at < ${end} ${f} GROUP BY 1 ORDER BY 3 DESC`,
      );
    const [byCategory, byType, byPriority] = await Promise.all([distribution("category"), distribution("type"), distribution("priority")]);

    // RN-40 e RN-41: médias e medianas em horas corridas e úteis; cancelados fora (RN-45)
    const timeStats = (metric: "first" | "resolution") => {
      const at = metric === "first" ? Prisma.raw("t.first_responded_at") : Prisma.raw("t.resolved_at");
      const biz = metric === "first" ? Prisma.raw("t.first_response_business_secs") : Prisma.raw("t.resolution_business_secs");
      const extra = metric === "resolution" ? Prisma.sql`AND t.status IN ('resolved', 'closed')` : Prisma.sql`AND t.status <> 'cancelled'`;
      return q<{ n: bigint; avg: unknown; median: unknown; biz_avg: unknown; biz_median: unknown }>(Prisma.sql`
        SELECT count(*) AS n,
          avg(extract(epoch FROM ${at} - t.created_at)) AS avg,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ${at} - t.created_at)) AS median,
          avg(${biz}) AS biz_avg,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY ${biz}) AS biz_median
        FROM tickets t WHERE ${at} >= ${start} AND ${at} < ${end} ${extra} ${f}`);
    };
    const [[frt], [res]] = await Promise.all([timeStats("first"), timeStats("resolution")]);

    // RN-42: atingidas ÷ (atingidas + vencidas) no período, por meta; cancelados fora (RN-45)
    const slaFor = async (metric: "first_response" | "resolution") => {
      const at = metric === "first_response" ? Prisma.raw("t.first_responded_at") : Prisma.raw("t.resolved_at");
      const key = metric === "first_response" ? "firstResponseMinutes" : "resolutionMinutes";
      const status = metric === "resolution" ? Prisma.sql`AND t.status IN ('resolved', 'closed')` : Prisma.sql`AND t.status <> 'cancelled'`;
      const [r] = await q<{ achieved: bigint; breached: bigint }>(Prisma.sql`
        SELECT
          (SELECT count(*) FROM tickets t
            WHERE ${at} >= ${start} AND ${at} < ${end} ${status} ${f}
              AND (t.sla_snapshot -> 'policies' -> (t.priority::text) ->> ${key}) IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM sla_events e WHERE e.organization_id = t.organization_id AND e.ticket_id = t.id AND e.metric = ${metric} AND e.kind = 'breach')) AS achieved,
          (SELECT count(*) FROM sla_events e JOIN tickets t ON t.organization_id = e.organization_id AND t.id = e.ticket_id
            WHERE e.metric = ${metric} AND e.kind = 'breach' AND e.occurred_at >= ${start} AND e.occurred_at < ${end} AND t.status <> 'cancelled' ${f}) AS breached`);
      const achieved = Number(r?.achieved ?? 0);
      const breached = Number(r?.breached ?? 0);
      return { achieved, breached, rate: pct(achieved, breached) };
    };
    const [slaFirst, slaResolution] = await Promise.all([slaFor("first_response"), slaFor("resolution")]);

    // Indicadores por equipe
    const byTeam = await q<{ team_id: string | null; name: string | null; received: bigint; resolved: bigint; backlog: bigint }>(Prisma.sql`
      SELECT t.team_id::text AS team_id, tm.name,
        count(*) FILTER (WHERE t.created_at >= ${start} AND t.created_at < ${end}) AS received,
        count(*) FILTER (WHERE t.status IN ('resolved', 'closed') AND t.resolved_at >= ${start} AND t.resolved_at < ${end}) AS resolved,
        count(*) FILTER (WHERE t.created_at < ${end}
          AND NOT (t.status IN ('resolved', 'closed') AND t.resolved_at < ${end})
          AND NOT (t.status = 'cancelled' AND coalesce(t.cancelled_at, '-infinity') < ${end})) AS backlog
      FROM tickets t LEFT JOIN teams tm ON tm.organization_id = t.organization_id AND tm.id = t.team_id
      WHERE true ${f} GROUP BY 1, 2 ORDER BY 2 NULLS LAST`);

    const triage = await triageAcceptance(tx, start, end, f);

    // CSAT (RN-43): avaliações 4 ou 5 ÷ avaliações do período; média simples; taxa de resposta (KPI-07) = avaliações ÷ resolvidos.
    const [cs] = await q<{ total: bigint; satisfied: bigint; avg: unknown; s1: bigint; s2: bigint; s3: bigint; s4: bigint; s5: bigint }>(Prisma.sql`
      SELECT count(*) AS total, count(*) FILTER (WHERE c.score >= 4) AS satisfied, avg(c.score) AS avg,
        count(*) FILTER (WHERE c.score = 1) AS s1, count(*) FILTER (WHERE c.score = 2) AS s2, count(*) FILTER (WHERE c.score = 3) AS s3,
        count(*) FILTER (WHERE c.score = 4) AS s4, count(*) FILTER (WHERE c.score = 5) AS s5
      FROM csat_responses c JOIN tickets t ON t.organization_id = c.organization_id AND t.id = c.ticket_id
      WHERE c.created_at >= ${start} AND c.created_at < ${end} ${f}`);
    const csatTotal = Number(cs?.total ?? 0);
    const resolvedCount = Number(counts?.resolved ?? 0);
    const csat = {
      responses: csatTotal,
      satisfied: Number(cs?.satisfied ?? 0),
      rate: csatTotal ? Number(cs!.satisfied) / csatTotal : null,
      average: csatTotal && cs?.avg != null ? Math.round(Number(cs.avg) * 100) / 100 : null,
      distribution: [cs?.s1, cs?.s2, cs?.s3, cs?.s4, cs?.s5].map((v) => Number(v ?? 0)),
      responseRate: resolvedCount ? csatTotal / resolvedCount : null,
    };

    return {
      period: { from: fromDate, to: toDate, timezone: org.timezone },
      received: Number(counts?.received ?? 0),
      resolved: Number(counts?.resolved ?? 0),
      backlog: Number(counts?.backlog ?? 0),
      byCategory: byCategory.map((r) => ({ key: r.key, label: r.label, total: Number(r.total) })),
      byType: byType.map((r) => ({ key: r.key, total: Number(r.total) })),
      byPriority: byPriority.map((r) => ({ key: r.key, total: Number(r.total) })),
      firstResponse: { count: Number(frt?.n ?? 0), calendar: stat(frt), business: stat({ avg: frt?.biz_avg, median: frt?.biz_median }) },
      resolution: { count: Number(res?.n ?? 0), calendar: stat(res), business: stat({ avg: res?.biz_avg, median: res?.biz_median }) },
      sla: { firstResponse: slaFirst, resolution: slaResolution },
      csat,
      byTeam: byTeam.map((r) => ({ teamId: r.team_id, name: r.name, received: Number(r.received), resolved: Number(r.resolved), backlog: Number(r.backlog) })),
      triage,
    };
  }, db);
}

/**
 * RN-13: campos aceitos sem alteração ÷ campos revisados no período, considerando a execução mais
 * recente de cada chamado. Sugestões ainda não revisadas ficam fora e são reportadas à parte.
 */
async function triageAcceptance(tx: Tx, start: Date, end: Date, f: Prisma.Sql) {
  const rows = await tx.$queryRaw<{ field: string; accepted: bigint; changed: bigint; pending: bigint }[]>(Prisma.sql`
    WITH latest AS (
      SELECT DISTINCT ON (r.ticket_id) r.id, r.ticket_id FROM triage_runs r
      WHERE r.status = 'succeeded' ORDER BY r.ticket_id, r.created_at DESC
    )
    SELECT v.field,
      count(*) FILTER (WHERE v.outcome = 'accepted' AND v.reviewed_at >= ${start} AND v.reviewed_at < ${end}) AS accepted,
      count(*) FILTER (WHERE v.outcome = 'changed' AND v.reviewed_at >= ${start} AND v.reviewed_at < ${end}) AS changed,
      count(*) FILTER (WHERE v.outcome = 'pending' AND t.created_at >= ${start} AND t.created_at < ${end}) AS pending
    FROM latest l
    JOIN triage_reviews v ON v.organization_id = app_current_org() AND v.triage_run_id = l.id
    JOIN tickets t ON t.organization_id = app_current_org() AND t.id = l.ticket_id
    WHERE true ${f}
    GROUP BY v.field ORDER BY v.field`);
  const byField = rows.map((r) => {
    const accepted = Number(r.accepted);
    const changed = Number(r.changed);
    return { field: r.field, accepted, changed, pending: Number(r.pending), rate: pct(accepted, changed) };
  });
  const accepted = byField.reduce((a, r) => a + r.accepted, 0);
  const changed = byField.reduce((a, r) => a + r.changed, 0);
  return { accepted, changed, pending: byField.reduce((a, r) => a + r.pending, 0), rate: pct(accepted, changed), byField };
}

/** Opções dos filtros do dashboard (equipes e categorias), sem acesso a chamados. */
export async function getDashboardOptions(actor: TenantActor, db: Db = getDb()) {
  await requirePermission(actor, "dashboard.read", db);
  return withTenant(actor, async (tx) => ({
    teams: await tx.team.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    categories: await tx.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  }), db);
}
