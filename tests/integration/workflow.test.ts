// I-3: equipes, status (RN-05 a RN-07), atribuição, respostas públicas e e-mail, filtros, busca,
// visões, checklist, dados da organização e recuperação de acesso.
// CA-02.4, CA-02.5, CA-03.4, CA-10.1, CA-10.2, CA-10.3, CA-10.5, CA-10.6, CA-11.1 a CA-11.5.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { DomainError, ForbiddenError } from "@/server/errors";
import { SimulatedTriageProvider } from "@/server/ai/provider";
import { loadTriageContext, triageJobHandler } from "@/server/ai/triage";
import { emailJobHandler, EMAIL_JOB } from "@/server/email/outbound";
import type { EmailMessage, EmailSender } from "@/server/email/sender";
import { getAuth } from "@/server/identity/auth";
import { processJob, runJobById, type ClaimedJob } from "@/server/jobs/outbox";
import { getChecklist } from "@/server/organizations/onboarding";
import { inviteMember, acceptMemberInvitation, updateOrganizationSettings } from "@/server/organizations/service";
import { addTeamMember, createTeam, listAssignableMembers, listTeams, renameTeam, setTeamArchived } from "@/server/organizations/teams";
import { createContact } from "@/server/servicedesk/contacts";
import { canTransition } from "@/server/servicedesk/status";
import { applySuggestedTaxonomy, setAiEnabled } from "@/server/servicedesk/taxonomy";
import { addInternalNote, createManualTicket, listTickets } from "@/server/servicedesk/tickets";
import { confirmAllSuggestions, setClassificationField } from "@/server/servicedesk/triage-review";
import { addPublicReply, assignTicket, assumeTicket, autoCloseTicket, changeStatus, setTicketTeam } from "@/server/servicedesk/workflow";
import { addMember, createOrganization, createPlatformAdmin, createUser, withMigrator } from "./helpers";

type Org = Awaited<ReturnType<typeof createOrganization>>;
type Member = Awaited<ReturnType<typeof addMember>>;
let A: Org, B: Org;
let agentA: Member, agentOther: Member, managerA: Member;
let teamA: string, teamOther: string;
let contactA: string;
let entregaId: string;

const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof DomainError ? e.code : e instanceof ForbiddenError ? "forbidden" : String(e)));
const ticketState = (org: Org, id: string) => withTenant(org.actor, (tx) => tx.ticket.findUniqueOrThrow({ where: { id } }));
const newTicket = (org: Org, extra: Record<string, unknown> = {}) =>
  createManualTicket(org.actor, { contactId: contactA, subject: "Pedido atrasado", description: "Meu pedido não chegou.", ...extra });

class FakeSender implements EmailSender {
  sent: EmailMessage[] = [];
  fail = false;
  async send(m: EmailMessage) {
    if (this.fail) throw new Error("provedor indisponível");
    this.sent.push(m);
    return { providerId: `fake-${this.sent.length}` };
  }
}

async function emailJobs(org: Org, ticketId: string) {
  const emails = await withTenant(org.actor, (tx) => tx.outboundEmail.findMany({ where: { ticketId }, orderBy: { createdAt: "asc" } }));
  const jobs = await getDb().job.findMany({ where: { type: EMAIL_JOB, idempotencyKey: { in: emails.map((e) => e.id) } } });
  return { emails, jobs };
}

beforeAll(async () => {
  const admin = await createPlatformAdmin();
  A = await createOrganization(admin);
  B = await createOrganization(admin);
  teamA = (await createTeam(A.actor, "Logística")).id;
  teamOther = (await createTeam(A.actor, "Financeiro")).id;
  agentA = await addMember(A.actor, "agent");
  agentOther = await addMember(A.actor, "agent");
  managerA = await addMember(A.actor, "manager");
  await addTeamMember(A.actor, teamA, agentA.actor.membershipId);
  await addTeamMember(A.actor, teamOther, agentOther.actor.membershipId);
  await applySuggestedTaxonomy(A.actor);
  entregaId = (await withTenant(A.actor, (tx) => tx.category.findFirstOrThrow({ where: { name: "Entrega" } }))).id;
  contactA = (await createContact(A.actor, { name: "Carla Sintética", email: `carla-${Date.now()}@exemplo.test` })).id;
});

