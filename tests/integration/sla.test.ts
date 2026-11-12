// I-5: SLA (CA-12.2 a CA-12.5, CA-11.3, CA-03.3), alertas, dashboard (CA-14.1, CA-14.2, CA-14.4, CA-14.5),
// backoffice do Superadmin (CA-16.4, CA-16.6, RF-CON-02, RF-CON-04).
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { withPlatformAdmin, withTenant } from "@/server/db/tenant";
import { DomainError, ForbiddenError } from "@/server/errors";
import { getDashboard } from "@/server/dashboard/metrics";
import { listNotifications, markNotificationsRead, unreadCount } from "@/server/notifications/service";
import { getChecklist } from "@/server/organizations/onboarding";
import { resolveActor, setExecutiveRead, changeMemberRole } from "@/server/organizations/service";
import { addTeamMember, createTeam } from "@/server/organizations/teams";
import { listPlatformOrganizations, setGlobalBudget, setOrganizationQuota, setOrganizationStatus } from "@/server/platform/backoffice";
import { createContact, listContacts } from "@/server/servicedesk/contacts";
import { applySuggestedTaxonomy, getAiSettings } from "@/server/servicedesk/taxonomy";
import { createManualTicket, listTickets, updateTicketFields } from "@/server/servicedesk/tickets";
import { setClassificationField } from "@/server/servicedesk/triage-review";
import { addPublicReply, assumeTicket, changeStatus } from "@/server/servicedesk/workflow";
import { getTicketSla, refreshSla, slaJobHandler } from "@/server/sla/service";
import { addHoliday, removeHoliday, updateBusinessHours, updateSlaPolicies } from "@/server/sla/settings";
import { currentPeriod } from "@/server/ai/triage";
import { addMember, createOrganization, createPlatformAdmin, withMigrator } from "./helpers";

type Org = Awaited<ReturnType<typeof createOrganization>>;
type Member = Awaited<ReturnType<typeof addMember>>;
let admin: { id: string };
let A: Org, B: Org;
let agentA: Member, managerA: Member;
let contactA: string;

const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof DomainError ? e.code : e instanceof ForbiddenError ? "forbidden" : String(e)));
const MIN = 60_000;

/** Simula que o relógio do SLA começou `minutes` atrás (intervalo aberto) e recalcula. */
async function backdate(org: Org, ticketId: string, minutes: number) {
  const start = new Date(Date.now() - minutes * MIN);
  await withMigrator((c) => c.query("UPDATE tickets SET created_at = $1, sla_intervals = $2::jsonb WHERE id = $3", [start, JSON.stringify([[start.toISOString(), null]]), ticketId]));
  await withTenant(org.actor, (tx) => refreshSla(tx, org.organizationId, ticketId));
}
const slaEvents = (org: Org, ticketId: string) => withTenant(org.actor, (tx) => tx.slaEvent.findMany({ where: { ticketId }, orderBy: { kind: "asc" } }));
const newTicket = (org: Org, extra: Record<string, unknown> = {}) =>
  createManualTicket(org.actor, { contactId: contactA, subject: "Chamado SLA", description: "Teste de SLA", ...extra });

beforeAll(async () => {
  admin = await createPlatformAdmin();
  A = await createOrganization(admin);
  B = await createOrganization(admin);
  agentA = await addMember(A.actor, "agent");
  managerA = await addMember(A.actor, "manager");
  contactA = (await createContact(A.actor, { name: "Contato SLA", email: `sla-${Date.now()}@exemplo.test` })).id;
  // Horas corridas para testes independentes do horário em que rodam
  await updateSlaPolicies(A.actor, {
    medium: { firstResponseMinutes: 60, resolutionMinutes: 240, businessHours: false },
    high: { firstResponseMinutes: 30, resolutionMinutes: 120, businessHours: false },
  });
});

