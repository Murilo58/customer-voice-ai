// Suíte de isolamento multi-tenant (RSG-03; ADR-002). Bloqueante no CI.
import { beforeAll, describe, expect, it } from "vitest";
import { generateToken, hashToken, newId } from "@/lib/security";
import { getDb } from "@/server/db/client";
import { withInvitationToken, withPublicSlug, withReplyToken, withTenant, withUser } from "@/server/db/tenant";
import { replyToken } from "@/server/security/tokens";
import { inviteMember } from "@/server/organizations/service";
import { createCompany, createContact } from "@/server/servicedesk/contacts";
import { addInternalNote, createManualTicket } from "@/server/servicedesk/tickets";
import { applySuggestedTaxonomy, setAiEnabled } from "@/server/servicedesk/taxonomy";
import { triageJobHandler } from "@/server/ai/triage";
import { SimulatedTriageProvider } from "@/server/ai/provider";
import { addTeamMember, createTeam } from "@/server/organizations/teams";
import { addPublicReply, assumeTicket } from "@/server/servicedesk/workflow";
import { refreshSla } from "@/server/sla/service";
import { addHoliday, updateSlaPolicies } from "@/server/sla/settings";
import { runJobById } from "@/server/jobs/outbox";
import { addMember, createOrganization, createPlatformAdmin, createUser, withMigrator } from "./helpers";

type Org = Awaited<ReturnType<typeof createOrganization>>;
let A: Org, B: Org;
let agentA: Awaited<ReturnType<typeof addMember>>;
let pendingTokenA: string;

const TENANT_TABLES = ["organization", "membership", "userInvitation", "auditLog", "clientCompany", "contact", "ticket", "ticketMessage", "ticketEvent", "category", "reason", "triageRun", "triageReview", "aiUsageEvent", "aiQuota", "team", "teamMember", "onboardingItem", "outboundEmail", "holiday", "slaPolicy", "slaEvent", "notification",
  "attachment", "csatResponse", "inboundMessage", "quarantineItem", "emailEvent", "portalAccessToken", "portalSession"] as const;
const replyTokens: Record<string, string> = {};
const CHILD_TABLES = TENANT_TABLES.filter((t) => t !== "organization");
const handlers = { triage: triageJobHandler({ provider: new SimulatedTriageProvider(), retryDelayMs: 0 }) };

async function counts(tx: any) {
  return Object.fromEntries(await Promise.all(TENANT_TABLES.map(async (t) => [t, await tx[t].count()])));
}

beforeAll(async () => {
  const admin = await createPlatformAdmin();
  A = await createOrganization(admin);
  B = await createOrganization(admin);
  agentA = await addMember(A.actor, "agent");
  await addMember(B.actor, "manager");
  const pending = await inviteMember(A.actor, { email: `pendente-${Date.now()}@exemplo.test`, role: "agent" });
  pendingTokenA = pending.token;
  await inviteMember(B.actor, { email: `pendente-b-${Date.now()}@exemplo.test`, role: "agent" });
  for (const org of [A, B]) {
    const company = await createCompany(org.actor, { name: "Empresa Sintética" });
    // Mesmo e-mail nas duas organizações: permitido (CA-19.2)
    const contact = await createContact(org.actor, { name: "Cliente Sintético", email: "cliente@exemplo.test", clientCompanyId: company.id });
    await setAiEnabled(org.actor, true);
    await applySuggestedTaxonomy(org.actor);
    const t = await createManualTicket(org.actor, { contactId: contact.id, subject: "Pedido não chegou", description: "A entrega atrasou." });
    await addInternalNote(org.actor, t.id, "Nota interna");
    expect(await runJobById(t.jobId!, handlers)).toBe("succeeded");
    const team = await createTeam(org.actor, "Equipe Sintética");
    await addTeamMember(org.actor, team.id, org.actor.membershipId);
    await addPublicReply(org.actor, t.id, "Resposta sintética");
    await addHoliday(org.actor, { date: "2026-12-25", name: "Natal" });
    await updateSlaPolicies(org.actor, { medium: { firstResponseMinutes: 1, resolutionMinutes: 2, businessHours: false } });
    const late = await createManualTicket(org.actor, { contactId: contact.id, subject: "SLA vencido", description: "Sem resposta." });
    await assumeTicket(org.actor, late.id);
    await withMigrator((c) => c.query("UPDATE tickets SET sla_intervals = $1::jsonb WHERE id = $2", [JSON.stringify([[new Date(Date.now() - 600_000).toISOString(), null]]), late.id]));
    await withTenant(org.actor, (tx) => refreshSla(tx, org.organizationId, late.id));
    // Tabelas do I-4 com uma linha por organização
    replyTokens[org.organizationId] = replyToken(t.id);
    await withTenant(org.actor, async (tx) => {
      const oid = org.organizationId;
      const outbound = await tx.outboundEmail.findFirstOrThrow({ select: { id: true } });
      await tx.attachment.create({ data: { id: newId(), organizationId: oid, ticketId: t.id, originalNameSanitized: "a.exe", declaredType: "application/x-msdownload", sizeBytes: 10, status: "rejected", sanitizeReason: "type_blocked", uploadedBy: "user" } });
      await tx.csatResponse.create({ data: { id: newId(), organizationId: oid, ticketId: t.id, resolutionSeq: 1, score: 5 } });
      const inboundId = newId();
      await tx.inboundMessage.create({ data: { id: inboundId, organizationId: oid, providerEmailId: `prov-${inboundId}`, fromAddress: "x@exemplo.test", toAddresses: [], subject: "s", bodyText: "b", classification: "quarantined", contentHash: "h" } });
      await tx.quarantineItem.create({ data: { id: newId(), organizationId: oid, inboundMessageId: inboundId, reason: "sender_mismatch" } });
      await tx.emailEvent.create({ data: { id: newId(), organizationId: oid, outboundEmailId: outbound.id, providerEventId: `evt-${newId()}`, type: "email.delivered", occurredAt: new Date() } });
      await tx.portalAccessToken.create({ data: { id: newId(), organizationId: oid, contactId: contact.id, tokenHash: generateToken().tokenHash, expiresAt: new Date(Date.now() + 60_000) } });
      await tx.portalSession.create({ data: { id: newId(), organizationId: oid, contactId: contact.id, sessionHash: generateToken().tokenHash, expiresAt: new Date(Date.now() + 60_000) } });
    });
  }
});

