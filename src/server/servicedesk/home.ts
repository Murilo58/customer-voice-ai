import { getDb, type Db } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { requirePermission, type TenantActor } from "@/server/organizations/service";
import { zonedDayStart } from "@/server/sla/calendar";

// Indicadores da Home da organização. Uma única consulta com agregações filtradas (uma ida e volta ao
// banco, dentro do contexto do tenant e sob RLS). As definições seguem exatamente as visões da lista de
// chamados, para que o número do cartão coincida com o resultado ao clicar.

export interface HomeSummary {
  active: number;
  new: number;
  waiting: number;
  mine: number;
  unassigned: number;
  teamUnassigned: number;
  triageReview: number;
  /** Visão "SLA em risco": 80% ou mais do prazo consumido, inclui violados (CA-11.3). */
  slaRisk: number;
  slaBreached: number;
  createdToday: number;
  resolvedToday: number;
}

export async function getHomeSummary(actor: TenantActor, db: Db = getDb(), now = new Date()): Promise<HomeSummary> {
  await requirePermission(actor, "service.access", db);
  return withTenant(actor, async (tx) => {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const dayStart = zonedDayStart(today, org.timezone);
    const [r] = await tx.$queryRaw<Record<keyof HomeSummary, number>[]>`
      WITH t AS (
        SELECT *, status::text IN ('new', 'open', 'waiting_customer', 'waiting_third_party') AS is_active
        FROM tickets WHERE organization_id = ${actor.organizationId}::uuid
      )
      SELECT
        count(*) FILTER (WHERE is_active)::int AS "active",
        count(*) FILTER (WHERE status::text = 'new')::int AS "new",
        count(*) FILTER (WHERE status::text IN ('waiting_customer', 'waiting_third_party'))::int AS "waiting",
        count(*) FILTER (WHERE is_active AND assignee_membership_id = ${actor.membershipId}::uuid)::int AS "mine",
        count(*) FILTER (WHERE is_active AND assignee_membership_id IS NULL)::int AS "unassigned",
        count(*) FILTER (WHERE is_active AND assignee_membership_id IS NULL AND team_id IN (
          SELECT tm.team_id FROM team_members tm JOIN teams tt ON tt.organization_id = tm.organization_id AND tt.id = tm.team_id
          WHERE tm.membership_id = ${actor.membershipId}::uuid AND tt.archived_at IS NULL
        ))::int AS "teamUnassigned",
        count(*) FILTER (WHERE triage_state::text = 'suggested')::int AS "triageReview",
        count(*) FILTER (WHERE is_active AND (first_response_risk_at <= ${now} OR resolution_risk_at <= ${now}))::int AS "slaRisk",
        count(*) FILTER (WHERE is_active AND (first_response_due_at <= ${now} OR resolution_due_at <= ${now}))::int AS "slaBreached",
        count(*) FILTER (WHERE created_at >= ${dayStart})::int AS "createdToday",
        count(*) FILTER (WHERE status::text IN ('resolved', 'closed') AND resolved_at >= ${dayStart})::int AS "resolvedToday"
      FROM t`;
    return r!;
  }, db);
}
