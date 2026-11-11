// Fluxos de organização e convites: CA-01.1, CA-01.2, CA-02.1, CA-02.2, CA-02.4 (sem equipes; I-3).
import { beforeAll, describe, expect, it } from "vitest";
import { withMigrator } from "./helpers";
import { withTenant, withUser } from "@/server/db/tenant";
import { DomainError, ForbiddenError } from "@/server/errors";
import {
  acceptMemberInvitation,
  changeMemberRole,
  createOrganizationFromInvitation,
  createOrganizationInvitation,
  getMemberInvitation,
  inviteMember,
  listMembers,
  resolveActor,
  revokeMemberInvitation,
  setMemberStatus,
} from "@/server/organizations/service";
import { addMember, createOrganization, createPlatformAdmin, createUser } from "./helpers";

let admin: Awaited<ReturnType<typeof createPlatformAdmin>>;
let org: Awaited<ReturnType<typeof createOrganization>>;

beforeAll(async () => {
  admin = await createPlatformAdmin();
  org = await createOrganization(admin);
});

const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof DomainError ? e.code : e instanceof ForbiddenError ? "forbidden" : String(e)));

describe("convite de organização (RF-ORG-01/02)", () => {
  it("CA-01.2: cria a organização e o convidado é Administrador apenas nela", async () => {
    const owner = await createUser();
    const inv = await createOrganizationInvitation(admin.id, owner.email);
    const slug = `nova-${Date.now()}`;
    const created = await createOrganizationFromInvitation({ token: inv.token, userId: owner.id, userEmail: owner.email, name: "Nova Org", slug });
    const memberships = await withUser(owner.id, (tx) => tx.membership.findMany({ select: { organizationId: true, role: true } }));
    expect(memberships).toEqual([{ organizationId: created.organizationId, role: "admin" }]);
  });

  it("CA-01.1: convite já utilizado é recusado", async () => {
    const owner = await createUser();
    const inv = await createOrganizationInvitation(admin.id, owner.email);
    await createOrganizationFromInvitation({ token: inv.token, userId: owner.id, userEmail: owner.email, name: "Uma", slug: `uma-${Date.now()}` });
    expect(await code(createOrganizationFromInvitation({ token: inv.token, userId: owner.id, userEmail: owner.email, name: "Duas", slug: `duas-${Date.now()}` }))).toBe("invitation_used");
  });

  it("CA-01.1: convite expirado é recusado", async () => {
    const owner = await createUser();
    const inv = await createOrganizationInvitation(admin.id, owner.email);
    await withMigrator((c) => c.query("UPDATE organization_invitations SET expires_at = now() - interval '1 minute' WHERE id = $1", [inv.id]));
    expect(await code(createOrganizationFromInvitation({ token: inv.token, userId: owner.id, userEmail: owner.email, name: "Org Expirada", slug: `exp-${Date.now()}` }))).toBe("invitation_expired");
  });

  it("convite para outro e-mail é recusado", async () => {
    const owner = await createUser();
    const other = await createUser();
    const inv = await createOrganizationInvitation(admin.id, owner.email);
    expect(await code(createOrganizationFromInvitation({ token: inv.token, userId: other.id, userEmail: other.email, name: "Org Outro Email", slug: `mis-${Date.now()}` }))).toBe("invitation_email_mismatch");
  });

  it("identificador duplicado é recusado sem consumir o convite", async () => {
    const owner = await createUser();
    const inv = await createOrganizationInvitation(admin.id, owner.email);
    expect(await code(createOrganizationFromInvitation({ token: inv.token, userId: owner.id, userEmail: owner.email, name: "Dup", slug: org.slug }))).toBe("slug_taken");
    expect(await code(createOrganizationFromInvitation({ token: inv.token, userId: owner.id, userEmail: owner.email, name: "Dup", slug: `ok-${Date.now()}` }))).toBe("ok");
  });

  it("somente Superadmin cria convite de organização", async () => {
    expect(await code(createOrganizationInvitation(org.owner.id, "x@exemplo.test"))).toBe("forbidden");
  });
});