describe("equipes (RF-ORG-06; CA-02.4, CA-02.5)", () => {
  it("cria, renomeia e recusa nome duplicado; atendente não gerencia equipes", async () => {
    const t = await createTeam(A.actor, "Temporária");
    await renameTeam(A.actor, t.id, "Temporária 2");
    expect(await code(createTeam(A.actor, "Temporária 2"))).toBe("team_name_taken");
    expect(await code(createTeam(agentA.actor, "Nova"))).toBe("forbidden");
    expect(await code(createTeam(A.actor, "X"))).toBe("invalid_team_name");
  });

  it("CA-02.4: convite com equipes cria o vínculo nas equipes; equipe inválida é recusada", async () => {
    const user = await createUser("Convidado com equipe");
    const inv = await inviteMember(A.actor, { email: user.email, role: "agent", teamIds: [teamA] });
    const accepted = await acceptMemberInvitation({ token: inv.token, userId: user.id, userEmail: user.email });
    const links = await withTenant(A.actor, (tx) => tx.teamMember.findMany({ where: { membershipId: accepted.membershipId } }));
    expect(links.map((l) => l.teamId)).toEqual([teamA]);
    const otherOrgTeam = (await createTeam(B.actor, "Equipe de B")).id;
    expect(await code(inviteMember(A.actor, { email: `x-${Date.now()}@exemplo.test`, role: "agent", teamIds: [otherOrgTeam] }))).toBe("invalid_team");
    expect(await code(inviteMember(A.actor, { email: `y-${Date.now()}@exemplo.test`, role: "agent", teamIds: ["nao-e-uuid"] }))).toBe("invalid_team");
  });

  it("CA-02.5: equipe arquivada some das opções e da lista enviada à IA; chamados antigos a mantêm", async () => {
    const t = await createTeam(A.actor, "Arquivável");
    const ticket = await newTicket(A, { teamId: t.id });
    await setTeamArchived(A.actor, t.id, true);
    expect((await listTeams(A.actor)).map((x) => x.id)).not.toContain(t.id);
    const ctx = await withTenant(A.actor, (tx) => loadTriageContext(tx, ticket.id));
    expect(ctx!.taxonomy.teams!.map((x) => x.id)).not.toContain(t.id);
    expect((await ticketState(A, ticket.id)).teamId).toBe(t.id);
    expect(await code(setTicketTeam(A.actor, ticket.id, t.id))).toBe("invalid_team");
    expect(await code(newTicket(A, { teamId: t.id }))).toBe("invalid_team");
    const audit = await withTenant(A.actor, (tx) => tx.auditLog.findMany({ where: { targetId: t.id }, select: { action: true } }));
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["team.created", "team.archived"]));
  });
});