describe("isolamento por RLS", () => {
  it("o runtime usa app_runtime sem BYPASSRLS", async () => {
    const [r] = await getDb().$queryRaw<{ u: string; bypass: boolean }[]>`SELECT current_user::text AS u, rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`;
    expect(r).toEqual({ u: "app_runtime", bypass: false });
  });

  it("sem contexto, nenhuma tabela de tenant retorna linhas (falha fechada)", async () => {
    expect(await counts(getDb())).toEqual(Object.fromEntries(TENANT_TABLES.map((t) => [t, 0])));
  });

  it("cada organização vê apenas os próprios dados em todas as tabelas", async () => {
    for (const org of [A, B]) {
      const other = org === A ? B : A;
      await withTenant(org.actor, async (tx) => {
        const orgs = await tx.organization.findMany({ select: { id: true } });
        expect(orgs.map((o) => o.id)).toEqual([org.organizationId]);
        for (const t of CHILD_TABLES) {
          const rows: { organizationId: string | null }[] = await (tx as any)[t].findMany({ select: { organizationId: true } });
          expect(rows.length).toBeGreaterThan(0);
          expect(rows.every((r) => r.organizationId === org.organizationId)).toBe(true);
        }
        expect(await tx.membership.count({ where: { organizationId: other.organizationId } })).toBe(0);
      });
    }
  });

  it("WITH CHECK recusa escrita com organization_id de outra organização", async () => {
    const user = await createUser();
    await expect(
      withTenant(A.actor, (tx) => tx.membership.create({ data: { id: newId(), organizationId: B.organizationId, userId: user.id, role: "agent" } })),
    ).rejects.toThrow();
  });

  it("FK composta recusa referência a registro de outra organização", async () => {
    await expect(
      withTenant(A.actor, (tx) =>
        tx.userInvitation.create({
          data: {
            id: newId(), organizationId: A.organizationId, email: `x-${Date.now()}@exemplo.test`, role: "agent",
            tokenHash: generateToken().tokenHash, expiresAt: new Date(Date.now() + 60_000), createdByMembershipId: B.actor.membershipId,
          },
        })),
    ).rejects.toThrow();
  });

  it("UPDATE sem filtro afeta somente a organização do contexto", async () => {
    const before = await withTenant(B.actor, (tx) => tx.membership.findMany({ select: { id: true, executiveRead: true } }));
    const affected = await withTenant(A.actor, (tx) => tx.membership.updateMany({ data: { executiveRead: false } }));
    const membersA = await withTenant(A.actor, (tx) => tx.membership.count());
    expect(affected.count).toBe(membersA);
    const after = await withTenant(B.actor, (tx) => tx.membership.findMany({ select: { id: true, executiveRead: true } }));
    expect(after).toEqual(before);
  });

  it("contexto não sobrevive à transação (pooler em modo transação)", async () => {
    await withTenant(A.actor, (tx) => tx.organization.count());
    expect(await getDb().organization.count()).toBe(0);
    await expect(withTenant(A.actor, async () => { throw new Error("falha simulada"); })).rejects.toThrow("falha simulada");
    expect(await getDb().membership.count()).toBe(0);
  });

  it("transações concorrentes alternando organizações não vazam dados", async () => {
    const results = await Promise.all(
      Array.from({ length: 60 }, (_, i) => {
        const org = i % 2 ? A : B;
        return withTenant(org.actor, async (tx) => {
          const ids = await tx.membership.findMany({ select: { organizationId: true }, distinct: ["organizationId"] });
          return ids.length === 1 && ids[0]!.organizationId === org.organizationId;
        });
      }),
    );
    expect(results.every(Boolean)).toBe(true);
  });
});

