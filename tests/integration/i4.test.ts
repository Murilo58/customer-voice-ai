// I-4: portal, link mágico, e-mail de entrada com quarentena, anexos (CDR) e CSAT.
// CA-05.1 a CA-05.4, CA-06.1 a CA-06.9, CA-07.1, CA-07.2, CA-10.4, CA-10.7 a CA-10.9, CA-13.1, CA-13.2.
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashToken } from "@/lib/security";
import { SANITIZE_JOB, sanitizeJobHandler, downloadForContact, downloadForMember, sanitizePending } from "@/server/attachments/service";
import { MemoryStorage, setStorageForTests } from "@/server/attachments/storage";
import { getDb } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import type { InboundAttachmentMeta, InboundEmail } from "@/server/email/inbound/parse";
import { processReceipt, registerReceipt } from "@/server/email/inbound/process";
import { setInboundProviderForTests, type InboundProvider } from "@/server/email/inbound/provider";
import { decideQuarantine, listQuarantine } from "@/server/email/quarantine";
import { handleResendEvent } from "@/server/email/webhook";
import { DomainError, ForbiddenError } from "@/server/errors";
import { runJobById } from "@/server/jobs/outbox";
import { getDashboard } from "@/server/dashboard/metrics";
import {
  consumeMagicLink, getPortalSession, getPortalTicket, listPortalTickets, portalReply, requestMagicLink, submitCsat, submitPortalTicket, type PortalSessionInfo,
} from "@/server/portal/service";
import { csatSignature, magicLinkToken, replyToken } from "@/server/security/tokens";
import { createContact } from "@/server/servicedesk/contacts";
import { addInternalNote, createManualTicket, getTicket } from "@/server/servicedesk/tickets";
import { addPublicReply } from "@/server/servicedesk/workflow";
import { addMember, createOrganization, createPlatformAdmin, withMigrator } from "./helpers";

type Org = Awaited<ReturnType<typeof createOrganization>>;
let A: Org, B: Org;
let managerA: Awaited<ReturnType<typeof addMember>>;
let agentA: Awaited<ReturnType<typeof addMember>>;
const storage = new MemoryStorage();
const DOMAIN = "in.exemplo.test";
const pass = { verifyBot: async () => true };
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof DomainError ? e.code : e instanceof ForbiddenError ? "forbidden" : String(e)));
let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;
let png: Buffer;

/** Provedor de recebimento em memória (sintético). */
class FakeInbound implements InboundProvider {
  emails = new Map<string, InboundEmail>();
  files = new Map<string, Buffer>();
  async get(id: string) { return this.emails.get(id) ?? null; }
  async listRecent() { return [...this.emails.keys()]; }
  async attachment(_id: string, meta: InboundAttachmentMeta) {
    const f = this.files.get(meta.id);
    if (!f) throw new Error("sem arquivo");
    return f;
  }
}
const inbound = new FakeInbound();

function email(over: Partial<InboundEmail> & { to: string[]; from: string }): InboundEmail {
  return {
    providerId: `prov-${uniq()}`, messageId: `<${uniq()}@remetente.test>`, receivedFor: [], cc: [], subject: "Assunto sintético", text: "Texto sintético.", html: null,
    headers: {}, auth: { spf: "pass", dkim: "pass", dmarc: "pass" }, attachments: [], ...over,
  };
}

async function receive(e: InboundEmail) {
  inbound.emails.set(e.providerId, e);
  await registerReceipt(e.providerId);
  const r = await getDb().inboundReceipt.findUniqueOrThrow({ where: { providerEmailId: e.providerId } });
  return processReceipt(r.id, { provider: inbound });
}

const inboundRow = (org: Org, providerId: string) => withTenant(org.actor, (tx) => tx.inboundMessage.findUnique({ where: { providerEmailId: providerId } }));
const ticketById = (org: Org, id: string) => withTenant(org.actor, (tx) => tx.ticket.findUniqueOrThrow({ where: { id }, include: { contact: true } }));
const setStatus = (id: string, status: string, resolvedDaysAgo = 0) =>
  withMigrator((c) => c.query(
    `UPDATE tickets SET status = $2::ticket_status, resolved_at = CASE WHEN $2 IN ('resolved','closed') THEN now() - make_interval(days => $3) END,
       resolution_seq = CASE WHEN $2 IN ('resolved','closed') THEN resolution_seq + 1 ELSE resolution_seq END WHERE id = $1`, [id, status, resolvedDaysAgo]));

