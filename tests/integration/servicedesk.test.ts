// I-1: contatos, empresas, chamados manuais, notas e linha do tempo.
// CA-19.1, CA-19.2, CA-18.1, CA-18.2, CA-18.3, CA-11.1, CA-11.2.
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { DomainError, ForbiddenError } from "@/server/errors";
import { createCompany, createContact, getCompany, getContactProfile, listContacts, updateContact } from "@/server/servicedesk/contacts";
import { addInternalNote, createManualTicket, getTicket, listTickets, updateTicketFields } from "@/server/servicedesk/tickets";
import { addMember, createOrganization, createPlatformAdmin, withMigrator } from "./helpers";

type Org = Awaited<ReturnType<typeof createOrganization>>;
let A: Org, B: Org;
let agentA: Awaited<ReturnType<typeof addMember>>;

const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof DomainError ? e.code : e instanceof ForbiddenError ? "forbidden" : String(e)));
const email = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@exemplo.test`;

beforeAll(async () => {
  const admin = await createPlatformAdmin();
  A = await createOrganization(admin);
  B = await createOrganization(admin);
  agentA = await addMember(A.actor, "agent");
});

describe("contatos e empresas (RF-CLI-01, RF-CLI-02)", () => {
  it("CA-19.2: e-mail duplicado na mesma organização é recusado; em outra organização é aceito", async () => {
    const e = email("dup");
    await createContact(A.actor, { name: "Maria Sintética", email: e });
    expect(await code(createContact(agentA.actor, { name: "Outra", email: e.toUpperCase() }))).toBe("contact_email_taken");
    expect(await code(createContact(B.actor, { name: "Maria em B", email: e }))).toBe("ok");
  });

  it("valida nome, e-mail e telefone", async () => {
    expect(await code(createContact(A.actor, { name: "M", email: email("x") }))).toBe("invalid_name");
    expect(await code(createContact(A.actor, { name: "Maria", email: "sem-arroba" }))).toBe("invalid_email");
    expect(await code(createContact(A.actor, { name: "Maria", email: email("x"), phone: "abc" }))).toBe("invalid_phone");
  });

  it("CA-18.3: contato vinculado exibe a empresa e a empresa lista seus contatos", async () => {
    const company = await createCompany(A.actor, { name: "ACME Sintética", emailDomain: "acme.test" });
    const c = await createContact(A.actor, { name: "João Sintético", email: email("joao"), clientCompanyId: company.id });
    const profile = await getContactProfile(A.actor, c.id);
    expect(profile?.contact.company).toEqual({ id: company.id, name: "ACME Sintética" });
    const listed = await getCompany(A.actor, company.id);
    expect(listed?.contacts.map((x) => x.id)).toContain(c.id);
  });

  it("não vincula contato a empresa de outra organização (FK composta)", async () => {
    const companyB = await createCompany(B.actor, { name: "Empresa de B" });
    expect(await code(createContact(A.actor, { name: "Intruso", email: email("i"), clientCompanyId: companyB.id }))).toBe("invalid_company");
  });

  it("edita contato e recusa e-mail já usado por outro contato", async () => {
    const a = await createContact(A.actor, { name: "Ana", email: email("ana") });
    const b = await createContact(A.actor, { name: "Bia", email: email("bia") });
    const profileA = await getContactProfile(A.actor, a.id);
    expect(await code(updateContact(A.actor, b.id, { name: "Bia", email: profileA!.contact.email }))).toBe("contact_email_taken");
    expect(await code(updateContact(A.actor, b.id, { name: "Bia Atualizada", email: email("bia2"), phone: "(11) 99999-0000" }))).toBe("ok");
  });

  it("busca de contatos fica restrita à organização", async () => {
    const e = email("busca-unica");
    await createContact(B.actor, { name: "Somente em B", email: e });
    expect(await listContacts(A.actor, "Somente em B")).toHaveLength(0);
    expect(await listContacts(B.actor, "somente em b")).toHaveLength(1);
  });
});

describe("chamados manuais (RF-ATD-01 a 03)", () => {
  it("CA-19.1: chamado manual recebe protocolo único, canal manual e aparece na listagem e no detalhe", async () => {
    const c = await createContact(agentA.actor, { name: "Cliente CA-19.1", email: email("ca191") });
    const t = await createManualTicket(agentA.actor, { contactId: c.id, subject: "Produto com defeito", description: "Chegou quebrado.", type: "complaint", priority: "high" });
    expect(t.protocol).toMatch(/^[A-Z0-9]+-\d{6}$/);
    const detail = await getTicket(agentA.actor, t.number);
    expect(detail?.ticket).toMatchObject({ channel: "manual", status: "new", type: "complaint", priority: "high", subject: "Produto com defeito", triageState: "pending" });
    expect((await listTickets(agentA.actor)).rows.map((r) => r.id)).toContain(t.id);
  });

  it("protocolos são sequenciais e únicos sob criação concorrente (RN-01)", async () => {
    const c = await createContact(A.actor, { name: "Concorrência", email: email("conc") });
    const created = await Promise.all(Array.from({ length: 12 }, (_, i) => createManualTicket(A.actor, { contactId: c.id, subject: `Concorrente ${i}`, description: "x" })));
    const numbers = created.map((t) => t.number).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(12);
    expect(numbers[11]! - numbers[0]!).toBe(11);
  });

  it("numeração é independente por organização", async () => {
    const cB = await createContact(B.actor, { name: "Primeiro de B", email: email("b1") });
    const before = (await listTickets(B.actor)).rows.length;
    const t = await createManualTicket(B.actor, { contactId: cB.id, subject: "Primeiro", description: "x" });
    expect(t.number).toBe(before + 1);
  });

  it("não cria chamado para contato de outra organização", async () => {
    const cB = await createContact(B.actor, { name: "Contato de B", email: email("cb") });
    expect(await code(createManualTicket(A.actor, { contactId: cB.id, subject: "x", description: "x" }))).toBe("contact_not_found");
  });

  it("valida assunto, descrição, tipo e prioridade", async () => {
    const c = await createContact(A.actor, { name: "Validação", email: email("val") });
    expect(await code(createManualTicket(A.actor, { contactId: c.id, subject: " ", description: "x" }))).toBe("invalid_subject");
    expect(await code(createManualTicket(A.actor, { contactId: c.id, subject: "x".repeat(201), description: "x" }))).toBe("invalid_subject");
    expect(await code(createManualTicket(A.actor, { contactId: c.id, subject: "x", description: "" }))).toBe("invalid_description");
    expect(await code(createManualTicket(A.actor, { contactId: c.id, subject: "x", description: "x", type: "bug" }))).toBe("invalid_type");
    expect(await code(createManualTicket(A.actor, { contactId: c.id, subject: "x", description: "x", priority: "max" }))).toBe("invalid_priority");
  });
});

describe("notas e linha do tempo (RF-ATD-04 interna, RF-ATD-05)", () => {
  it("CA-18.2: a linha do tempo mostra criação, notas e mudanças de campo, com autor e data", async () => {
    const c = await createContact(A.actor, { name: "Linha do tempo", email: email("lt") });
    const t = await createManualTicket(A.actor, { contactId: c.id, subject: "Timeline", description: "x" });
    await addInternalNote(agentA.actor, t.id, "Liguei para o cliente.");
    await updateTicketFields(agentA.actor, t.id, { type: "question", priority: "urgent" });
    await updateTicketFields(agentA.actor, t.id, { type: "question" }); // sem mudança: não gera evento
    const detail = await getTicket(A.actor, t.number);
    const items = detail!.timeline;
    expect(items.map((i) => (i.kind === "event" ? i.type : i.messageKind))).toEqual([
      "ticket.created", "internal_note", "ticket.field_changed", "ticket.field_changed",
    ]);
    expect(items.every((i) => i.at instanceof Date)).toBe(true);
    const note = items.find((i) => i.kind === "message");
    expect(note && note.kind === "message" && note.author).toBe(agentA.name);
    const change = items.filter((i) => i.kind === "event" && i.type === "ticket.field_changed");
    expect(change.map((i) => (i.kind === "event" ? i.actorName : null))).toEqual([agentA.name, agentA.name]);
    expect(detail!.ticket).toMatchObject({ type: "question", priority: "urgent" });
  });

  it("nota em chamado de outra organização é recusada", async () => {
    const cB = await createContact(B.actor, { name: "Nota cruzada", email: email("nc") });
    const tB = await createManualTicket(B.actor, { contactId: cB.id, subject: "B", description: "x" });
    expect(await code(addInternalNote(A.actor, tB.id, "invasão"))).toBe("ticket_not_found");
  });

  it("eventos da linha do tempo e mensagens não podem ser alterados nem excluídos", async () => {
    await expect(withTenant(A.actor, (tx) => tx.ticketEvent.updateMany({ data: { type: "x" } }))).rejects.toThrow();
    await expect(withTenant(A.actor, (tx) => tx.ticketMessage.updateMany({ data: { bodyText: "x" } }))).rejects.toThrow();
    await expect(withTenant(A.actor, (tx) => tx.ticket.deleteMany({}))).rejects.toThrow();
    await withMigrator(async (c) => {
      await expect(c.query("UPDATE ticket_events SET type = 'x'")).rejects.toThrow(/somente inserção/);
    });
  });
});

describe("perfil do contato e busca", () => {
  it("CA-18.1: perfil lista apenas chamados da organização, do mais recente ao mais antigo", async () => {
    const e = email("perfil");
    const cA = await createContact(A.actor, { name: "Perfil", email: e });
    const cB = await createContact(B.actor, { name: "Perfil em B", email: e });
    const t1 = await createManualTicket(A.actor, { contactId: cA.id, subject: "Primeiro", description: "x" });
    const t2 = await createManualTicket(A.actor, { contactId: cA.id, subject: "Segundo", description: "x" });
    await createManualTicket(B.actor, { contactId: cB.id, subject: "De B", description: "x" });
    const profile = await getContactProfile(A.actor, cA.id);
    expect(profile!.tickets.map((t) => t.id)).toEqual([t2.id, t1.id]);
  });

  it("CA-11.1: busca por protocolo retorna o chamado exato (com ou sem prefixo e zeros)", async () => {
    const c = await createContact(A.actor, { name: "Protocolo", email: email("proto") });
    const t = await createManualTicket(A.actor, { contactId: c.id, subject: "Busca por protocolo", description: "x" });
    for (const q of [t.protocol, String(t.number), t.protocol.toLowerCase()]) {
      const r = (await listTickets(A.actor, { q })).rows;
      expect(r.map((x) => x.id)).toEqual([t.id]);
    }
  });

  it("CA-11.2: nenhuma busca retorna resultados de outra organização", async () => {
    const marker = `marcador-${Date.now()}`;
    const cB = await createContact(B.actor, { name: `Contato ${marker}`, email: email("mk") });
    const tB = await createManualTicket(B.actor, { contactId: cB.id, subject: `Assunto ${marker}`, description: marker });
    for (const q of [marker, `Contato ${marker}`, String(tB.number), tB.protocol]) {
      const r = (await listTickets(A.actor, { q })).rows;
      expect(r.find((x) => x.id === tB.id)).toBeUndefined();
    }
    expect((await listTickets(B.actor, { q: marker })).rows.map((x) => x.id)).toEqual([tB.id]);
  });

  it("filtra por status e prioridade e recusa valores inválidos", async () => {
    const r = (await listTickets(A.actor, { status: "new", priority: "urgent" })).rows;
    expect(r.every((t) => t.status === "new" && t.priority === "urgent")).toBe(true);
    expect(await code(listTickets(A.actor, { status: "qualquer" }))).toBe("invalid_status");
  });
});

describe("permissões", () => {
  it("Gestor com leitura executiva não acessa chamados nem contatos, e a negação é auditada", async () => {
    const manager = await addMember(A.actor, "manager");
    await withMigrator((c) => c.query("UPDATE memberships SET executive_read = true WHERE id = $1", [manager.actor.membershipId]));
    const exec = { ...manager.actor, executiveRead: true };
    expect(await code(listTickets(exec))).toBe("forbidden");
    expect(await code(listContacts(exec))).toBe("forbidden");
    const denied = await withTenant(A.actor, (tx) => tx.auditLog.count({ where: { action: "access.denied", actorId: manager.id } }));
    expect(denied).toBe(2);
  });

  it("o runtime não exclui chamados nem contatos (sem DELETE)", async () => {
    await expect(withTenant(A.actor, (tx) => tx.contact.deleteMany({}))).rejects.toThrow();
    expect(await getDb().ticket.count()).toBe(0); // sem contexto: nada visível
  });
});
