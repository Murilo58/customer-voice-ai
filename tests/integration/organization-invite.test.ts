// Convite de organização com envio (tela /admin e job de convite inicial em Produção).
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import type { EmailMessage, EmailSender } from "@/server/email/sender";
import { ForbiddenError } from "@/server/errors";
import type { ClaimedJob } from "@/server/jobs/outbox";
import { createOrganizationFromInvitation, getOrganizationInvitation } from "@/server/organizations/service";
import { organizationInviteJobHandler, ORG_INVITE_JOB, sendOrganizationInvitation } from "@/server/organizations/organization-invite";
import { createPlatformAdmin, createUser, withMigrator } from "./helpers";

class FakeSender implements EmailSender {
  sent: EmailMessage[] = [];
  constructor(private readonly fail = false) {}
  async send(m: EmailMessage) {
    if (this.fail) throw new Error("falha de envio simulada");
    this.sent.push(m);
    return { providerId: "re_teste" };
  }
}

const job = (payload: Record<string, unknown>): ClaimedJob => ({ id: "00000000-0000-4000-8000-000000000001", type: ORG_INVITE_JOB, organization_id: null, payload: payload as never, attempts: 1, max_attempts: 1 });
const newEmail = () => `convidado-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@exemplo.test`;
const tokenFrom = (m: EmailMessage) => /\/criar-organizacao\/([^\s]+)/.exec(m.text)![1]!;
const invitationsFor = (email: string) => getDb().organizationInvitation.findMany({ where: { email } });

let admin: Awaited<ReturnType<typeof createPlatformAdmin>>;
beforeAll(async () => { admin = await createPlatformAdmin(); });

describe("sendOrganizationInvitation", () => {
  it("cria o convite (só o hash no banco), envia o link e registra auditoria", async () => {
    const email = newEmail();
    const sender = new FakeSender();
    const r = await sendOrganizationInvitation(admin.id, email, { sender });
    expect(r.providerId).toBe("re_teste");
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]!.to).toBe(email);
    const token = tokenFrom(sender.sent[0]!);
    expect((await getOrganizationInvitation(token))?.state).toBe("valid");
    const [row] = await invitationsFor(email);
    expect(row!.tokenHash).not.toContain(token);
    const audit = await withMigrator((c) => c.query("SELECT actor_type, actor_id FROM audit_logs WHERE target_id = $1 AND action = 'organization_invitation.created'", [r.invitationId]));
    expect(audit.rows).toEqual([{ actor_type: "superadmin", actor_id: admin.id }]);
  });

  it("falha no envio revoga o convite recém-criado", async () => {
    const email = newEmail();
    await expect(sendOrganizationInvitation(admin.id, email, { sender: new FakeSender(true) })).rejects.toThrow("falha de envio simulada");
    const rows = await invitationsFor(email);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.revokedAt).not.toBeNull();
  });

  it("autor sem papel de Superadmin é recusado e nada é gravado", async () => {
    const user = await createUser();
    const email = newEmail();
    await expect(sendOrganizationInvitation(user.id, email, { sender: new FakeSender() })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await invitationsFor(email)).toHaveLength(0);
  });
});

describe("job de convite inicial (organization_invitation.send)", () => {
  it("emite e envia o convite; o convidado cria a organização pelo fluxo oficial", async () => {
    const email = newEmail();
    const sender = new FakeSender();
    await organizationInviteJobHandler({ sender })(job({ email: email.toUpperCase(), adminUserId: admin.id }));
    expect(sender.sent).toHaveLength(1);
    const owner = await createUser();
    await getDb().user.update({ where: { id: owner.id }, data: { email } });
    const slug = `boot-${Date.now().toString(36)}`;
    const org = await createOrganizationFromInvitation({ token: tokenFrom(sender.sent[0]!), userId: owner.id, userEmail: email, name: "Org Inicial", slug });
    expect(org.slug).toBe(slug);
    const ai = await withMigrator((c) => c.query("SELECT ai_enabled FROM organizations WHERE slug = $1", [slug]));
    expect(ai.rows).toEqual([{ ai_enabled: false }]);
  });

  it("recusa e-mail que já tem conta", async () => {
    const user = await createUser();
    const sender = new FakeSender();
    await expect(organizationInviteJobHandler({ sender })(job({ email: user.email, adminUserId: admin.id }))).rejects.toThrow("Já existe conta");
    expect(sender.sent).toHaveLength(0);
    expect(await invitationsFor(user.email)).toHaveLength(0);
  });

  it("recusa quando já há convite pendente (não duplica)", async () => {
    const email = newEmail();
    const sender = new FakeSender();
    await organizationInviteJobHandler({ sender })(job({ email, adminUserId: admin.id }));
    await expect(organizationInviteJobHandler({ sender })(job({ email, adminUserId: admin.id }))).rejects.toThrow("convite pendente");
    expect(sender.sent).toHaveLength(1);
    expect(await invitationsFor(email)).toHaveLength(1);
  });

  it("recusa autor que não é Superadmin", async () => {
    const user = await createUser();
    const email = newEmail();
    await expect(organizationInviteJobHandler({ sender: new FakeSender() })(job({ email, adminUserId: user.id }))).rejects.toBeInstanceOf(ForbiddenError);
    expect(await invitationsFor(email)).toHaveLength(0);
  });

  it("recusa pedido malformado", async () => {
    await expect(organizationInviteJobHandler({ sender: new FakeSender() })(job({ email: 123 }))).rejects.toThrow("Job de convite inválido");
  });
});