async function portalSessionFor(org: Org, emailAddr: string): Promise<PortalSessionInfo> {
  await requestMagicLink(org.slug, { email: emailAddr, botToken: "ok", ip: `10.0.${seq++ % 250}.1` }, pass);
  const t = await withTenant(org.actor, (tx) => tx.portalAccessToken.findFirstOrThrow({ where: { contact: { email: emailAddr }, usedAt: null }, orderBy: { createdAt: "desc" } }));
  const s = await consumeMagicLink(org.slug, magicLinkToken(t.id));
  return (await getPortalSession(org.slug, s.sessionToken))!;
}

beforeAll(async () => {
  setStorageForTests(storage);
  setInboundProviderForTests(inbound);
  png = await sharp({ create: { width: 3, height: 3, channels: 3, background: { r: 0, g: 120, b: 0 } } }).png().toBuffer();
  const admin = await createPlatformAdmin();
  A = await createOrganization(admin);
  B = await createOrganization(admin);
  managerA = await addMember(A.actor, "manager");
  agentA = await addMember(A.actor, "agent");
});

afterAll(() => {
  setStorageForTests(null);
  setInboundProviderForTests(null);
});

describe("portal: abertura pelo formulário (RF-POR-01, RF-POR-02; CA-05.1 a CA-05.4)", () => {
  it("CA-05.1 e CA-05.4: cria chamado do portal, contato novo ou reutilizado, confirmação e token de resposta", async () => {
    const mail = `portal-${uniq()}@exemplo.test`;
    const r = await submitPortalTicket(A.slug, { name: "Paula Sintética", email: mail, subject: "Cobrança duplicada", description: "Fui cobrada duas vezes.", botToken: "ok", ip: "10.1.1.1" }, pass);
    expect(r.protocol).toMatch(/^[A-Z0-9]+-\d{6}$/);
    const again = await submitPortalTicket(A.slug, { name: "Paula S.", email: mail.toUpperCase(), subject: "Outro assunto", description: "Segunda manifestação.", botToken: "ok", ip: "10.1.1.1" }, pass);
    const tickets = await withTenant(A.actor, (tx) => tx.ticket.findMany({ where: { number: { in: [r.number, again.number] } }, include: { contact: true } }));
    expect(tickets).toHaveLength(2);
    expect(new Set(tickets.map((t) => t.contactId)).size).toBe(1);
    expect(tickets.every((t) => t.channel === "portal" && t.replyTokenHash === hashToken(replyToken(t.id)))).toBe(true);
    const emails = await withTenant(A.actor, (tx) => tx.outboundEmail.findMany({ where: { ticketId: { in: tickets.map((t) => t.id) }, template: "ticket_created" } }));
    expect(emails).toHaveLength(2);
    // Organização B não vê nada do portal de A
    expect(await withTenant(B.actor, (tx) => tx.ticket.count({ where: { id: { in: tickets.map((t) => t.id) } } }))).toBe(0);
  });

  it("CA-05.3: sem o desafio anti-bot ou acima do limite de taxa, o envio é recusado", async () => {
    const base = { name: "Robô", email: `bot-${uniq()}@exemplo.test`, subject: "Spam", description: "Mensagem automática.", botToken: "", ip: "10.2.2.2" };
    expect(await code(submitPortalTicket(A.slug, base, { verifyBot: async () => false }))).toBe("bot_check_failed");
    const mail = `limite-${uniq()}@exemplo.test`;
    for (let i = 0; i < 10; i++) await submitPortalTicket(A.slug, { ...base, email: mail, botToken: "ok", ip: `10.3.${i}.1` }, pass);
    expect(await code(submitPortalTicket(A.slug, { ...base, email: mail, botToken: "ok", ip: "10.3.99.1" }, pass))).toBe("rate_limited");
  });

  it("portal de organização suspensa ou inexistente não aceita envios", async () => {
    expect(await code(submitPortalTicket("nao-existe-xyz", { name: "X Y", email: "x@exemplo.test", subject: "Teste", description: "Descrição longa.", botToken: "ok", ip: "1.1.1.1" }, pass))).toBe("portal_not_found");
  });
});