describe("metas e calendário (RF-SLA-01, RF-ORG-07; CA-12.3, CA-03.3)", () => {
  it("CA-12.3: metas valem para chamados criados depois da configuração", async () => {
    const before = await newTicket(A, { priority: "low" });
    expect((await getTicketSla(A.actor, before.id))!.first_response.state).toBe("none");
    await updateSlaPolicies(A.actor, { low: { firstResponseMinutes: 600, resolutionMinutes: null, businessHours: false } });
    const after = await newTicket(A, { priority: "low" });
    expect((await getTicketSla(A.actor, after.id))!.first_response).toMatchObject({ state: "ok", targetSeconds: 36_000 });
    expect((await getTicketSla(A.actor, before.id))!.first_response.state).toBe("none");
    await updateSlaPolicies(A.actor, { low: { firstResponseMinutes: null, resolutionMinutes: null, businessHours: false } });
  });

  it("CA-03.3: horário comercial alterado vale para chamados criados depois; feriados e validações", async () => {
    const D = await createOrganization(admin);
    await updateSlaPolicies(D.actor, { medium: { firstResponseMinutes: 60, resolutionMinutes: null, businessHours: true } });
    const c = await createContact(D.actor, { name: "Contato Sintético", email: `d-${Date.now()}@exemplo.test` });
    const t1 = await createManualTicket(D.actor, { contactId: c.id, subject: "A", description: "B" });
    await updateBusinessHours(D.actor, { "6": { start: "08:00", end: "12:00" } });
    const t2 = await createManualTicket(D.actor, { contactId: c.id, subject: "A", description: "B" });
    const snap = (id: string) => withTenant(D.actor, (tx) => tx.ticket.findUniqueOrThrow({ where: { id }, select: { slaSnapshot: true } }));
    expect(((await snap(t1.id)).slaSnapshot as { week: object }).week).toHaveProperty("1");
    expect(((await snap(t2.id)).slaSnapshot as { week: object }).week).toEqual({ "6": [480, 720] });
    expect(await code(updateBusinessHours(D.actor, { "1": { start: "18:00", end: "09:00" } }))).toBe("invalid_business_hours");
    const h = await addHoliday(D.actor, { date: "2026-12-25", name: "Natal" });
    expect(await code(addHoliday(D.actor, { date: "2026-12-25", name: "Outro" }))).toBe("holiday_exists");
    expect(await code(addHoliday(D.actor, { date: "2026-02-30", name: "Inválido" }))).toBe("invalid_holiday");
    await removeHoliday(D.actor, h.id);
    expect(await code(updateSlaPolicies(D.actor, { high: { firstResponseMinutes: -5, resolutionMinutes: null, businessHours: true } }))).toBe("invalid_sla");
    expect(await code(updateSlaPolicies(agentA.actor, {}))).toBe("forbidden");
    const done = (await getChecklist(D.actor)).items.filter((i) => i.completedAt).map((i) => i.item);
    expect(done).toEqual(expect.arrayContaining(["sla", "business_hours"]));
  });
});

