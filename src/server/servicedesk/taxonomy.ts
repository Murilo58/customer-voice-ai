import { Prisma, TicketPriority } from "@/generated/prisma/client";
import { newId } from "@/lib/security";
import { recordAudit } from "@/server/audit/audit";
import { getDb, type Db } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { DomainError } from "@/server/errors";
import { aiAuthorizedForOrg } from "@/server/ai/privacy";
import { markOnboarding } from "@/server/organizations/onboarding";
import { requirePermission, type TenantActor } from "@/server/organizations/service";

// Categorias e motivos da organização (RF-ATD-13; RN-12): criar, renomear, desativar, sem apagar histórico.

export type TaxonomyKind = "category" | "reason";

export const SUGGESTED_CATEGORIES = ["Entrega", "Pagamento", "Produto com defeito", "Troca e devolução", "Cadastro e acesso", "Cancelamento", "Atendimento", "Outros"];
export const SUGGESTED_REASONS = ["Atraso", "Cobrança indevida", "Produto danificado", "Dúvida sobre uso", "Arrependimento", "Mau atendimento"];

function validName(name: string): string {
  const v = name.trim();
  if (v.length < 2 || v.length > 80) throw new DomainError("invalid_taxonomy_name", "");
  return v;
}

function priorityOrNull(value: string | null | undefined): TicketPriority | null {
  if (!value) return null;
  if (!Object.values(TicketPriority).includes(value as TicketPriority)) throw new DomainError("invalid_priority", "");
  return value as TicketPriority;
}

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export async function listTaxonomy(actor: TenantActor, opts: { includeInactive?: boolean } = {}, db: Db = getDb()) {
  await requirePermission(actor, "service.access", db);
  const where = opts.includeInactive ? {} : { active: true };
  return withTenant(actor, async (tx) => ({
    categories: await tx.category.findMany({ where, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    reasons: await tx.reason.findMany({ where, orderBy: [{ active: "desc" }, { name: "asc" }] }),
  }), db);
}

export async function createTaxonomyItem(actor: TenantActor, kind: TaxonomyKind, input: { name: string; defaultPriority?: string | null }, db: Db = getDb()) {
  await requirePermission(actor, "settings.manage", db);
  const data = { id: newId(), organizationId: actor.organizationId, name: validName(input.name), defaultPriority: priorityOrNull(input.defaultPriority) };
  try {
    await withTenant(actor, async (tx) => {
      if (kind === "category") await tx.category.create({ data });
      else await tx.reason.create({ data });
      await recordAudit(tx, { organizationId: actor.organizationId, actorType: "user", actorId: actor.userId, action: `${kind}.created`, targetType: kind, targetId: data.id, details: { name: data.name } });
      await markOnboarding(tx, actor.organizationId, "taxonomy");
    }, db);
  } catch (e) {
    if (isUnique(e)) throw new DomainError("taxonomy_name_taken", "");
    throw e;
  }
  return { id: data.id };
}

/** Renomear preserva o identificador interno e a série histórica (RN-12). */
export async function updateTaxonomyItem(
  actor: TenantActor,
  kind: TaxonomyKind,
  id: string,
  input: { name?: string; defaultPriority?: string | null; active?: boolean },
  db: Db = getDb(),
) {
  await requirePermission(actor, "settings.manage", db);
  const data: { name?: string; defaultPriority?: TicketPriority | null; active?: boolean } = {};
  if (input.name !== undefined) data.name = validName(input.name);
  if (input.defaultPriority !== undefined) data.defaultPriority = priorityOrNull(input.defaultPriority);
  if (input.active !== undefined) data.active = input.active;
  try {
    await withTenant(actor, async (tx) => {
      const r = kind === "category" ? await tx.category.updateMany({ where: { id }, data }) : await tx.reason.updateMany({ where: { id }, data });
      if (r.count !== 1) throw new DomainError("taxonomy_not_found", "");
      await recordAudit(tx, { organizationId: actor.organizationId, actorType: "user", actorId: actor.userId, action: `${kind}.updated`, targetType: kind, targetId: id, details: data });
    }, db);
  } catch (e) {
    if (isUnique(e)) throw new DomainError("taxonomy_name_taken", "");
    throw e;
  }
}

/** Modelo sugerido de categorias e motivos (RF-ORG-11). Itens com nome já existente são ignorados. */
export async function applySuggestedTaxonomy(actor: TenantActor, db: Db = getDb()) {
  await requirePermission(actor, "settings.manage", db);
  await withTenant(actor, async (tx) => {
    const org = actor.organizationId;
    await tx.category.createMany({ data: SUGGESTED_CATEGORIES.map((name) => ({ id: newId(), organizationId: org, name })), skipDuplicates: true });
    await tx.reason.createMany({ data: SUGGESTED_REASONS.map((name) => ({ id: newId(), organizationId: org, name })), skipDuplicates: true });
    await recordAudit(tx, { organizationId: org, actorType: "user", actorId: actor.userId, action: "taxonomy.suggested_applied" });
    await markOnboarding(tx, org, "taxonomy");
  }, db);
}

// ---------- IA da organização (RF-TRI-09) e consumo (RF-CON-01, RF-CON-02) ----------

export async function setAiEnabled(actor: TenantActor, enabled: boolean, db: Db = getDb()) {
  await requirePermission(actor, "settings.manage", db);
  await withTenant(actor, async (tx) => {
    // DP-01: só organizações autorizadas para testes sintéticos podem ativar a IA (desativar é sempre permitido).
    if (enabled) {
      const org = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { id: true, slug: true } });
      if (!aiAuthorizedForOrg(org)) throw new DomainError("ai_not_authorized", "");
    }
    await tx.organization.update({ where: { id: actor.organizationId }, data: { aiEnabled: enabled } });
    await recordAudit(tx, { organizationId: actor.organizationId, actorType: "user", actorId: actor.userId, action: enabled ? "ai.enabled" : "ai.disabled" });
  }, db);
}

export async function getAiSettings(actor: TenantActor, db: Db = getDb()) {
  await requirePermission(actor, "settings.manage", db);
  const period = new Date().toISOString().slice(0, 7);
  const start = new Date(`${period}-01T00:00:00Z`);
  return withTenant(actor, async (tx) => {
    const [org, quota, usage] = await Promise.all([
      tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { id: true, slug: true, aiEnabled: true } }),
      tx.aiQuota.findUnique({ where: { organizationId_period: { organizationId: actor.organizationId, period } } }),
      tx.aiUsageEvent.aggregate({ where: { createdAt: { gte: start } }, _count: true, _sum: { inputTokens: true, outputTokens: true, thoughtTokens: true, costUsdMicros: true } }),
    ]);
    return {
      aiEnabled: org.aiEnabled,
      authorized: aiAuthorizedForOrg(org),
      period,
      quota: { used: quota?.usedOps ?? 0, limit: quota?.limitOps ?? Number(process.env.AI_QUOTA_DEFAULT_OPS ?? 1500) },
      usage: { calls: usage._count, inputTokens: usage._sum.inputTokens ?? 0, outputTokens: usage._sum.outputTokens ?? 0, thoughtTokens: usage._sum.thoughtTokens ?? 0, costUsd: Number(usage._sum.costUsdMicros ?? 0n) / 1e6 },
    };
  }, db);
}