describe("link mágico e visibilidade no portal (RF-POR-03, RF-POR-04; CA-07.1, CA-07.2)", () => {
  let mail: string, other: string, ticketId: string, number: number;

  beforeAll(async () => {
    mail = `cliente-${uniq()}@exemplo.test`;
    other = `outro-${uniq()}@exemplo.test`;
    const r = await submitPortalTicket(A.slug, { name: "Cliente Portal", email: mail, subject: "Produto com defeito", description: "Chegou quebrado.", botToken: "ok", ip: "10.4.1.1" }, pass);
    number = r.number;
    await submitPortalTicket(A.slug, { name: "Outro Cliente", email: other, subject: "Outro chamado", description: "Não deve aparecer.", botToken: "ok", ip: "10.4.1.2" }, pass);
    ticketId = (await withTenant(A.actor, (tx) => tx.ticket.findFirstOrThrow({ where: { number } }))).id;
    await addInternalNote(A.actor, ticketId, "NOTA INTERNA CONFIDENCIAL");
    await addPublicReply(agentA.actor, ticketId, "Resposta pública ao cliente.");
  });

  it("e-mail sem cadastro recebe a mesma resposta, sem token", async () => {
    const r = await requestMagicLink(A.slug, { email: `ninguem-${uniq()}@exemplo.test`, botToken: "ok", ip: "10.5.1.1" }, pass);
    expect(r.jobId).toBeNull();
  });

  it("CA-07.1: o link funciona uma única vez e expira", async () => {
    await requestMagicLink(A.slug, { email: mail, botToken: "ok", ip: "10.5.2.1" }, pass);
    const t = await withTenant(A.actor, (tx) => tx.portalAccessToken.findFirstOrThrow({ where: { contact: { email: mail } }, orderBy: { createdAt: "desc" } }));
    const token = magicLinkToken(t.id);
    expect(await code(consumeMagicLink(A.slug, token))).toBe("ok");
    expect(await code(consumeMagicLink(A.slug, token))).toBe("magic_link_invalid");
    // Token de A não funciona no portal de B
    await requestMagicLink(A.slug, { email: mail, botToken: "ok", ip: "10.5.2.2" }, pass);
    const t2 = await withTenant(A.actor, (tx) => tx.portalAccessToken.findFirstOrThrow({ where: { contact: { email: mail }, usedAt: null } }));
    expect(await code(consumeMagicLink(B.slug, magicLinkToken(t2.id)))).toBe("magic_link_invalid");
    await withMigrator((c) => c.query("UPDATE portal_access_tokens SET expires_at = now() - interval '1 minute' WHERE id = $1", [t2.id]));
    expect(await code(consumeMagicLink(A.slug, magicLinkToken(t2.id)))).toBe("magic_link_invalid");
    // O e-mail do link mágico é enfileirado com o template próprio
    expect(await withTenant(A.actor, (tx) => tx.outboundEmail.count({ where: { portalTokenId: t.id, template: "magic_link" } }))).toBe(1);
  });

  it("limite de links mágicos por e-mail (3 a cada 15 min)", async () => {
    const m = `limite-link-${uniq()}@exemplo.test`;
    for (let i = 0; i < 3; i++) await requestMagicLink(A.slug, { email: m, botToken: "ok", ip: `10.6.${i}.1` }, pass);
    expect(await code(requestMagicLink(A.slug, { email: m, botToken: "ok", ip: "10.6.9.1" }, pass))).toBe("rate_limited");
  });

  it("CA-07.2: só os chamados do contato, sem notas internas, triagem ou eventos", async () => {
    const s = await portalSessionFor(A, mail);
    const list = await listPortalTickets(s);
    expect(list.map((t) => t.number)).toEqual([number]);
    const view = await getPortalTicket(s, number);
    const json = JSON.stringify(view);
    expect(json).not.toContain("NOTA INTERNA CONFIDENCIAL");
    expect(json).toContain("Resposta pública ao cliente.");
    expect(view!.messages.every((m) => !("author" in m))).toBe(true);
    const otherNumber = (await withTenant(A.actor, (tx) => tx.ticket.findFirstOrThrow({ where: { contact: { email: other } } }))).number;
    expect(await getPortalTicket(s, otherNumber)).toBeNull();
    expect(await code(portalReply(s, otherNumber, { text: "invasão" }))).toBe("ticket_not_found");
  });
});

