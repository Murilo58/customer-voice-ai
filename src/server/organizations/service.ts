import { MemberRole, Prisma } from "@/generated/prisma/client";
import { generateToken, hashToken, newId, normalizeEmail, SLUG_RE } from "@/lib/security";
import { recordAudit } from "@/server/audit/audit";
import { getDb, type Db } from "@/server/db/client";
import { withInvitationToken, withPlatformAdmin, withTenant, withUser } from "@/server/db/tenant";
import { DomainError, ForbiddenError } from "@/server/errors";
import { markOnboarding } from "./onboarding";
import { can, INVITATION_TTL_MS, invitationState, type Permission } from "./permissions";
import { activeTeamIds } from "./teams";

/** Ator autenticado no contexto de uma organização, já validado contra memberships. */
export interface TenantActor {
  userId: string;
  organizationId: string;
  membershipId: string;
  role: MemberRole;
  /** Gestor com leitura executiva: só dashboard, sem chamados, contatos ou configurações (RF-ORG-10). */
  executiveRead?: boolean;
}

const INVITATION_MESSAGES = {
  expired: "Este convite expirou. Solicite um novo convite.",
  used: "Este convite já foi utilizado.",
  revoked: "Este convite foi cancelado.",
} as const;

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Exige permissão; em caso de negação, audita e lança 403 (CA-02.1). */
export async function requirePermission(actor: TenantActor, permission: Permission, db: Db = getDb()): Promise<void> {
  if (can(actor.role, permission, actor.executiveRead)) return;
  await withTenant(actor, (tx) =>
    recordAudit(tx, {
      organizationId: actor.organizationId,
      actorType: "user",
      actorId: actor.userId,
      action: "access.denied",
      details: { permission },
    }), db);
  throw new ForbiddenError("Você não tem permissão para esta ação.");
}

// ---------- Vínculos (RF-ORG-08) ----------