describe("alertas e violações (RF-SLA-03 a 05; CA-12.2, CA-12.4, CA-12.5)", () => {
  it("CA-12.2: risco e violação registrados uma vez por chamado e meta, com alerta ao responsável e ao Gestor", async () => {
    const t = await newTicket(A);
    await assumeTicket(agentA.actor, t.id);
    await backdate(A, t.id, 50); // 50 de 60 min: em risco
    let ev = await slaEvents(A, t.id);
    expect(ev.map((e) => `${e.metric}:${e.kind}`)).toEqual(["first_response:risk"]);
    expect((await getTicketSla(A.actor, t.id))!.first_response.state).toBe("risk");
    await backdate(A, t.id, 70); // violado
    await withTenant(A.actor, (tx) => refreshSla(tx, A.organizationId, t.id)); // repetição não duplica
    ev = await slaEvents(A, t.id);
    expect(ev.map((e) => `${e.metric}:${e.kind}`).sort()).toEqual(["first_response:breach", "first_response:risk"]);
    const forAgent = (await listNotifications(agentA.actor)).rows.filter((n) => n.ticket?.number === t.number).map((n) => n.type).sort();
    const forManager = (await listNotifications(managerA.actor)).rows.filter((n) => n.ticket?.number === t.number).map((n) => n.type).sort();
    expect(forAgent).toEqual(["sla.breach", "sla.risk"]);
    expect(forManager).toEqual(["sla.breach", "sla.risk"]);
    // O Administrador não é destinatário (há Gestor) e não lê alertas alheios (RLS)
    expect((await listNotifications(A.actor)).rows.filter((n) => n.ticket?.number === t.number)).toHaveLength(0);
    const timeline = await withTenant(A.actor, (tx) => tx.ticketEvent.findMany({ where: { ticketId: t.id, type: { startsWith: "sla." } } }));
    expect(timeline.map((e) => e.type).sort()).toEqual(["sla.breach", "sla.risk"]);
  });

  it("CA-12.4: o chamado exibe tempo restante coerente; resposta encerra a meta de primeira resposta", async () => {
    const t = await newTicket(A);
    await backdate(A, t.id, 15);
    const sla = (await getTicketSla(A.actor, t.id))!;
    expect(sla.first_response.state).toBe("ok");
    expect(sla.first_response.remainingSeconds!).toBeGreaterThan(44 * 60);
    expect(sla.first_response.remainingSeconds!).toBeLessThanOrEqual(45 * 60);
    expect(Math.abs(sla.first_response.dueAt!.getTime() - (Date.now() + 45 * MIN))).toBeLessThan(5_000);
    await addPublicReply(agentA.actor, t.id, "Resposta dentro do prazo.");
    const after = (await getTicketSla(A.actor, t.id))!;
    expect(after.first_response.state).toBe("met");
    const row = await withTenant(A.actor, (tx) => tx.ticket.findUniqueOrThrow({ where: { id: t.id } }));
    expect(row.firstResponseDueAt).toBeNull();
    expect(row.resolutionDueAt).not.toBeNull();
  });

  it("CA-12.5: violação registrada não é removida por mudança de prioridade ou status; é imutável", async () => {
    const t = await newTicket(A, { type: "complaint" });
    await assumeTicket(agentA.actor, t.id);
    await backdate(A, t.id, 45); // high: meta de 30 min → ainda não; medium 60 → risco? 45 < 48
    expect((await slaEvents(A, t.id)).map((e) => e.kind)).toEqual([]);
    await updateTicketFields(A.actor, t.id, { priority: "high" }); // RN-24: recalcula com 30 min → violado
    expect((await slaEvents(A, t.id)).map((e) => e.kind).sort()).toEqual(["breach", "risk"]);
    await updateTicketFields(A.actor, t.id, { priority: "medium" });
    await changeStatus(A.actor, t.id, "waiting_customer");
    expect((await slaEvents(A, t.id)).map((e) => e.kind).sort()).toEqual(["breach", "risk"]);
    const id = (await slaEvents(A, t.id))[0]!.id;
    await expect(withTenant(A.actor, (tx) => tx.slaEvent.delete({ where: { id } }))).rejects.toThrow();
    await expect(withMigrator((c) => c.query("UPDATE sla_events SET kind = 'risk' WHERE id = $1", [id]))).rejects.toThrow(/somente inserção/);
  });

  it("pausa: Aguardando cliente para o relógio e remove o prazo; job agendado verifica no instante", async () => {
    const t = await newTicket(A);
    const job = await getDb().job.findFirst({ where: { type: "sla.check", idempotencyKey: { startsWith: `${t.id}:first_response:risk:` } } });
    expect(job).not.toBeNull();
    // Antes do instante, o handler adia (nova tentativa)
    const early = { id: job!.id, type: job!.type, organization_id: A.organizationId, payload: job!.payload, attempts: 1, max_attempts: 5 };
    await expect(slaJobHandler()(early)).rejects.toThrow("sla_check_early");
    await assumeTicket(agentA.actor, t.id);
    await changeStatus(agentA.actor, t.id, "waiting_customer");
    const row = await withTenant(A.actor, (tx) => tx.ticket.findUniqueOrThrow({ where: { id: t.id } }));
    expect(row.firstResponseDueAt).toBeNull();
    expect((await getTicketSla(A.actor, t.id))!.first_response.state).toBe("paused");
  });

  it("CA-11.3: a visão SLA em risco lista apenas chamados com 80% ou mais consumido; filtro e ordenação por prazo", async () => {
    const C = await createOrganization(admin);
    await updateSlaPolicies(C.actor, { medium: { firstResponseMinutes: 100, resolutionMinutes: null, businessHours: false } });
    const c = await createContact(C.actor, { name: "Contato Sintético", email: `c-${Date.now()}@exemplo.test` });
    const mk = async (minutes: number) => {
      const t = await createManualTicket(C.actor, { contactId: c.id, subject: `${minutes} min`, description: "x" });
      await backdate(C, t.id, minutes);
      return t.id;
    };
    const t10 = await mk(10), t79 = await mk(79), t85 = await mk(85), t120 = await mk(120);
    const ids = async (f: Parameters<typeof listTickets>[1]) => (await listTickets(C.actor, f)).rows.map((r) => r.id);
    expect((await ids({ view: "sla_risk" })).sort()).toEqual([t85, t120].sort());
    expect(await ids({ sla: "breached" })).toEqual([t120]);
    expect(await ids({ sla: "at_risk" })).toEqual([t85]);
    expect((await ids({ sla: "on_time" })).sort()).toEqual([t10, t79].sort());
    expect(await ids({ sort: "sla" })).toEqual([t120, t85, t79, t10]);
    const rows = (await listTickets(C.actor, { sort: "sla" })).rows;
    expect(rows.map((r) => r.sla)).toEqual(["breached", "at_risk", "on_time", "on_time"]);
  });

  it("alertas: marcar como lidos afeta só a própria pessoa", async () => {
    const before = await unreadCount(managerA.actor);
    expect(before).toBeGreaterThan(0);
    await markNotificationsRead(managerA.actor, "all");
    expect(await unreadCount(managerA.actor)).toBe(0);
    expect(await unreadCount(agentA.actor)).toBeGreaterThan(0);
  });
});

