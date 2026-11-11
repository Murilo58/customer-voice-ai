import { isUuid } from "@/lib/security";
import { budgetDefaultMicros, currentPeriod, quotaDefault } from "@/server/ai/triage";
import { recordAudit } from "@/server/audit/audit";
import { getDb, type Db } from "@/server/db/client";
import { withPlatformAdmin } from "@/server/db/tenant";
import { DomainError } from "@/server/errors";

// Backoffice mínimo do Superadmin (RF-ORG-09, RF-CON-02, RF-CON-04). Só organizações, cotas e
// consumo agregado: não há política de RLS de plataforma em chamados, mensagens ou contatos (CA-16.4).

export async function listPlatformOrganizations(adminUserId: string, db: Db = getDb()) {
  const period = currentPeriod();
  const monthStart = new Date(`${period}-01T00:00:00Z`);
  return withPlatformAdmin(adminUserId, async (tx) => {
    const [orgs, quotas, usage, budget] = await Promise.all([
      tx.organization.findMany({ select: { id: true, name: true, slug: true, status: true, aiEnabled: true, aiQuotaOps: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
      tx.aiQuota.findMany({ where: { period }, select: { organizationId: true, limitOps: true, usedOps: true } }),
      tx.aiUsageEvent.groupBy({
        by: ["organizationId"], where: { createdAt: { gte: monthStart } },
        _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true, thoughtTokens: true, costUsdMicros: true },
      }),
      tx.platformAiBudget.findUnique({ where: { period } }),
    ]);
    const quotaOf = new Map(quotas.map((q) => [q.organizationId, q]));
    const usageOf = new Map(usage.map((u) => [u.organizationId, u]));
    return {
      period,
      budget: {
        limitUsd: Number(budget?.limitUsdMicros ?? budgetDefaultMicros()) / 1e6,
        spentUsd: Number(budget?.spentUsdMicros ?? 0n) / 1e6,
        tripped: !!budget?.trippedAt,
      },
      organizations: orgs.map((o) => {
        const q = quotaOf.get(o.id);
        const u = usageOf.get(o.id);
        return {
          ...o,
          quota: { limit: q?.limitOps ?? o.aiQuotaOps ?? quotaDefault(), used: q?.usedOps ?? 0 },
          usage: {
            calls: u?._count._all ?? 0,
            tokens: (u?._sum.inputTokens ?? 0) + (u?._sum.outputTokens ?? 0) + (u?._sum.thoughtTokens ?? 0),
            costUsd: Number(u?._sum.costUsdMicros ?? 0n) / 1e6,
          },
        };
      }),
    };
  }, db);
}

/** Suspende ou reativa: a equipe perde o acesso na próxima requisição, com dados preservados (CA-16.4). */
export async function setOrganizationStatus(adminUserId: string, organizationId: string, status: "active" | "suspended", db: Db = getDb()) {
  if (!isUuid(organizationId) || !["active", "suspended"].includes(status)) throw new DomainError("organization_not_found", "");
  await withPlatformAdmin(adminUserId, async (tx) => {
    const r = await tx.organization.updateMany({ where: { id: organizationId, status: status === "active" ? "suspended" : "active" }, data: { status } });
    if (r.count !== 1) throw new DomainError("organization_not_found", "");
    await recordAudit(tx, {
      organizationId: null, actorType: "superadmin", actorId: adminUserId,
      action: status === "suspended" ? "organization.suspended" : "organization.reactivated", targetType: "organization", targetId: organizationId,
    });
  }, db);
}

/** Cota mensal de operações de IA da organização (RF-CON-02). Vale já para o mês corrente. */
export async function setOrganizationQuota(adminUserId: string, organizationId: string, limitOps: number, db: Db = getDb()) {
  if (!isUuid(organizationId)) throw new DomainError("organization_not_found", "");
  if (!Number.isInteger(limitOps) || limitOps < 0 || limitOps > 1_000_000) throw new DomainError("invalid_quota", "");
  const period = currentPeriod();
  await withPlatformAdmin(adminUserId, async (tx) => {
    const r = await tx.organization.updateMany({ where: { id: organizationId }, data: { aiQuotaOps: limitOps } });
    if (r.count !== 1) throw new DomainError("organization_not_found", "");
    await tx.aiQuota.upsert({
      where: { organizationId_period: { organizationId, period } },
      create: { organizationId, period, limitOps },
      update: { limitOps },
    });
    await recordAudit(tx, { organizationId: null, actorType: "superadmin", actorId: adminUserId, action: "ai.quota_set", targetType: "organization", targetId: organizationId, details: { period, limitOps } });
  }, db);
}

/** Teto global de gasto de IA (RF-CON-04): vale para o mês corrente e os seguintes. */
export async function setGlobalBudget(adminUserId: string, limitUsd: number, db: Db = getDb()) {
  if (!Number.isFinite(limitUsd) || limitUsd < 0 || limitUsd > 100_000) throw new DomainError("invalid_budget", "");
  const period = currentPeriod();
  const micros = BigInt(Math.round(limitUsd * 1e6));
  await withPlatformAdmin(adminUserId, async (tx) => {
    const current = await tx.platformAiBudget.findUnique({ where: { period } });
    const spent = current?.spentUsdMicros ?? 0n;
    await tx.platformAiBudget.upsert({
      where: { period },
      create: { period, limitUsdMicros: micros, trippedAt: micros <= 0n ? new Date() : null },
      // Subir o teto acima do gasto libera novas chamadas; baixar abaixo do gasto suspende.
      update: { limitUsdMicros: micros, trippedAt: spent >= micros ? (current?.trippedAt ?? new Date()) : null },
    });
    await recordAudit(tx, { organizationId: null, actorType: "superadmin", actorId: adminUserId, action: "ai.global_budget_set", details: { period, limitUsd } });
  }, db);
}