describe("ciclo de status (RN-05, RN-06, RN-07; CA-10.2, CA-10.3)", () => {
  it("função de transição segue RN-05", () => {
    expect(canTransition("new", "open")).toBe(true);
    expect(canTransition("new", "resolved")).toBe(false);
    expect(canTransition("new", "waiting_customer")).toBe(false);
    expect(canTransition("waiting_customer", "resolved")).toBe(false);
    expect(canTransition("resolved", "open")).toBe(true);
    expect(canTransition("resolved", "closed")).toBe(false);
    expect(canTransition("resolved", "closed", "system")).toBe(true);
    expect(canTransition("closed", "open")).toBe(false);
    expect(canTransition("cancelled", "open")).toBe(false);
    expect(canTransition("waiting_third_party", "cancelled")).toBe(false);
  });

  it("CA-10.2: transições fora de RN-05 são bloqueadas no serviço", async () => {
    const t = await newTicket(A);
    expect(await code(changeStatus(A.actor, t.id, "resolved"))).toBe("invalid_transition");
    expect(await code(changeStatus(A.actor, t.id, "closed"))).toBe("invalid_transition");
    expect(await code(changeStatus(A.actor, t.id, "inventado"))).toBe("invalid_status");
    await changeStatus(A.actor, t.id, "open");
    await changeStatus(A.actor, t.id, "waiting_customer");
    expect(await code(changeStatus(A.actor, t.id, "cancelled", { reason: "Cliente desistiu" }))).toBe("invalid_transition");
    await changeStatus(A.actor, t.id, "open");
    const events = await withTenant(A.actor, (tx) => tx.ticketEvent.findMany({ where: { ticketId: t.id, type: "ticket.status_changed" }, orderBy: { createdAt: "asc" } }));
    expect(events.map((e) => (e.data as { to: string }).to)).toEqual(["open", "waiting_customer", "open"]);
  });

  it("cancelamento exige motivo e é terminal", async () => {
    const t = await newTicket(A);
    expect(await code(changeStatus(A.actor, t.id, "cancelled"))).toBe("cancel_reason_required");
    await changeStatus(A.actor, t.id, "cancelled", { reason: "Duplicado de outro chamado" });
    expect(await ticketState(A, t.id)).toMatchObject({ status: "cancelled", cancelReason: "Duplicado de outro chamado" });
    expect(await code(changeStatus(A.actor, t.id, "open"))).toBe("invalid_transition");
    // O banco também exige o motivo
    await expect(withTenant(A.actor, (tx) => tx.ticket.update({ where: { id: t.id }, data: { cancelReason: null } }))).rejects.toThrow();
  });

  it("CA-10.3: resolver sem tipo e categoria confirmados por humano é bloqueado (RN-06)", async () => {
    const t = await newTicket(A);
    await changeStatus(A.actor, t.id, "open");
    expect(await code(changeStatus(A.actor, t.id, "resolved"))).toBe("resolution_blocked");
    await setClassificationField(A.actor, t.id, "type", "complaint");
    expect(await code(changeStatus(A.actor, t.id, "resolved"))).toBe("resolution_blocked");
    await setClassificationField(A.actor, t.id, "category", entregaId);
    await changeStatus(A.actor, t.id, "resolved");
    expect(await ticketState(A, t.id)).toMatchObject({ status: "resolved", resolutionSeq: 1 });
  });

  it("CA-10.3: sugestão da IA pendente bloqueia a resolução até a revisão", async () => {
    await setAiEnabled(A.actor, true);
    const t = await newTicket(A, { description: "A entrega atrasou e o pedido não chegou." });
    const handlers = { triage: triageJobHandler({ provider: new SimulatedTriageProvider(), retryDelayMs: 0 }) };
    expect(await runJobById(t.jobId!, handlers)).toBe("succeeded");
    const s = await ticketState(A, t.id);
    expect(s).toMatchObject({ triageState: "suggested", categoryId: entregaId });
    await changeStatus(A.actor, t.id, "open");
    expect(await code(changeStatus(A.actor, t.id, "resolved"))).toBe("resolution_blocked");
    await confirmAllSuggestions(A.actor, t.id);
    await changeStatus(A.actor, t.id, "resolved");
    await setAiEnabled(A.actor, false);
  });

  it("RN-07: resolver agenda o fechamento automático; reabrir antes do prazo cancela o efeito", async () => {
    const t = await newTicket(A, { type: "complaint" });
    await setClassificationField(A.actor, t.id, "category", entregaId);
    await changeStatus(A.actor, t.id, "open");
    await changeStatus(A.actor, t.id, "resolved");
    const job = await getDb().job.findFirstOrThrow({ where: { type: "ticket.autoclose", idempotencyKey: `${t.id}:1` } });
    const days = (job.runAfter.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    // Reabertura e nova resolução: o job da 1ª resolução não fecha o chamado
    await changeStatus(A.actor, t.id, "open");
    expect(await autoCloseTicket(A.organizationId, { ticketId: t.id, resolutionSeq: 1 })).toBe("skipped");
    await changeStatus(A.actor, t.id, "resolved");
    expect(await autoCloseTicket(A.organizationId, { ticketId: t.id, resolutionSeq: 1 })).toBe("skipped");
    expect(await autoCloseTicket(A.organizationId, { ticketId: t.id, resolutionSeq: 2 })).toBe("closed");
    const s = await ticketState(A, t.id);
    expect(s.status).toBe("closed");
    expect(s.closedAt).not.toBeNull();
    expect(await autoCloseTicket(A.organizationId, { ticketId: t.id, resolutionSeq: 2 })).toBe("skipped");
    expect(await code(changeStatus(A.actor, t.id, "open"))).toBe("invalid_transition");
  });

  it("transições concorrentes: só uma vence", async () => {
    const t = await newTicket(A);
    const results = await Promise.all([changeStatus(A.actor, t.id, "open"), changeStatus(managerA.actor, t.id, "open")].map(code));
    // A perdedora vê o status já alterado (transição inválida) ou perde a verificação otimista
    expect(results.filter((r) => r !== "ok").every((r) => r === "ticket_changed" || r === "invalid_transition")).toBe(true);
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
  });
});

describe("atribuição (RF-ATD-06; CA-10.5)", () => {
  it("atendente só assume chamados das filas das suas equipes; assumir abre o chamado", async () => {
    const t = await newTicket(A, { teamId: teamA });
    expect(await code(assumeTicket(agentOther.actor, t.id))).toBe("not_team_member");
    await assumeTicket(agentA.actor, t.id);
    expect(await ticketState(A, t.id)).toMatchObject({ assigneeMembershipId: agentA.actor.membershipId, status: "open" });
    // Chamado sem equipe está na fila geral
    const geral = await newTicket(A);
    expect(await code(assumeTicket(agentOther.actor, geral.id))).toBe("ok");
  });

  it("Gestor reatribui a outro membro da equipe; fora da equipe é recusado; mudança aparece no histórico", async () => {
    const t = await newTicket(A, { teamId: teamA });
    await assumeTicket(agentA.actor, t.id);
    expect(await code(assignTicket(managerA.actor, t.id, agentOther.actor.membershipId))).toBe("assignee_not_in_team");
    await addTeamMember(A.actor, teamA, managerA.actor.membershipId);
    await assignTicket(managerA.actor, t.id, managerA.actor.membershipId);
    expect((await ticketState(A, t.id)).assigneeMembershipId).toBe(managerA.actor.membershipId);
    const events = await withTenant(A.actor, (tx) => tx.ticketEvent.findMany({ where: { ticketId: t.id, type: "ticket.assigned" }, orderBy: { createdAt: "asc" } }));
    expect(events.map((e) => e.data)).toEqual([
      { from: null, to: agentA.actor.membershipId },
      { from: agentA.actor.membershipId, to: managerA.actor.membershipId },
    ]);
    expect(await code(assignTicket(agentA.actor, t.id, agentA.actor.membershipId))).toBe("forbidden");
  });

  it("trocar a equipe remove o responsável que não é membro da nova equipe; atendente não troca equipe", async () => {
    const t = await newTicket(A, { teamId: teamA });
    await assumeTicket(agentA.actor, t.id);
    expect(await code(setTicketTeam(agentA.actor, t.id, teamOther))).toBe("forbidden");
    await setTicketTeam(managerA.actor, t.id, teamOther);
    expect(await ticketState(A, t.id)).toMatchObject({ teamId: teamOther, assigneeMembershipId: null });
    const assignable = await listAssignableMembers(managerA.actor);
    expect(assignable.map((m) => m.id)).toContain(agentOther.actor.membershipId);
  });

  it("chamado resolvido não é atribuído", async () => {
    const t = await newTicket(A, { type: "complaint" });
    await setClassificationField(A.actor, t.id, "category", entregaId);
    await changeStatus(A.actor, t.id, "open");
    await changeStatus(A.actor, t.id, "resolved");
    expect(await code(assumeTicket(agentA.actor, t.id))).toBe("ticket_not_assignable");
  });

  it("triagem sugere equipe ativa; confirmar pela atribuição registra a revisão", async () => {
    await setAiEnabled(A.actor, true);
    const t = await newTicket(A, { description: "Cobrança duplicada: falem com o financeiro." });
    const handlers = { triage: triageJobHandler({ provider: new SimulatedTriageProvider(), retryDelayMs: 0 }) };
    expect(await runJobById(t.jobId!, handlers)).toBe("succeeded");
    expect((await ticketState(A, t.id)).teamId).toBe(teamOther);
    await setTicketTeam(managerA.actor, t.id, teamOther);
    const review = await withTenant(A.actor, (tx) => tx.triageReview.findFirstOrThrow({ where: { field: "team", run: { ticketId: t.id } } }));
    expect(review).toMatchObject({ outcome: "accepted", finalValue: teamOther, reviewerMembershipId: managerA.actor.membershipId });
    await setAiEnabled(A.actor, false);
  });
});

describe("respostas públicas e e-mail (RF-ATD-04, RF-EML-01; CA-10.1, CA-10.6)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("CA-10.1: resposta pública gera e-mail; nota interna não gera", async () => {
    const t = await newTicket(A);
    await addInternalNote(A.actor, t.id, "Nota interna confidencial");
    expect((await emailJobs(A, t.id)).emails).toHaveLength(0);
    const r = await addPublicReply(agentA.actor, t.id, "Olá, Carla. Seu pedido foi reenviado.");
    const s = await ticketState(A, t.id);
    expect(s.status).toBe("open");
    expect(s.firstRespondedAt).not.toBeNull();
    const { emails, jobs } = await emailJobs(A, t.id);
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ template: "public_reply", status: "queued", messageId: r.messageId });
    expect(jobs).toHaveLength(1);
  });

  it("CA-10.6: o e-mail contém só a mensagem nova e o link; envio é idempotente", async () => {
    const t = await newTicket(A, { description: "Descrição original que não deve ir no e-mail." });
    await addInternalNote(A.actor, t.id, "Segredo interno");
    await addPublicReply(agentA.actor, t.id, "Primeira resposta.");
    const r = await addPublicReply(agentA.actor, t.id, "Segunda resposta, a nova.");
    const sender = new FakeSender();
    const handlers = { [EMAIL_JOB]: emailJobHandler({ sender }) };
    expect(await runJobById(r.jobId!, handlers)).toBe("succeeded");
    expect(sender.sent).toHaveLength(1);
    const m = sender.sent[0]!;
    expect(m.text).toContain("Segunda resposta, a nova.");
    expect(m.text).toMatch(/\/p\/org-/);
    for (const leaked of ["Primeira resposta", "Descrição original", "Segredo interno"]) expect(m.text).not.toContain(leaked);
    expect(m.subject).toMatch(/^\[[A-Z0-9]+-\d{6}\] Pedido atrasado$/);
    expect(m.messageId).toMatch(/^<[0-9a-f-]+@/);
    // Reentrega do mesmo job (pelo menos uma vez) não reenvia
    const email = await withTenant(A.actor, (tx) => tx.outboundEmail.findFirstOrThrow({ where: { messageId: r.messageId } }));
    expect(email).toMatchObject({ status: "sent", providerEmailId: "fake-1" });
    const job: ClaimedJob = { id: "x", type: EMAIL_JOB, organization_id: A.organizationId, payload: { outboundEmailId: email.id }, attempts: 1, max_attempts: 5 };
    await handlers[EMAIL_JOB](job);
    expect(sender.sent).toHaveLength(1);
  });

  it("falha do provedor: nova tentativa; na última, o e-mail fica como falha", async () => {
    const t = await newTicket(A);
    const r = await addPublicReply(agentA.actor, t.id, "Resposta com provedor fora do ar.");
    const sender = new FakeSender();
    sender.fail = true;
    const handlers = { [EMAIL_JOB]: emailJobHandler({ sender }) };
    expect(await runJobById(r.jobId!, handlers)).toBe("retry");
    const email = () => withTenant(A.actor, (tx) => tx.outboundEmail.findFirstOrThrow({ where: { messageId: r.messageId } }));
    expect(await email()).toMatchObject({ status: "queued", lastError: "provedor indisponível" });
    const outboundId = (await email()).id;
    const last: ClaimedJob = { id: r.jobId!, type: EMAIL_JOB, organization_id: A.organizationId, payload: { outboundEmailId: outboundId }, attempts: 5, max_attempts: 5 };
    expect(await processJob(last, handlers)).toBe("dead");
    expect((await email()).status).toBe("failed");
  });

  it("resolver envia aviso ao contato; responder chamado resolvido é bloqueado", async () => {
    const t = await newTicket(A, { type: "complaint" });
    await setClassificationField(A.actor, t.id, "category", entregaId);
    await changeStatus(A.actor, t.id, "open");
    await changeStatus(A.actor, t.id, "resolved");
    const { emails } = await emailJobs(A, t.id);
    expect(emails.map((e) => e.template)).toEqual(["ticket_resolved"]);
    expect(await code(addPublicReply(agentA.actor, t.id, "Mais uma"))).toBe("ticket_not_replyable");
    expect(await code(addPublicReply(agentA.actor, t.id, "   "))).toBe("invalid_reply");
  });

  it("e-mails de saída são isolados por organização", async () => {
    const t = await newTicket(A);
    await addPublicReply(agentA.actor, t.id, "Resposta de A");
    const seenByB = await withTenant(B.actor, (tx) => tx.outboundEmail.count({ where: { ticketId: t.id } }));
    expect(seenByB).toBe(0);
    expect(await code(addPublicReply(B.actor, t.id, "Intruso"))).toBe("ticket_not_found");
  });
});