describe("respostas do cliente e reabertura (RF-POR-04; CA-13.2)", () => {
  let mail: string, s: PortalSessionInfo;
  beforeAll(async () => {
    mail = `reabre-${uniq()}@exemplo.test`;
    await submitPortalTicket(A.slug, { name: "Cliente Reabre", email: mail, subject: "Assunto inicial", description: "Descrição inicial.", botToken: "ok", ip: "10.7.1.1" }, pass);
    s = await portalSessionFor(A, mail);
  });
  const ticketOf = async () => withTenant(A.actor, (tx) => tx.ticket.findFirstOrThrow({ where: { contact: { email: mail }, parentTicketId: null } }));

  it("Aguardando cliente → Aberto com a resposta do cliente", async () => {
    const t = await ticketOf();
    await setStatus(t.id, "waiting_customer");
    const r = await portalReply(s, t.number, { text: "Segue a informação pedida." });
    expect(r.createdTicket).toBe(false);
    expect((await ticketOf()).status).toBe("open");
    const msg = await withTenant(A.actor, (tx) => tx.ticketMessage.findFirstOrThrow({ where: { ticketId: t.id, kind: "customer_message" } }));
    expect(msg).toMatchObject({ source: "portal", authorContactId: t.contactId });
  });

  it("CA-13.2: Resolvido dentro do prazo reabre; depois do prazo ou Fechado cria chamado vinculado", async () => {
    const t = await ticketOf();
    await setStatus(t.id, "resolved", 1);
    expect((await portalReply(s, t.number, { text: "Voltou a acontecer." })).createdTicket).toBe(false);
    expect((await ticketOf()).status).toBe("open");
    await setStatus(t.id, "resolved", 8);
    const late = await portalReply(s, t.number, { text: "Escrevendo depois do prazo." });
    expect(late.createdTicket).toBe(true);
    const child = await ticketById(A, late.ticketId);
    expect(child).toMatchObject({ parentTicketId: t.id, channel: "portal", description: "Escrevendo depois do prazo." });
    expect((await ticketOf()).status).toBe("resolved");
    await setStatus(t.id, "closed", 9);
    expect((await portalReply(s, t.number, { text: "Mais uma vez." })).createdTicket).toBe(true);
  });
});

describe("CSAT (RF-POR-05; CA-13.1)", () => {
  it("só para Resolvido ou Fechado, uma vez por resolução; link assinado; reabertura invalida o link antigo", async () => {
    const mail = `csat-${uniq()}@exemplo.test`;
    const r = await submitPortalTicket(A.slug, { name: "Cliente CSAT", email: mail, subject: "Avaliar", description: "Para avaliação.", botToken: "ok", ip: "10.8.1.1" }, pass);
    const t = await withTenant(A.actor, (tx) => tx.ticket.findFirstOrThrow({ where: { number: r.number } }));
    const s = await portalSessionFor(A, mail);
    expect(await code(submitCsat(A.slug, { ticketId: t.id, resolutionSeq: 1, score: 5 }, { session: s }))).toBe("csat_not_available");
    await setStatus(t.id, "resolved", 0);
    expect(await code(submitCsat(A.slug, { ticketId: t.id, resolutionSeq: 1, score: 9 }, { session: s }))).toBe("csat_invalid_score");
    expect(await code(submitCsat(A.slug, { ticketId: t.id, resolutionSeq: 1, score: 4, comment: "Bom" }, { signature: "0".repeat(32) }))).toBe("csat_invalid");
    expect(await code(submitCsat(A.slug, { ticketId: t.id, resolutionSeq: 1, score: 4, comment: "Bom" }, { signature: csatSignature(t.id, 1) }))).toBe("ok");
    expect(await code(submitCsat(A.slug, { ticketId: t.id, resolutionSeq: 1, score: 2 }, { session: s }))).toBe("csat_already");
    // Nova resolução: o link da resolução anterior não vale; a nova aceita uma avaliação
    await setStatus(t.id, "open");
    await setStatus(t.id, "resolved", 0);
    expect(await code(submitCsat(A.slug, { ticketId: t.id, resolutionSeq: 1, score: 3 }, { signature: csatSignature(t.id, 1) }))).toBe("csat_not_available");
    expect(await code(submitCsat(A.slug, { ticketId: t.id, resolutionSeq: 2, score: 3 }, { session: s }))).toBe("ok");
    // Outra organização não avalia chamado de A
    expect(await code(submitCsat(B.slug, { ticketId: t.id, resolutionSeq: 2, score: 1 }, { signature: csatSignature(t.id, 2) }))).toBe("csat_invalid");
    // Dashboard (RN-43): avaliações 4 ou 5 ÷ total, média e taxa de resposta
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const d = await getDashboard(A.actor, { from: today, to: today });
    expect(d.csat.responses).toBeGreaterThanOrEqual(2);
    expect(d.csat.distribution[3]! + d.csat.distribution[2]!).toBeGreaterThanOrEqual(2);
    expect(d.csat.rate).not.toBeNull();
  });
});

