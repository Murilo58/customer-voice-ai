// Home da organização: indicadores coincidem com as visões da lista, respeitam o isolamento entre
// organizações e a permissão de atendimento (leitura executiva não acessa).
import { beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@/server/db/tenant";
import { DomainError, ForbiddenError } from "@/server/errors";
import { resolveActor, setExecutiveRead } from "@/server/organizations/service";
import { createContact } from "@/server/servicedesk/contacts";
import { getHomeSummary } from "@/server/servicedesk/home";
import { createManualTicket, listTickets } from "@/server/servicedesk/tickets";
import { assumeTicket, changeStatus } from "@/server/servicedesk/workflow";
import { addMember, createOrganization, createPlatformAdmin, withMigrator } from "./helpers";

type Org = Awaited<ReturnType<typeof createOrganization>>;
let A: Org, B: Org;
let agentA: Awaited<ReturnType<typeof addMember>>;
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof DomainError ? e.code : e instanceof ForbiddenError ? "forbidden" : String(e)));

beforeAll(async () => {
  const admin = await createPlatformAdmin();
  A = await createOrganization(admin);
  B = await createOrganization(admin);
  agentA = await addMember(A.actor, "agent");
  const contactA = (await createContact(A.actor, { name: "Contato Home", email: `home-${Date.now()}@exemplo.test` })).id;
  const contactB = (await createContact(B.actor, { name: "Contato Home B", email: `home-b-${Date.now()}@exemplo.test` })).id;
  const t1 = await createManualTicket(A.actor, { contactId: contactA, subject: "Home 1", description: "Indicadores da home" });
  const t2 = await createManualTicket(A.actor, { contactId: contactA, subject: "Home 2", description: "Indicadores da home" });
  await createManualTicket(A.actor, { contactId: contactA, subject: "Home 3", description: "Indicadores da home" });
  await assumeTicket(agentA.actor, t1.id);
  await assumeTicket(A.actor, t2.id);
  await changeStatus(A.actor, t2.id, "waiting_customer");
  // Prazo de SLA vencido em um chamado ativo (violado e, portanto, também na visão "SLA em risco")
  const past = new Date(Date.now() - 60_000);
  await withMigrator((c) => c.query("UPDATE tickets SET first_response_risk_at = $1, first_response_due_at = $1 WHERE id = $2", [past, t2.id]));
  // Ruído em outra organização: não pode aparecer nos números de A
  for (let i = 0; i < 4; i++) await createManualTicket(B.actor, { contactId: contactB, subject: `B ${i}`, description: "Outra organização" });
});

describe("Home da organização", () => {
  it("conta chamados da própria organização, coerentes com as visões da lista", async () => {
    const s = await getHomeSummary(A.actor);
    expect(s.active).toBe(3);
    expect(s.createdToday).toBe(3);
    expect(s.waiting).toBe(1);
    expect(s.slaBreached).toBe(1);
    expect(s.slaRisk).toBe((await listTickets(A.actor, { view: "sla_risk" })).rows.length);
    expect(s.slaBreached).toBe((await listTickets(A.actor, { sla: "breached" })).rows.length);
    expect(s.triageReview).toBe((await listTickets(A.actor, { view: "triage_review" })).rows.length);
    expect(s.new).toBe((await listTickets(A.actor, { status: "new" })).rows.length);
    expect(s.unassigned).toBe((await listTickets(A.actor, { assignee: "none" })).rows.filter((r) => ["new", "open", "waiting_customer", "waiting_third_party"].includes(r.status)).length);

    const mine = await getHomeSummary(agentA.actor);
    expect(mine.mine).toBe(1);
    expect(mine.mine).toBe((await listTickets(agentA.actor, { view: "mine" })).rows.length);
    expect(mine.teamUnassigned).toBe((await listTickets(agentA.actor, { view: "team_unassigned" })).rows.length);

    const b = await getHomeSummary(B.actor);
    expect(b.active).toBe(4);
    expect(b.slaBreached).toBe(0);
  });

  it("leitura executiva não acessa os indicadores de atendimento", async () => {
    const exec = await addMember(A.actor, "manager");
    await setExecutiveRead(A.actor, exec.actor.membershipId, true);
    const slug = (await withTenant(A.actor, (tx) => tx.organization.findUniqueOrThrow({ where: { id: A.organizationId } }))).slug;
    const actor = (await resolveActor(exec.id, slug))!;
    expect(await code(getHomeSummary(actor))).toBe("forbidden");
  });
});