describe("filtros, busca e visões (RF-ATD-10 a 12; CA-11.1 a CA-11.5)", () => {
  let C: Org;
  let cTeam1: string, cTeam2: string;
  let agentC: Member;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    C = await createOrganization(await createPlatformAdmin());
    cTeam1 = (await createTeam(C.actor, "Time 1")).id;
    cTeam2 = (await createTeam(C.actor, "Time 2")).id;
    agentC = await addMember(C.actor, "agent");
    await addTeamMember(C.actor, cTeam1, agentC.actor.membershipId);
    const marta = await createContact(C.actor, { name: "Marta Quaresma", email: `marta.quaresma-${Date.now()}@exemplo.test` });
    const joao = await createContact(C.actor, { name: "João Pires", email: `joao-${Date.now()}@exemplo.test` });
    const mk = async (key: string, contactId: string, subject: string, description: string, extra: Record<string, unknown> = {}) => {
      ids[key] = (await createManualTicket(C.actor, { contactId, subject, description, ...extra })).id;
    };
    await mk("t1", marta.id, "Geladeira chegou amassada", "Produto danificado na entrega", { teamId: cTeam1, priority: "high" });
    await mk("t2", joao.id, "Cobrança em dobro", "Fui cobrado duas vezes no cartão", { teamId: cTeam1, priority: "low" });
    await mk("t3", joao.id, "Entregas atrasadas", "Os pedidos sempre atrasam", { teamId: cTeam2, priority: "high" });
    await mk("t4", marta.id, "Dúvida sobre garantia", "Qual o prazo de garantia?");
    await assumeTicket(agentC.actor, ids.t2!);
    await withTenant(C.actor, (tx) => tx.ticket.update({ where: { id: ids.t4! }, data: { triageState: "suggested", escalationRisk: true } }));
    // t3 criado "há 10 dias" para o filtro de período
    await withMigrator((c) => c.query("UPDATE tickets SET created_at = now() - interval '10 days' WHERE id = $1", [ids.t3]));
  });

  const found = async (actor: Org["actor"], f: Parameters<typeof listTickets>[1]) => (await listTickets(actor, f)).rows.map((r) => r.id).sort();
  const sorted = (...keys: string[]) => keys.map((k) => ids[k]!).sort();

  it("CA-11.1: protocolo retorna o chamado exato", async () => {
    const t = (await listTickets(C.actor)).rows.find((r) => r.id === ids.t2)!;
    expect(await found(C.actor, { q: t.protocol })).toEqual([ids.t2]);
    expect(await found(C.actor, { q: String(t.number) })).toEqual([ids.t2]);
  });

  it("busca textual por palavra (com radical), assunto parcial, nome e e-mail do contato", async () => {
    expect(await found(C.actor, { q: "entrega" })).toEqual(sorted("t1", "t3"));
    expect(await found(C.actor, { q: "cobrado" })).toEqual(sorted("t2"));
    expect(await found(C.actor, { q: "gelad" })).toEqual(sorted("t1"));
    expect(await found(C.actor, { q: "quaresma" })).toEqual(sorted("t1", "t4"));
    expect(await found(C.actor, { q: "marta.quaresma" })).toEqual(sorted("t1", "t4"));
    expect(await found(C.actor, { q: "100%_" })).toEqual([]);
  });

  it("CA-11.2: nenhuma busca retorna resultados de outra organização", async () => {
    expect(await found(A.actor, { q: "quaresma" })).toEqual([]);
    expect(await found(A.actor, { q: "geladeira" })).toEqual([]);
  });

  it("CA-11.4: filtros combinados retornam exatamente o esperado", async () => {
    expect(await found(C.actor, { teamId: cTeam1, priority: "high" })).toEqual(sorted("t1"));
    expect(await found(C.actor, { teamId: cTeam1 })).toEqual(sorted("t1", "t2"));
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    expect(await found(C.actor, { priority: "high", from: today })).toEqual(sorted("t1"));
    const old = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - 10 * 86_400_000));
    expect(await found(C.actor, { from: old, to: old })).toEqual(sorted("t3"));
    expect(await found(C.actor, { assignee: "none", status: "new" })).toEqual(sorted("t1", "t3", "t4"));
    expect(await found(C.actor, { risk: "1" })).toEqual(sorted("t4"));
    expect(await found(C.actor, { channel: "manual", type: "complaint" })).toEqual([]);
    expect(await code(listTickets(C.actor, { from: "2026-02-30" }))).toBe("invalid_period");
    expect(await code(listTickets(C.actor, { teamId: "x" }))).toBe("invalid_filter");
  });

  it("CA-11.5 e visões pré-definidas", async () => {
    expect(await found(C.actor, { view: "triage_review" })).toEqual(sorted("t4"));
    expect(await found(agentC.actor, { view: "mine" })).toEqual(sorted("t2"));
    expect(await found(agentC.actor, { view: "team_unassigned" })).toEqual(sorted("t1"));
    expect(await found(C.actor, { view: "team_unassigned" })).toEqual([]);
    expect(await code(listTickets(C.actor, { view: "inventada" }))).toBe("invalid_view");
  });
});