describe("anexos: validação, sanitização e download (RSG-12, RSG-17 a RSG-19; CA-10.4, CA-10.8, CA-10.9)", () => {
  let ticketId: string, contactEmail: string, contactId: string;
  const run = (id: string) => runJobById(id, { [SANITIZE_JOB]: sanitizeJobHandler() });
  const jobFor = (attachmentId: string) => getDb().job.findFirstOrThrow({ where: { type: SANITIZE_JOB, idempotencyKey: attachmentId } });

  beforeAll(async () => {
    contactEmail = `anexo-${uniq()}@exemplo.test`;
    contactId = (await createContact(A.actor, { name: "Cliente Anexos", email: contactEmail })).id;
    ticketId = (await createManualTicket(A.actor, { contactId, subject: "Anexos", description: "Teste de anexos." })).id;
  });

  it("CA-10.4 e CA-10.9: imagem liberada e recodificada; DOCX, divergente e grande recusados; PDF com JS em quarentena; CSV neutralizado", async () => {
    const { prepareFiles, putInQuarantine } = await import("@/server/attachments/service");
    const files = prepareFiles([
      { name: "foto.png", size: png.length, declaredType: "image/png", content: png },
      { name: "contrato.docx", size: 10, declaredType: "application/vnd.openxmlformats", content: Buffer.from("PK\u0003\u0004xxxx") },
      { name: "falso.png", size: 20, declaredType: "image/png", content: Buffer.from("%PDF-1.4 fingindo png") },
      { name: "grande.pdf", size: 5 * 1024 * 1024, declaredType: "application/pdf", content: Buffer.alloc(0) },
      { name: "malicioso.pdf", size: 80, declaredType: "application/pdf", content: Buffer.from("%PDF-1.4\n1 0 obj<</S/JavaScript/JS(app.alert(1))>>endobj\n%%EOF\n", "latin1") },
    ]);
    await putInQuarantine(A.organizationId, files);
    const r = await addPublicReply(agentA.actor, ticketId, "Segue em anexo.", { files });
    expect(r.rejected.map((x) => x.reason).sort()).toEqual(["too_large", "type_blocked", "type_mismatch"]);
    const rows = await withTenant(A.actor, (tx) => tx.attachment.findMany({ where: { ticketId }, orderBy: { originalNameSanitized: "asc" } }));
    const byName = (n: string) => rows.find((x) => x.originalNameSanitized === n)!;
    expect(byName("contrato.docx")).toMatchObject({ status: "rejected", storageKey: null });
    expect(await run((await jobFor(byName("foto.png").id)).id)).toBe("succeeded");
    expect(await run((await jobFor(byName("malicioso.pdf").id)).id)).toBe("succeeded");
    const after = await withTenant(A.actor, (tx) => tx.attachment.findMany({ where: { ticketId } }));
    const foto = after.find((x) => x.originalNameSanitized === "foto.png")!;
    expect(foto).toMatchObject({ status: "released", sanitizer: "reencode_image", scanStatus: "not_scanned", storageKey: `released/${A.organizationId}/${foto.id}` });
    expect(storage.objects.has(`quarantine/${A.organizationId}/${foto.id}`)).toBe(false);
    const mal = after.find((x) => x.originalNameSanitized === "malicioso.pdf")!;
    expect(mal).toMatchObject({ status: "quarantined", sanitizeReason: "pdf_active:JavaScript" });
    // Quarentena gera auditoria e alerta ao Administrador
    expect(await withTenant(A.actor, (tx) => tx.auditLog.count({ where: { action: "attachment.quarantined", targetId: mal.id } }))).toBe(1);
    expect(await withTenant(A.actor, (tx) => tx.notification.count({ where: { type: "attachment.quarantined" } }))).toBeGreaterThan(0);

    const { prepareFiles: p2, putInQuarantine: q2 } = await import("@/server/attachments/service");
    const csv = p2([{ name: "planilha.csv", size: 30, declaredType: "text/csv", content: Buffer.from("nome;valor\nAna;=1+2\n") }]);
    await q2(A.organizationId, csv);
    await addInternalNote(A.actor, ticketId, "CSV interno", { files: csv });
    await sanitizePending(A.organizationId, csv[0]!.id);
    const file = await downloadForMember(agentA.actor, csv[0]!.id);
    expect(file.data.toString()).toBe("nome;valor\nAna;'=1+2\n");
  });

  it("falha técnica mantém pendente; na última tentativa, vai para a quarentena", async () => {
    const { prepareFiles } = await import("@/server/attachments/service");
    const files = prepareFiles([{ name: "sumiu.png", size: png.length, declaredType: "image/png", content: png }]);
    // O original não foi gravado: simula erro técnico de armazenamento
    await addInternalNote(A.actor, ticketId, "Arquivo sem original", { files });
    await expect(sanitizePending(A.organizationId, files[0]!.id)).rejects.toThrow("original_missing");
    expect((await withTenant(A.actor, (tx) => tx.attachment.findUniqueOrThrow({ where: { id: files[0]!.id } }))).status).toBe("pending");
    await sanitizePending(A.organizationId, files[0]!.id, { lastAttempt: true });
    expect((await withTenant(A.actor, (tx) => tx.attachment.findUniqueOrThrow({ where: { id: files[0]!.id } }))).status).toBe("quarantined");
  });

  it("CA-10.8: download só liberado, pela organização do chamado ou pelo contato em mensagem pública", async () => {
    const rows = await withTenant(A.actor, (tx) => tx.attachment.findMany({ where: { ticketId }, include: { message: true } }));
    const publicImg = rows.find((x) => x.originalNameSanitized === "foto.png")!;
    const internalCsv = rows.find((x) => x.originalNameSanitized === "planilha.csv")!;
    const quarantined = rows.find((x) => x.originalNameSanitized === "malicioso.pdf")!;
    expect((await downloadForMember(managerA.actor, publicImg.id)).contentType).toBe("image/png");
    expect(await code(downloadForMember(agentA.actor, quarantined.id))).toBe("attachment_not_found");
    expect(await code(downloadForMember(B.actor, publicImg.id))).toBe("attachment_not_found");
    expect((await downloadForContact(A.organizationId, [contactId], publicImg.id)).name).toBe("foto.png");
    expect(await code(downloadForContact(A.organizationId, [contactId], internalCsv.id))).toBe("attachment_not_found");
    expect(await code(downloadForContact(A.organizationId, ["0192f000-0000-7000-8000-000000000009"], publicImg.id))).toBe("attachment_not_found");
    expect(await code(downloadForContact(B.organizationId, [contactId], publicImg.id))).toBe("attachment_not_found");
    // A visão da equipe mostra o anexo recusado com o motivo; o portal não vê anexos de nota interna
    const view = await getTicket(agentA.actor, (await ticketById(A, ticketId)).number);
    expect(JSON.stringify(view!.timeline)).toContain("type_blocked");
  });
});