describe("convite de colaborador (RF-ORG-04; CA-02.4)", () => {
  it("o convite aceito cria o vínculo com o perfil definido", async () => {
    const user = await createUser();
    const inv = await inviteMember(org.actor, { email: user.email, role: "manager" });
    expect((await getMemberInvitation(inv.token))?.state).toBe("valid");
    await acceptMemberInvitation({ token: inv.token, userId: user.id, userEmail: user.email });
    const actor = await resolveActor(user.id, org.slug);
    expect(actor?.role).toBe("manager");
    expect((await getMemberInvitation(inv.token))?.state).toBe("used");
  });

  it("convite para e-mail já vinculado é recusado", async () => {
    expect(await code(inviteMember(org.actor, { email: org.owner.email, role: "agent" }))).toBe("already_member");
  });

  it("segundo convite pendente para o mesmo e-mail é recusado", async () => {
    const email = `dup-${Date.now()}@exemplo.test`;
    await inviteMember(org.actor, { email, role: "agent" });
    expect(await code(inviteMember(org.actor, { email, role: "agent" }))).toBe("invitation_pending");
  });

  it("convite cancelado não pode ser aceito", async () => {
    const user = await createUser();
    const inv = await inviteMember(org.actor, { email: user.email, role: "agent" });
    await revokeMemberInvitation(org.actor, inv.id);
    expect(await code(acceptMemberInvitation({ token: inv.token, userId: user.id, userEmail: user.email }))).toBe("invitation_revoked");
  });

  it("aceites concorrentes do mesmo convite criam um único vínculo", async () => {
    const user = await createUser();
    const inv = await inviteMember(org.actor, { email: user.email, role: "agent" });
    const results = await Promise.all([1, 2, 3].map(() => code(acceptMemberInvitation({ token: inv.token, userId: user.id, userEmail: user.email }))));
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
  });
});

describe("permissões e gestão de membros", () => {
  it("CA-02.1: Atendente recebe acesso negado na gestão de usuários e o evento é auditado", async () => {
    const agent = await addMember(org.actor, "agent");
    expect(await code(listMembers(agent.actor))).toBe("forbidden");
    expect(await code(inviteMember(agent.actor, { email: "y@exemplo.test", role: "admin" }))).toBe("forbidden");
    const denied = await withTenant(org.actor, (tx) => tx.auditLog.count({ where: { action: "access.denied", actorId: agent.id } }));
    expect(denied).toBe(2);
  });

  it("CA-02.2: usuário desativado perde o acesso na próxima requisição e pode ser reativado", async () => {
    const agent = await addMember(org.actor, "agent");
    expect(await resolveActor(agent.id, org.slug)).not.toBeNull();
    await setMemberStatus(org.actor, agent.actor.membershipId, "inactive");
    expect(await resolveActor(agent.id, org.slug)).toBeNull();
    await setMemberStatus(org.actor, agent.actor.membershipId, "active");
    expect(await resolveActor(agent.id, org.slug)).not.toBeNull();
  });

  it("não permite remover o último Administrador ativo", async () => {
    const solo = await createOrganization(admin);
    const other = await addMember(solo.actor, "admin");
    await setMemberStatus(other.actor, solo.actor.membershipId, "inactive");
    expect(await code(changeMemberRole(other.actor, other.actor.membershipId, "agent"))).toBe("last_admin");
  });

  it("mudança de perfil é auditada", async () => {
    const m = await addMember(org.actor, "agent");
    await changeMemberRole(org.actor, m.actor.membershipId, "manager");
    const ev = await withTenant(org.actor, (tx) => tx.auditLog.findFirstOrThrow({ where: { action: "member.role_changed", targetId: m.actor.membershipId } }));
    expect(ev.details).toEqual({ from: "agent", to: "manager" });
  });
});