describe("checklist e dados da organização (RF-ORG-07, RF-ORG-11; CA-03.4)", () => {
  it("marca automaticamente o item cuja configuração foi salva", async () => {
    const D = await createOrganization(await createPlatformAdmin());
    const done = async () => (await getChecklist(D.actor)).items.filter((i) => i.completedAt).map((i) => i.item).sort();
    expect(await done()).toEqual([]);
    await createTeam(D.actor, "Primeira equipe");
    await applySuggestedTaxonomy(D.actor);
    await inviteMember(D.actor, { email: `conv-${Date.now()}@exemplo.test`, role: "agent" });
    await updateOrganizationSettings(D.actor, { name: "Organização Renomeada", timezone: "America/Manaus" });
    expect(await done()).toEqual(["invite_team", "organization_data", "taxonomy", "teams"]);
    expect((await getChecklist(D.actor)).total).toBe(7);
    expect(await code(updateOrganizationSettings(D.actor, { name: "Nome", timezone: "Lua/Base" }))).toBe("invalid_timezone");
    expect(await code(getChecklist(agentA.actor))).toBe("forbidden");
    const org = await withTenant(D.actor, (tx) => tx.organization.findUniqueOrThrow({ where: { id: D.organizationId } }));
    expect(org).toMatchObject({ name: "Organização Renomeada", timezone: "America/Manaus" });
  });
});