describe("e-mail de entrada (RF-EML-02 a 06; RN-15 a RN-19; CA-06.1 a CA-06.8)", () => {
  let contactMail: string, ticketId: string, token: string;

  beforeAll(async () => {
    contactMail = `remetente-${uniq()}@exemplo.test`;
    const c = await createContact(A.actor, { name: "Remetente Sintético", email: contactMail });
    ticketId = (await createManualTicket(A.actor, { contactId: c.id, subject: "Troca de produto", description: "Quero trocar." })).id;
    token = replyToken(ticketId);
  });

  it("CA-06.1: e-mail novo cria chamado com canal e-mail e contato; RN-16 limita a confirmação automática", async () => {
    const from = `novo-${uniq()}@exemplo.test`;
    const e1 = email({ from: `Novo Cliente <${from}>`, to: [`${A.slug}@${DOMAIN}`], subject: "Problema no pedido", text: "Meu pedido veio errado." });
    expect(await receive(e1)).toBe("processed");
    const row = await inboundRow(A, e1.providerId);
    expect(row).toMatchObject({ classification: "new_ticket", fromAddress: from });
    const t = await ticketById(A, row!.ticketId!);
    expect(t).toMatchObject({ channel: "email", subject: "Problema no pedido" });
    expect(t.contact).toMatchObject({ email: from, name: "Novo Cliente" });
    expect(await withTenant(A.actor, (tx) => tx.outboundEmail.count({ where: { ticketId: t.id, template: "ticket_created" } }))).toBe(1);
    const e2 = email({ from, to: [`${A.slug}@${DOMAIN}`], subject: "Outro problema", text: "Mais um." });
    await receive(e2);
    const t2 = (await inboundRow(A, e2.providerId))!.ticketId!;
    expect(await withTenant(A.actor, (tx) => tx.outboundEmail.count({ where: { ticketId: t2, template: "ticket_created" } }))).toBe(0);
  });

  it("CA-06.2: resposta do contato com token válido entra no chamado, sem o texto citado", async () => {
    await setStatus(ticketId, "waiting_customer");
    const e = email({ from: contactMail, to: [`r+${token}@${DOMAIN}`], text: "Já enviei o produto.\n\nEm seg., 10 de nov. de 2026, Suporte escreveu:\n> texto antigo do atendimento" });
    await receive(e);
    expect(await inboundRow(A, e.providerId)).toMatchObject({ classification: "associated", ticketId });
    const msg = await withTenant(A.actor, (tx) => tx.ticketMessage.findFirstOrThrow({ where: { ticketId, kind: "customer_message", source: "email" } }));
    expect(msg.bodyText).toBe("Já enviei o produto.");
    expect((await ticketById(A, ticketId)).status).toBe("open");
  });

  it("CA-06.4: remetente diferente, falha de autenticação, token inválido e vínculos contraditórios vão para a quarentena", async () => {
    const cases: [InboundEmail, string, Org][] = [
      [email({ from: `intruso-${uniq()}@exemplo.test`, to: [`r+${token}@${DOMAIN}`], text: "Sou outra pessoa." }), "sender_mismatch", A],
      [email({ from: contactMail, to: [`r+${token}@${DOMAIN}`], text: "Falsificado.", auth: { spf: "fail", dkim: "fail", dmarc: "fail" } }), "auth_failed", A],
      [email({ from: contactMail, to: [`r+${"f".repeat(32)}@${DOMAIN}`, `${A.slug}@${DOMAIN}`], text: "Token inválido." }), "invalid_token", A],
      [email({ from: contactMail, to: [`r+${token}@${DOMAIN}`, `${B.slug}@${DOMAIN}`], text: "Contraditório." }), "contradictory_links", A],
    ];
    const before = await withTenant(A.actor, (tx) => tx.ticketMessage.count({ where: { ticketId } }));
    for (const [e, reason, org] of cases) {
      await receive(e);
      expect(await inboundRow(org, e.providerId)).toMatchObject({ classification: "quarantined", reason });
    }
    // Nada entrou na linha do tempo nem gerou e-mail
    expect(await withTenant(A.actor, (tx) => tx.ticketMessage.count({ where: { ticketId } }))).toBe(before);
    const pending = await listQuarantine(managerA.actor);
    expect(pending.length).toBeGreaterThanOrEqual(4);
    expect(await code(listQuarantine(agentA.actor))).toBe("forbidden");
  });

  it("CA-06.3, CA-06.6, CA-06.7: automáticas ignoradas; protocolo no assunto não associa; Message-ID repetido é duplicata", async () => {
    const auto = email({ from: contactMail, to: [`r+${token}@${DOMAIN}`], headers: { "auto-submitted": "auto-replied" }, text: "Estou de férias." });
    await receive(auto);
    expect(await inboundRow(A, auto.providerId)).toMatchObject({ classification: "automated", ticketId: null });
    const t = await ticketById(A, ticketId);
    const protocolOnly = email({ from: contactMail, to: [`${A.slug}@${DOMAIN}`], subject: `Re: [${A.slug.toUpperCase()}-${String(t.number).padStart(6, "0")}] Troca de produto`, text: "Sem token." });
    await receive(protocolOnly);
    const row = await inboundRow(A, protocolOnly.providerId);
    expect(row!.classification).toBe("new_ticket");
    expect(row!.ticketId).not.toBe(ticketId);
    const dup = email({ from: contactMail, to: [`${A.slug}@${DOMAIN}`], messageId: protocolOnly.messageId, text: "Repetida." });
    await receive(dup);
    expect(await inboundRow(A, dup.providerId)).toMatchObject({ classification: "duplicate" });
    // Reentrega do mesmo recebimento (webhook repetido) é idempotente
    expect(await registerReceipt(protocolOnly.providerId)).toBeNull();
    // Destinatário sem organização: descartado sem conteúdo
    const lost = email({ from: contactMail, to: [`ninguem-xyz@${DOMAIN}`] });
    expect(await receive(lost)).toBe("discarded");
  });

  it("CA-06.5 e CA-06.8: anexo bloqueado recusado com a mensagem aceita; HTML sanitizado", async () => {
    inbound.files.set("att-png", png);
    inbound.files.set("att-exe", Buffer.from("MZ executável"));
    const e = email({
      from: contactMail, to: [`r+${token}@${DOMAIN}`], text: null,
      html: '<p>Segue <b>foto</b>.</p><script>alert(1)</script><img src="https://rastreio.test/x.gif"><iframe src="https://x.test"></iframe>',
      attachments: [
        { id: "att-png", filename: "foto.png", contentType: "image/png", size: png.length },
        { id: "att-exe", filename: "virus.exe", contentType: "application/octet-stream", size: 14 },
      ],
    });
    await receive(e);
    const row = await inboundRow(A, e.providerId);
    expect(row!.classification).toBe("associated");
    expect(row!.bodyHtmlSanitized).not.toMatch(/script|iframe|<img|rastreio/);
    const msg = await withTenant(A.actor, (tx) => tx.ticketMessage.findFirstOrThrow({ where: { inboundMessageId: row!.id }, include: { attachments: true } }));
    expect(msg.bodyText).toContain("Segue foto.");
    expect(msg.attachments.map((a) => [a.originalNameSanitized, a.status, a.uploadedBy]).sort()).toEqual([["foto.png", "pending", "email"], ["virus.exe", "rejected", "email"]]);
  });

  it("CA-06.9: decisão da quarentena exige justificativa, é auditada e a mensagem associada é interna e não verificada", async () => {
    const e = email({ from: `terceiro-${uniq()}@exemplo.test`, to: [`r+${token}@${DOMAIN}`], text: "MENSAGEM DE TERCEIRO" });
    await receive(e);
    const item = (await listQuarantine(managerA.actor)).find((i) => i.inbound.fromAddress === parseFrom(e.from))!;
    expect(await code(decideQuarantine(managerA.actor, item.id, { action: "associate", justification: "curta" }))).toBe("justification_required");
    expect(await code(decideQuarantine(agentA.actor, item.id, { action: "discard", justification: "Atendente não pode decidir." }))).toBe("forbidden");
    const number = (await ticketById(A, ticketId)).number;
    await decideQuarantine(managerA.actor, item.id, { action: "associate", justification: "Cliente confirmou por telefone que é o cônjuge.", ticketNumber: number });
    expect(await code(decideQuarantine(managerA.actor, item.id, { action: "discard", justification: "Segunda decisão não vale." }))).toBe("quarantine_already_decided");
    const msg = await withTenant(A.actor, (tx) => tx.ticketMessage.findFirstOrThrow({ where: { bodyText: "MENSAGEM DE TERCEIRO" } }));
    expect(msg).toMatchObject({ kind: "internal_note", unverifiedSender: true, ticketId });
    expect(await withTenant(A.actor, (tx) => tx.auditLog.count({ where: { action: "quarantine.associate", targetId: item.id } }))).toBe(1);
    // Não aparece no portal do contato
    const s = await portalSessionFor(A, contactMail);
    expect(JSON.stringify(await getPortalTicket(s, number))).not.toContain("MENSAGEM DE TERCEIRO");
  });

  it("CA-10.7: evento de entrega do provedor atualiza o status do e-mail de saída", async () => {
    const r = await addPublicReply(agentA.actor, ticketId, "Resposta para rastrear entrega.");
    await withTenant(A.actor, (tx) => tx.outboundEmail.updateMany({ where: { messageId: r.messageId }, data: { status: "sent", providerEmailId: `re_${uniq()}` } }));
    const out = await withTenant(A.actor, (tx) => tx.outboundEmail.findFirstOrThrow({ where: { messageId: r.messageId } }));
    await handleResendEvent("evt-1-" + uniq(), { type: "email.bounced", created_at: new Date().toISOString(), data: { email_id: out.providerEmailId, tags: { org: A.organizationId } } });
    expect((await withTenant(A.actor, (tx) => tx.outboundEmail.findUniqueOrThrow({ where: { id: out.id } }))).status).toBe("bounced");
    // Etiqueta de outra organização não altera nada
    await handleResendEvent("evt-2-" + uniq(), { type: "email.delivered", data: { email_id: out.providerEmailId, tags: { org: B.organizationId } } });
    expect((await withTenant(A.actor, (tx) => tx.outboundEmail.findUniqueOrThrow({ where: { id: out.id } }))).status).toBe("bounced");
    const received = await handleResendEvent("evt-3-" + uniq(), { type: "email.received", data: { email_id: `prov-${uniq()}` } });
    expect(received.handled).toBe("received");
    expect(received.jobId).toBeTruthy();
  });
});

function parseFrom(v: string) {
  return v.toLowerCase();
}
