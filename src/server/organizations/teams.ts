import { Prisma } from "@/generated/prisma/client";
import { isUuid, newId } from "@/lib/security";
import { recordAudit } from "@/server/audit/audit";
import { getDb, type Db } from "@/server/db/client";
import { withTenant, type Tx } from "@/server/db/tenant";
import { DomainError } from "@/server/errors";
import { markOnboarding } from "./onboarding";
import { requirePermission, type TenantActor } from "./service";

// Equipes como filas (RF-ORG-06). Arquivar não apaga: chamados antigos continuam com a equipe,
// mas ela deixa de ser opção de atribuição e de aparecer na lista enviada à IA (CA-02.5).

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

function validName(name: string): string {
  const v = name.trim();
  if (v.length < 2 || v.length > 80) throw new DomainError("invalid_team_name", "");
  return v;
}

/** Equipes ativas da pessoa na organização corrente. */
export async function myTeamIds(tx: Tx, membershipId: string): Promise<string[]> {
  const rows = await tx.teamMember.findMany({ where: { membershipId, team: { archivedAt: null } }, select: { teamId: true } });
  return rows.map((r) => r.teamId);
}

export async function listTeams(actor: TenantActor, opts: { includeArchived?: boolean } = {}, db: Db = getDb()) {
  await requirePermission(actor, "service.access", db);
  return withTenant(actor, (tx) =>
    tx.team.findMany({
      where: opts.includeArchived ? {} : { archivedAt: null },
      select: {
        id: true, name: true, archivedAt: true,
        members: { select: { membershipId: true, membership: { select: { status: true, role: true, user: { select: { name: true } } } } } },
      },
      orderBy: [{ archivedAt: { sort: "desc", nulls: "first" } }, { name: "asc" }],
    }), db);
}

async function audit(tx: Tx, actor: TenantActor, action: string, teamId: string, details: Record<string, unknown> = {}) {
  await recordAudit(tx, { organizationId: actor.organizationId, actorType: "user", actorId: actor.userId, action, targetType: "team", targetId: teamId, details });
}

export async function createTeam(actor: TenantActor, name: string, db: Db = getDb()) {
  await requirePermission(actor, "settings.manage", db);
  const id = newId();
  const v = validName(name);
  try {
    await withTenant(actor, async (tx) => {
      await tx.team.create({ data: { id, organizationId: actor.organizationId, name: v } });
      await audit(tx, actor, "team.created", id, { name: v });
      await markOnboarding(tx, actor.organizationId, "teams");
    }, db);
  } catch (e) {
    if (isUnique(e)) throw new DomainError("team_name_taken", "");
    throw e;
  }
  return { id };
}

export async function renameTeam(actor: TenantActor, teamId: string, name: string, db: Db = getDb()) {
  await requirePermission(actor, "settings.manage", db);
  const v = validName(name);
  try {
    await withTenant(actor, async (tx) => {
      const t = await tx.team.findUnique({ where: { id: teamId } });
      if (!t) throw new DomainError("team_not_found", "");
      if (t.name === v) return;
      await tx.team.update({ where: { id: teamId }, data: { name: v } });
      await audit(tx, actor, "team.renamed", teamId, { from: t.name, to: v });
    }, db);
  } catch (e) {
    if (isUnique(e)) throw new DomainError("team_name_taken", "");
    throw e;
  }
}

export async function setTeamArchived(actor: TenantActor, teamId: string, archived: boolean, db: Db = getDb()) {
  await requirePermission(actor, "settings.manage", db);
  await withTenant(actor, async (tx) => {
    const r = await tx.team.updateMany({ where: { id: teamId, archivedAt: archived ? null : { not: null } }, data: { archivedAt: archived ? new Date() : null } });
    if (r.count !== 1) throw new DomainError("team_not_found", "");
    await audit(tx, actor, archived ? "team.archived" : "team.unarchived", teamId);
  }, db);
}

export async function addTeamMember(actor: TenantActor, teamId: string, membershipId: string, db: Db = getDb()) {
  await requirePermission(actor, "settings.manage", db);
  if (!isUuid(teamId) || !isUuid(membershipId)) throw new DomainError("member_not_found", "");
  await withTenant(actor, async (tx) => {
    const [team, member] = await Promise.all([
      tx.team.findUnique({ where: { id: teamId }, select: { archivedAt: true } }),
      tx.membership.findUnique({ where: { id: membershipId }, select: { status: true } }),
    ]);
    if (!team || team.archivedAt) throw new DomainError("team_not_found", "");
    if (!member || member.status !== "active") throw new DomainError("member_not_found", "");
    const r = await tx.teamMember.createMany({ data: { organizationId: actor.organizationId, teamId, membershipId }, skipDuplicates: true });
    if (r.count) await audit(tx, actor, "team.member_added", teamId, { membershipId });
  }, db);
}

export async function removeTeamMember(actor: TenantActor, teamId: string, membershipId: string, db: Db = getDb()) {
  await requirePermission(actor, "settings.manage", db);
  await withTenant(actor, async (tx) => {
    const r = await tx.teamMember.deleteMany({ where: { teamId, membershipId } });
    if (r.count) await audit(tx, actor, "team.member_removed", teamId, { membershipId });
  }, db);
}

/** Valida IDs de equipes ativas da organização (convites, filtros, atribuição). */
export async function activeTeamIds(tx: Tx, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  if (!unique.every(isUuid)) throw new DomainError("invalid_team", "");
  const rows = await tx.team.findMany({ where: { id: { in: unique }, archivedAt: null }, select: { id: true } });
  if (rows.length !== unique.length) throw new DomainError("invalid_team", "");
  return rows.map((r) => r.id);
}

/** Pessoas que podem receber chamados: vínculos ativos, sem leitura executiva, com suas equipes. */
export async function listAssignableMembers(actor: TenantActor, db: Db = getDb()) {
  await requirePermission(actor, "tickets.assign", db);
  return withTenant(actor, (tx) =>
    tx.membership.findMany({
      where: { status: "active", executiveRead: false },
      select: { id: true, user: { select: { name: true } }, teamLinks: { select: { teamId: true } } },
      orderBy: { user: { name: "asc" } },
    }), db);
}