describe("dashboard (RF-DSH-01 a 05; CA-14.1, CA-14.2, CA-14.4, CA-14.5)", () => {
  let E: Org;
  let teamX: string;
  let catEntrega: string, catPagamento: string;
  // Período de ontem a hoje: a base criada há até 3 h fica dentro dele a qualquer hora do dia
  const day = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + offset * 86_400_000));
  const period = () => ({ from: day(-1), to: day(0) });

  beforeAll(async () => {
    E = await createOrganization(admin);
    teamX = (await createTeam(E.actor, "Time X")).id;
    await addTeamMember(E.actor, teamX, E.actor.membershipId);
    await applySuggestedTaxonomy(E.actor);
    const cats = await withTenant(E.actor, (tx) => tx.category.findMany());
    catEntrega = cats.find((c) => c.name === "Entrega")!.id;
    catPagamento = cats.find((c) => c.name === "Pagamento")!.id;
    await updateSlaPolicies(E.actor, { medium: { firstResponseMinutes: 60, resolutionMinutes: 240, businessHours: false } });
    const c = await createContact(E.actor, { name: "Contato Sintético", email: `e-${Date.now()}@exemplo.test` });
    const mk = (extra: Record<string, unknown>) => createManualTicket(E.actor, { contactId: c.id, subject: "S", description: "D", type: "complaint", ...extra });
    // Base conhecida:
    // t1: equipe X, Entrega, respondido em 30 min (cumpre 1ª resposta), resolvido em 2 h (cumpre resolução)
    // t2: equipe X, Pagamento, respondido em 90 min (viola 1ª resposta), em aberto
    // t3: sem equipe, Entrega, cancelado (fora dos tempos e do SLA)
    // t4: sem equipe, Pagamento, novo, sem resposta
    const t1 = await mk({ teamId: teamX });
    const t2 = await mk({ teamId: teamX });
    const t3 = await mk({});
    const t4 = await mk({});
    for (const [t, cat] of [[t1, catEntrega], [t2, catPagamento], [t3, catEntrega], [t4, catPagamento]] as const) await setClassificationField(E.actor, t.id, "category", cat);
    // Operações reais primeiro (dentro do prazo), depois os instantes são deslocados para valores conhecidos
    await addPublicReply(E.actor, t1.id, "ok");
    await changeStatus(E.actor, t1.id, "resolved");
    await addPublicReply(E.actor, t2.id, "atrasado");
    await changeStatus(E.actor, t3.id, "cancelled", { reason: "Duplicado" });
    const ago = (min: number) => new Date(Date.now() - min * MIN);
    const plus = (d: Date, min: number) => new Date(d.getTime() + min * MIN);
    const c1 = ago(150), c2 = ago(180), c3 = ago(180), c4 = ago(180);
    await withMigrator(async (db) => {
      const set = (id: string, sql: string, params: unknown[]) => db.query(`UPDATE tickets SET ${sql} WHERE id = $1`, [id, ...params]);
      await set(t1.id, "created_at = $2, first_responded_at = $3, resolved_at = $4, first_response_business_secs = 1800, resolution_business_secs = 7200, sla_intervals = $5::jsonb",
        [c1, plus(c1, 30), plus(c1, 120), JSON.stringify([[c1.toISOString(), plus(c1, 120).toISOString()]])]);
      await set(t2.id, "created_at = $2, first_responded_at = $3, first_response_business_secs = 5400, sla_intervals = $4::jsonb",
        [c2, plus(c2, 90), JSON.stringify([[c2.toISOString(), null]])]);
      await set(t3.id, "created_at = $2", [c3]);
      await set(t4.id, "created_at = $2, sla_intervals = $3::jsonb", [c4, JSON.stringify([[c4.toISOString(), null]])]);
    });
    await withTenant(E.actor, async (tx) => {
      for (const t of [t1, t2, t3, t4]) await refreshSla(tx, E.organizationId, t.id);
    });
  });

  it("CA-14.1: indicadores coincidem com a base conhecida (RN-40 a RN-45)", async () => {
    const d = await getDashboard(E.actor, period());
    expect(d).toMatchObject({ received: 4, resolved: 1, backlog: 2 });
    expect(d.firstResponse.count).toBe(2);
    expect(d.firstResponse.calendar.avg).toBeCloseTo(3600, 0); // (30 + 90) / 2 min
    expect(d.firstResponse.business.median).toBeCloseTo(3600, 0);
    expect(d.resolution).toMatchObject({ count: 1 });
    expect(d.resolution.calendar.avg).toBeCloseTo(7200, 0);
    // RN-42: t1 cumpriu; t2 respondeu tarde e t4 venceu sem resposta
    expect(d.sla.firstResponse).toMatchObject({ achieved: 1, breached: 2 });
    expect(d.sla.firstResponse.rate).toBeCloseTo(1 / 3, 5);
    expect(d.sla.resolution).toMatchObject({ achieved: 1, breached: 0, rate: 1 });
    expect(d.byCategory.find((r) => r.key === catEntrega)?.total).toBe(2);
    expect(d.byPriority).toEqual([{ key: "medium", total: 4 }]);
    expect(d.byTeam.find((r) => r.teamId === teamX)).toMatchObject({ received: 2, resolved: 1, backlog: 1 });
    expect(d.csat).toMatchObject({ responses: 0, rate: null, average: null, distribution: [0, 0, 0, 0, 0] });
  });

  it("CA-14.5: filtros por equipe, categoria e canal alteram os indicadores", async () => {
    expect(await getDashboard(E.actor, { ...period(), teamId: teamX })).toMatchObject({ received: 2, resolved: 1, backlog: 1 });
    expect(await getDashboard(E.actor, { ...period(), categoryId: catPagamento })).toMatchObject({ received: 2, resolved: 0, backlog: 2 });
    expect((await getDashboard(E.actor, { ...period(), channel: "email" })).received).toBe(0);
    expect(await code(getDashboard(E.actor, { from: "2026-13-01" }))).toBe("invalid_period");
    expect(await code(getDashboard(E.actor, { from: "2025-01-01", to: "2026-11-11" }))).toBe("invalid_period");
  });

  it("CA-14.2: aceitação da triagem segue RN-13 (execução mais recente, só campos revisados)", async () => {
    const T = await createOrganization(admin);
    const c = await createContact(T.actor, { name: "Contato Sintético", email: `t-${Date.now()}@exemplo.test` });
    const t = await createManualTicket(T.actor, { contactId: c.id, subject: "S", description: "D" });
    const run = (id: string, at: string) => withMigrator((db) => db.query(
      "INSERT INTO triage_runs (organization_id, id, ticket_id, idempotency_key, model, prompt_version, status, created_at) VALUES ($1, $2, $3, $4, 'fake', 'triage-v2', 'succeeded', $5)",
      [T.organizationId, id, t.id, id, at]));
    const review = (runId: string, field: string, outcome: string) => withMigrator((db) => db.query(
      "INSERT INTO triage_reviews (organization_id, id, triage_run_id, field, suggested_value, outcome, reviewed_at) VALUES ($1, gen_random_uuid(), $2, $3, 'x', $4::review_outcome, CASE WHEN $4 = 'pending' THEN NULL ELSE now() END)",
      [T.organizationId, runId, field, outcome]));
    const old = crypto.randomUUID(), latest = crypto.randomUUID();
    await run(old, new Date(Date.now() - 60 * MIN).toISOString());
    await review(old, "type", "changed"); // execução antiga: fora do cálculo
    await run(latest, new Date().toISOString());
    await review(latest, "type", "accepted");
    await review(latest, "category", "accepted");
    await review(latest, "reason", "changed");
    await review(latest, "priority", "pending");
    const d = await getDashboard(T.actor, period());
    expect(d.triage).toMatchObject({ accepted: 2, changed: 1, pending: 1 });
    expect(d.triage.rate).toBeCloseTo(2 / 3, 5);
    expect(d.triage.byField.find((f) => f.field === "type")).toMatchObject({ accepted: 1, changed: 0, rate: 1 });
  });

  it("CA-14.4: leitura executiva acessa o dashboard e recebe 403 em chamados, contatos e configurações", async () => {
    const slug = (await withTenant(E.actor, (tx) => tx.organization.findUniqueOrThrow({ where: { id: E.organizationId } }))).slug;
    const exec = await addMember(E.actor, "manager");
    await setExecutiveRead(E.actor, exec.actor.membershipId, true);
    const actor = (await resolveActor(exec.id, slug))!;
    expect(actor.executiveRead).toBe(true);
    expect((await getDashboard(actor, period())).received).toBe(4);
    expect(await code(listTickets(actor))).toBe("forbidden");
    expect(await code(listContacts(actor))).toBe("forbidden");
    expect(await code(getAiSettings(actor))).toBe("forbidden");
    expect(await code(updateSlaPolicies(actor, {}))).toBe("forbidden");
    expect(await code(setExecutiveRead(E.actor, B.actor.membershipId, true))).toBe("member_not_found");
    expect(await code(setExecutiveRead(E.actor, E.actor.membershipId, true))).toBe("executive_read_manager_only");
    // Mudar o perfil remove a leitura executiva
    await changeMemberRole(E.actor, exec.actor.membershipId, "agent");
    expect((await resolveActor(exec.id, slug))!.executiveRead).toBe(false);
    expect(await code(getDashboard(agentA.actor))).toBe("forbidden");
  });
});