export function listMyOrganizations(userId: string, db: Db = getDb()) {
  return withUser(userId, (tx) =>
    tx.membership.findMany({
      where: { userId, status: "active", organization: { status: "active" } },
      select: { id: true, role: true, organization: { select: { id: true, slug: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }), db);
}

/** Valida a organização ativa contra memberships a cada requisição (ADR-004; CA-02.2). */
export async function resolveActor(userId: string, organizationSlug: string, db: Db = getDb()): Promise<TenantActor | null> {
  const m = await withUser(userId, (tx) =>
    tx.membership.findFirst({
      where: { userId, status: "active", organization: { slug: organizationSlug, status: "active" } },
      select: { id: true, role: true, organizationId: true, executiveRead: true },
    }), db);
  return m ? { userId, organizationId: m.organizationId, membershipId: m.id, role: m.role, executiveRead: m.executiveRead } : null;
}

// ---------- Convite de organização (RF-ORG-01, RF-ORG-02) ----------

export async function createOrganizationInvitation(adminUserId: string, email: string, db: Db = getDb()) {
  const normalized = normalizeEmail(email);
  const { token, tokenHash } = generateToken();
  const id = newId();
  await withPlatformAdmin(adminUserId, async (tx) => {
    await tx.organizationInvitation.create({
      data: { id, email: normalized, tokenHash, expiresAt: new Date(Date.now() + INVITATION_TTL_MS), createdBy: adminUserId },
    });
    await recordAudit(tx, {
      organizationId: null, actorType: "superadmin", actorId: adminUserId,
      action: "organization_invitation.created", targetType: "organization_invitation", targetId: id, details: { email: normalized },
    });
  }, db);
  return { id, token, email: normalized };
}

export async function getOrganizationInvitation(token: string, db: Db = getDb()) {
  const inv = await db.organizationInvitation.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!inv) return null;
  return { id: inv.id, email: inv.email, state: invitationState(inv) };
}

export async function createOrganizationFromInvitation(
  input: { token: string; userId: string; userEmail: string; name: string; slug: string; timezone?: string },
  db: Db = getDb(),
) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new DomainError("invalid_name", "Informe um nome entre 2 e 120 caracteres.");
  if (!SLUG_RE.test(input.slug)) throw new DomainError("invalid_slug", "Identificador inválido: use de 3 a 48 letras minúsculas, números ou hífens.");

  const tokenHash = hashToken(input.token);
  const organizationId = newId();
  const membershipId = newId();
  try {
    await withTenant({ organizationId, userId: input.userId }, async (tx) => {
      const inv = await tx.organizationInvitation.findUnique({ where: { tokenHash } });
      if (!inv) throw new DomainError("invitation_not_found", "Convite não encontrado.");
      const state = invitationState(inv);
      if (state !== "valid") throw new DomainError(`invitation_${state}`, INVITATION_MESSAGES[state]);
      if (inv.email !== normalizeEmail(input.userEmail)) {
        throw new DomainError("invitation_email_mismatch", "Este convite foi enviado para outro e-mail.");
      }
      // Uso único sob concorrência: só marca se ainda não usado.
      const used = await tx.organizationInvitation.updateMany({
        where: { id: inv.id, usedAt: null, revokedAt: null },
        data: { usedAt: new Date(), organizationId },
      });
      if (used.count !== 1) throw new DomainError("invitation_used", INVITATION_MESSAGES.used);

      await tx.organization.create({
        data: {
          id: organizationId, name, slug: input.slug, timezone: input.timezone ?? "America/Sao_Paulo",
          ticketPrefix: input.slug.replace(/-/g, "").slice(0, 6).toUpperCase() || "CVA",
        },
      });
      await tx.membership.create({ data: { id: membershipId, organizationId, userId: input.userId, role: "admin" } });
      await recordAudit(tx, {
        organizationId, actorType: "user", actorId: input.userId, action: "organization.created",
        targetType: "organization", targetId: organizationId, details: { slug: input.slug, invitationId: inv.id },
      });
    }, db);
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("slug_taken", "Este identificador já está em uso.");
    throw e;
  }
  return { organizationId, slug: input.slug };
}

// ---------- Convite de colaborador (RF-ORG-04; CA-02.4) ----------

export async function inviteMember(actor: TenantActor, input: { email: string; role: MemberRole; teamIds?: string[] }, db: Db = getDb()) {
  await requirePermission(actor, "members.manage", db);
  const email = normalizeEmail(input.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new DomainError("invalid_email", "E-mail inválido.");
  if (!Object.values(MemberRole).includes(input.role)) throw new DomainError("invalid_role", "Perfil inválido.");

  const { token, tokenHash } = generateToken();
  const id = newId();
  try {
    await withTenant(actor, async (tx) => {
      const existing = await tx.membership.findFirst({ where: { organizationId: actor.organizationId, user: { email } } });
      if (existing) throw new DomainError("already_member", "Este e-mail já está vinculado à organização.");
      const teamIds = await activeTeamIds(tx, input.teamIds ?? []);
      await tx.userInvitation.create({
        data: {
          id, organizationId: actor.organizationId, email, role: input.role, tokenHash, teamIds,
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS), createdByMembershipId: actor.membershipId,
        },
      });
      await recordAudit(tx, {
        organizationId: actor.organizationId, actorType: "user", actorId: actor.userId, action: "member_invitation.created",
        targetType: "user_invitation", targetId: id, details: { email, role: input.role, teamIds },
      });
      await markOnboarding(tx, actor.organizationId, "invite_team");
    }, db);
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("invitation_pending", "Já existe um convite pendente para este e-mail.");
    throw e;
  }
  return { id, token, email };
}

export async function getMemberInvitation(token: string, db: Db = getDb()) {
  const tokenHash = hashToken(token);
  const inv = await withInvitationToken(tokenHash, (tx) =>
    tx.userInvitation.findUnique({
      where: { tokenHash },
      select: { id: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, organization: { select: { name: true, slug: true } } },
    }), db);
  if (!inv) return null;
  return { id: inv.id, email: inv.email, role: inv.role, organization: inv.organization, state: invitationState(inv) };
}

export async function acceptMemberInvitation(input: { token: string; userId: string; userEmail: string }, db: Db = getDb()) {
  const tokenHash = hashToken(input.token);
  const inv = await withInvitationToken(tokenHash, (tx) => tx.userInvitation.findUnique({ where: { tokenHash } }), db);
  if (!inv) throw new DomainError("invitation_not_found", "Convite não encontrado.");
  const state = invitationState(inv);
  if (state !== "valid") throw new DomainError(`invitation_${state}`, INVITATION_MESSAGES[state]);
  if (inv.email !== normalizeEmail(input.userEmail)) throw new DomainError("invitation_email_mismatch", "Este convite foi enviado para outro e-mail.");

  const membershipId = newId();
  try {
    await withTenant({ organizationId: inv.organizationId, userId: input.userId }, async (tx) => {
      const accepted = await tx.userInvitation.updateMany({
        where: { id: inv.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (accepted.count !== 1) throw new DomainError("invitation_used", INVITATION_MESSAGES.used);
      await tx.membership.create({ data: { id: membershipId, organizationId: inv.organizationId, userId: input.userId, role: inv.role } });
      // Equipes do convite (CA-02.4); equipes arquivadas depois do convite são ignoradas.
      const teams = await tx.team.findMany({ where: { id: { in: inv.teamIds ?? [] }, archivedAt: null }, select: { id: true } });
      if (teams.length) {
        await tx.teamMember.createMany({ data: teams.map((t) => ({ organizationId: inv.organizationId, teamId: t.id, membershipId })) });
      }
      await recordAudit(tx, {
        organizationId: inv.organizationId, actorType: "user", actorId: input.userId, action: "member_invitation.accepted",
        targetType: "membership", targetId: membershipId, details: { invitationId: inv.id, role: inv.role, teamIds: teams.map((t) => t.id) },
      });
    }, db);
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("already_member", "Este e-mail já está vinculado à organização.");
    throw e;
  }
  const org = await withTenant({ organizationId: inv.organizationId }, (tx) => tx.organization.findUniqueOrThrow({ where: { id: inv.organizationId }, select: { slug: true } }), db);
  return { organizationId: inv.organizationId, slug: org.slug, membershipId };
}

export async function revokeMemberInvitation(actor: TenantActor, invitationId: string, db: Db = getDb()) {
  await requirePermission(actor, "members.manage", db);
  await withTenant(actor, async (tx) => {
    const r = await tx.userInvitation.updateMany({ where: { id: invitationId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    if (r.count !== 1) throw new DomainError("invitation_not_pending", "Convite não está pendente.");
    await recordAudit(tx, {
      organizationId: actor.organizationId, actorType: "user", actorId: actor.userId, action: "member_invitation.revoked",
      targetType: "user_invitation", targetId: invitationId,
    });
  }, db);
}

// ---------- Gestão de membros (RF-ORG-05) ----------

export async function listMembers(actor: TenantActor, db: Db = getDb()) {
  await requirePermission(actor, "members.manage", db);
  return withTenant(actor, async (tx) => ({
    members: await tx.membership.findMany({
      select: { id: true, role: true, status: true, executiveRead: true, createdAt: true, user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    invitations: await tx.userInvitation.findMany({
      where: { acceptedAt: null, revokedAt: null },
      select: { id: true, email: true, role: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    }),
  }), db);
}

export async function setMemberStatus(actor: TenantActor, membershipId: string, status: "active" | "inactive", db: Db = getDb()) {
  await requirePermission(actor, "members.manage", db);
  if (membershipId === actor.membershipId) throw new DomainError("self_status", "Você não pode alterar o próprio status.");
  await withTenant(actor, async (tx) => {
    const target = await tx.membership.findUnique({ where: { id: membershipId } });
    if (!target) throw new DomainError("member_not_found", "Membro não encontrado.");
    if (status === "inactive" && target.role === "admin") {
      const admins = await tx.membership.count({ where: { role: "admin", status: "active" } });
      if (admins <= 1) throw new DomainError("last_admin", "A organização precisa de ao menos um Administrador ativo.");
    }
    await tx.membership.update({ where: { id: membershipId }, data: { status } });
    await recordAudit(tx, {
      organizationId: actor.organizationId, actorType: "user", actorId: actor.userId,
      action: status === "inactive" ? "member.deactivated" : "member.reactivated", targetType: "membership", targetId: membershipId,
    });
  }, db);
}

export async function changeMemberRole(actor: TenantActor, membershipId: string, role: MemberRole, db: Db = getDb()) {
  await requirePermission(actor, "members.manage", db);
  if (!Object.values(MemberRole).includes(role)) throw new DomainError("invalid_role", "Perfil inválido.");
  await withTenant(actor, async (tx) => {
    const target = await tx.membership.findUnique({ where: { id: membershipId } });
    if (!target) throw new DomainError("member_not_found", "Membro não encontrado.");
    if (target.role === "admin" && role !== "admin") {
      const admins = await tx.membership.count({ where: { role: "admin", status: "active" } });
      if (admins <= 1) throw new DomainError("last_admin", "A organização precisa de ao menos um Administrador ativo.");
    }
    // Leitura executiva só existe no perfil Gestor (RF-ORG-10)
    await tx.membership.update({ where: { id: membershipId }, data: { role, ...(role !== "manager" ? { executiveRead: false } : {}) } });
    await recordAudit(tx, {
      organizationId: actor.organizationId, actorType: "user", actorId: actor.userId, action: "member.role_changed",
      targetType: "membership", targetId: membershipId, details: { from: target.role, to: role },
    });
  }, db);
}

export async function listAudit(actor: TenantActor, db: Db = getDb()) {
  await requirePermission(actor, "audit.read", db);
  return withTenant(actor, (tx) => tx.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }), db);
}

// ---------- Dados da organização (RF-ORG-07, parte de dados e fuso) ----------

export async function getOrganizationSettings(actor: TenantActor, db: Db = getDb()) {
  await requirePermission(actor, "settings.manage", db);
  return withTenant(actor, (tx) =>
    tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { name: true, slug: true, timezone: true, ticketPrefix: true } }), db);
}

export async function updateOrganizationSettings(actor: TenantActor, input: { name: string; timezone: string }, db: Db = getDb()) {
  await requirePermission(actor, "settings.manage", db);
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new DomainError("invalid_name", "Informe um nome entre 2 e 120 caracteres.");
  if (!Intl.supportedValuesOf("timeZone").includes(input.timezone)) throw new DomainError("invalid_timezone", "Fuso horário inválido.");
  await withTenant(actor, async (tx) => {
    const before = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { name: true, timezone: true } });
    await tx.organization.update({ where: { id: actor.organizationId }, data: { name, timezone: input.timezone } });
    await recordAudit(tx, {
      organizationId: actor.organizationId, actorType: "user", actorId: actor.userId, action: "organization.updated",
      targetType: "organization", targetId: actor.organizationId, details: { from: before, to: { name, timezone: input.timezone } },
    });
    await markOnboarding(tx, actor.organizationId, "organization_data");
  }, db);
}

// ---------- Leitura executiva (RF-ORG-10; CA-14.4) ----------

export async function setExecutiveRead(actor: TenantActor, membershipId: string, enabled: boolean, db: Db = getDb()) {
  await requirePermission(actor, "members.manage", db);
  await withTenant(actor, async (tx) => {
    const target = await tx.membership.findUnique({ where: { id: membershipId } });
    if (!target) throw new DomainError("member_not_found", "Membro não encontrado.");
    if (target.role !== "manager") throw new DomainError("executive_read_manager_only", "A leitura executiva é uma opção do perfil Gestor.");
    if (target.executiveRead === enabled) return;
    await tx.membership.update({ where: { id: membershipId }, data: { executiveRead: enabled } });
    // Sem acesso a chamados, o vínculo deixa de ser responsável por chamados e de compor filas.
    if (enabled) {
      await tx.teamMember.deleteMany({ where: { membershipId } });
    }
    await recordAudit(tx, {
      organizationId: actor.organizationId, actorType: "user", actorId: actor.userId, action: "member.executive_read_changed",
      targetType: "membership", targetId: membershipId, details: { enabled },
    });
  }, db);
}