describe("recuperação de acesso (RF-ORG-03)", () => {
  afterEach(() => vi.restoreAllMocks());
  const password = "senha-sintetica-123";
  const tokenFrom = (logs: string[]) => logs.map((l) => /redefinir-senha\?token=([A-Za-z0-9_-]+)/.exec(l)?.[1]).filter(Boolean).at(-1);

  it("token de uso único redefine a senha e encerra as sessões; e-mail inexistente não revela nada", async () => {
    const email = `reset-${Date.now()}@exemplo.test`;
    await getAuth().api.signUpEmail({ body: { name: "Reset Sintético", email, password } });
    const { headers } = await getAuth().api.signInEmail({ body: { email, password }, returnHeaders: true });
    const cookie = headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const logs: string[] = [];
    vi.spyOn(console, "info").mockImplementation((m: string) => void logs.push(String(m)));

    const unknown = await getAuth().api.requestPasswordReset({ body: { email: `ninguem-${Date.now()}@exemplo.test` } });
    const known = await getAuth().api.requestPasswordReset({ body: { email } });
    expect(unknown).toEqual(known);
    await vi.waitFor(() => expect(tokenFrom(logs)).toBeTruthy());
    const token = tokenFrom(logs)!;

    const newPassword = "nova-senha-sintetica-456";
    await getAuth().api.resetPassword({ body: { newPassword, token } });
    await expect(getAuth().api.resetPassword({ body: { newPassword: "outra-senha-sintetica-789", token } })).rejects.toThrow();
    expect(await getAuth().api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
    await expect(getAuth().api.signInEmail({ body: { email, password } })).rejects.toThrow();
    await getAuth().api.signInEmail({ body: { email, password: newPassword } });
  });

  it("limita pedidos repetidos por usuário", async () => {
    const email = `reset-limit-${Date.now()}@exemplo.test`;
    await getAuth().api.signUpEmail({ body: { name: "Reset Limite", email, password } });
    const logs: string[] = [];
    vi.spyOn(console, "info").mockImplementation((m: string) => void logs.push(String(m)));
    for (let i = 0; i < 5; i++) await getAuth().api.requestPasswordReset({ body: { email } });
    await new Promise((r) => setTimeout(r, 300));
    expect(logs.filter((l) => l.includes("redefinir-senha"))).toHaveLength(3);
  });
});