describe("backoffice do Superadmin (RF-ORG-09, RF-CON-02, RF-CON-04; CA-16.4, CA-16.6)", () => {
  it("lista organizações com consumo agregado, sem acesso a conteúdo de chamados", async () => {
    const data = await listPlatformOrganizations(admin.id);
    expect(data.organizations.map((o) => o.id)).toEqual(expect.arrayContaining([A.organizationId, B.organizationId]));
    const counts = await withPlatformAdmin(admin.id, async (tx) => ({
      tickets: await tx.ticket.count(), messages: await tx.ticketMessage.count(), contacts: await tx.contact.count(), memberships: await tx.membership.count(),
    }));
    expect(counts).toEqual({ tickets: 0, messages: 0, contacts: 0, memberships: 0 });
    await expect(listPlatformOrganizations(agentA.id)).rejects.toThrow();
  });

  it("CA-16.4: organização suspensa bloqueia o acesso da equipe, com dados preservados", async () => {
    const S = await createOrganization(admin);
    const slug = (await listPlatformOrganizations(admin.id)).organizations.find((o) => o.id === S.organizationId)!.slug;
    await setOrganizationStatus(admin.id, S.organizationId, "suspended");
    expect(await resolveActor(S.owner.id, slug)).toBeNull();
    await setOrganizationStatus(admin.id, S.organizationId, "active");
    expect(await resolveActor(S.owner.id, slug)).not.toBeNull();
    expect(await code(setOrganizationStatus(admin.id, S.organizationId, "active"))).toBe("organization_not_found");
    const audit = await withPlatformAdmin(admin.id, (tx) => tx.auditLog.findMany({ where: { targetId: S.organizationId }, select: { action: true } }));
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["organization.suspended", "organization.reactivated"]));
  });

  it("RF-CON-02 e CA-16.6: cota definida pelo Superadmin vale no mês e aparece para o Administrador", async () => {
    await setOrganizationQuota(admin.id, B.organizationId, 42);
    const ai = await getAiSettings(B.actor);
    expect(ai.quota.limit).toBe(42);
    const q = await withTenant(B.actor, (tx) => tx.aiQuota.findUnique({ where: { organizationId_period: { organizationId: B.organizationId, period: currentPeriod() } } }));
    expect(q?.limitOps).toBe(42);
    expect(await code(setOrganizationQuota(admin.id, B.organizationId, -1))).toBe("invalid_quota");
  });

  it("RF-CON-04: teto global definido pelo Superadmin; abaixo do gasto, suspende", async () => {
    const period = currentPeriod();
    const prev = await getDb().platformAiBudget.findUnique({ where: { period } });
    await setGlobalBudget(admin.id, 0);
    expect((await getDb().platformAiBudget.findUniqueOrThrow({ where: { period } })).trippedAt).not.toBeNull();
    await setGlobalBudget(admin.id, prev ? Number(prev.limitUsdMicros) / 1e6 : 5);
    expect((await getDb().platformAiBudget.findUniqueOrThrow({ where: { period } })).trippedAt).toBeNull();
    expect(await code(setGlobalBudget(admin.id, Number.NaN))).toBe("invalid_budget");
  });
});