describe("pré-contexto", () => {
  it("withUser lista só os próprios vínculos, sem ver os demais membros", async () => {
    const rows = await withUser(agentA.id, (tx) => tx.membership.findMany({ select: { userId: true, organizationId: true } }));
    expect(rows).toEqual([{ userId: agentA.id, organizationId: A.organizationId }]);
    const orgs = await withUser(agentA.id, (tx) => tx.organization.findMany({ select: { id: true } }));
    expect(orgs.map((o) => o.id)).toEqual([A.organizationId]);
  });

  it("withUser não permite escrita", async () => {
    const r = await withUser(agentA.id, (tx) => tx.membership.updateMany({ data: { executiveRead: true } }));
    expect(r.count).toBe(0);
  });

  it("o hash do token revela somente o próprio convite e a organização dele", async () => {
    const { hashToken } = await import("@/lib/security");
    const tokenHash = hashToken(pendingTokenA);
    const seen = await withInvitationToken(tokenHash, async (tx) => ({
      invitations: await tx.userInvitation.count(),
      orgs: await tx.organization.findMany({ select: { id: true } }),
      members: await tx.membership.count(),
      updated: (await tx.userInvitation.updateMany({ data: { revokedAt: new Date() } })).count,
    }));
    expect(seen).toEqual({ invitations: 1, orgs: [{ id: A.organizationId }], members: 0, updated: 0 });
    const none = await withInvitationToken(generateToken().tokenHash, (tx) => tx.userInvitation.count());
    expect(none).toBe(0);
  });

  it("slug público revela só a organização ativa, sem membros, contatos ou chamados, e não permite escrita", async () => {
    const seen = await withPublicSlug(A.slug, async (tx) => ({
      orgs: await tx.organization.findMany({ select: { id: true } }),
      members: await tx.membership.count(),
      contacts: await tx.contact.count(),
      tickets: await tx.ticket.count(),
      updated: (await tx.organization.updateMany({ data: { name: "invasão" } })).count,
    }));
    expect(seen).toEqual({ orgs: [{ id: A.organizationId }], members: 0, contacts: 0, tickets: 0, updated: 0 });
    await withMigrator((c) => c.query("UPDATE organizations SET status = 'suspended' WHERE id = $1", [B.organizationId]));
    try {
      expect(await withPublicSlug(B.slug, (tx) => tx.organization.count())).toBe(0);
    } finally {
      await withMigrator((c) => c.query("UPDATE organizations SET status = 'active' WHERE id = $1", [B.organizationId]));
    }
  });

  it("o hash do token de resposta revela só o próprio chamado, sem mensagens, e não permite escrita (RN-15a)", async () => {
    const seen = await withReplyToken(hashToken(replyTokens[A.organizationId]!), async (tx) => ({
      tickets: await tx.ticket.findMany({ select: { organizationId: true } }),
      messages: await tx.ticketMessage.count(),
      contacts: await tx.contact.count(),
      updated: (await tx.ticket.updateMany({ data: { subject: "invasão" } })).count,
    }));
    expect(seen).toEqual({ tickets: [{ organizationId: A.organizationId }], messages: 0, contacts: 0, updated: 0 });
    expect(await withReplyToken(generateToken().tokenHash, (tx) => tx.ticket.count())).toBe(0);
  });
});
