import { createHmac } from "node:crypto";
import { deflateSync } from "node:zlib";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { detectKind, sanitizeFileName, validateUpload } from "@/server/attachments/policy";
import { checkPdf, neutralizeCsv, sanitizeAttachment } from "@/server/attachments/sanitize";
import { authFailed, classifyRecipients, extractReply, isAutomated, parseAddress, sanitizeEmailHtml } from "@/server/email/inbound/parse";
import { REPLY_MARKER, renderEmail } from "@/server/email/outbound";
import { verifySvixSignature } from "@/server/email/webhook";
import { csatSignature, rateKey, replyToken, verifyCsatSignature } from "@/server/security/tokens";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET ??= "unit-secret-unit-secret-unit-secret-0000";
});

const pdf = (body: string) => Buffer.from(`%PDF-1.4\n${body}\ntrailer\n<<>>\n%%EOF\n`, "latin1");
let png: Buffer;

beforeAll(async () => {
  png = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 200, g: 10, b: 10 } } })
    .png().withMetadata({ exif: { IFD0: { Copyright: "sintetico-exif" } } }).toBuffer();
});

describe("política de anexos (RSG-12, RSG-17; CA-10.4)", () => {
  it("aceita os formatos da lista com conteúdo coerente", () => {
    expect(validateUpload("foto.PNG", png.length, png)).toEqual({ ok: true, kind: "png" });
    expect(validateUpload("dados.csv", 5, Buffer.from("a;b\n1;2"))).toEqual({ ok: true, kind: "csv" });
    expect(validateUpload("doc.pdf", 40, pdf("1 0 obj<<>>endobj"))).toEqual({ ok: true, kind: "pdf" });
  });
  it("recusa bloqueados, fora da lista, divergentes, vazios e acima de 4 MB", () => {
    expect(validateUpload("contrato.docx", 10, Buffer.from("PK\u0003\u0004"))).toMatchObject({ reason: "type_blocked" });
    expect(validateUpload("setup.exe", 10, Buffer.from("MZ"))).toMatchObject({ reason: "type_blocked" });
    expect(validateUpload("logo.svg", 10, Buffer.from("<svg/>"))).toMatchObject({ reason: "type_blocked" });
    expect(validateUpload("arquivo.heic", 10, Buffer.from("x"))).toMatchObject({ reason: "type_not_allowed" });
    expect(validateUpload("imagem.png", 40, pdf("x"))).toMatchObject({ reason: "type_mismatch" });
    expect(validateUpload("texto.txt", 3, Buffer.from([0x61, 0x00, 0x62]))).toMatchObject({ reason: "type_mismatch" });
    expect(validateUpload("vazio.txt", 0, Buffer.alloc(0))).toMatchObject({ reason: "empty" });
    expect(validateUpload("grande.png", 4 * 1024 * 1024 + 1, png)).toMatchObject({ reason: "too_large" });
  });
  it("sanitiza o nome original (só metadado)", () => {
    expect(sanitizeFileName("../../etc/<passwd>.txt")).toBe("passwd.txt");
    expect(sanitizeFileName("")).toBe("arquivo");
    expect(detectKind(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("webp");
  });
});

describe("sanitização CDR (RSG-19; CA-10.9)", () => {
  it("imagem válida é recodificada, sem metadados nem dados anexados", async () => {
    const tampered = Buffer.concat([png, Buffer.from("<script>carga anexada</script>")]);
    const r = await sanitizeAttachment("png", tampered);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sanitizer).toBe("reencode_image");
    expect(r.data.includes(Buffer.from("carga anexada"))).toBe(false);
    expect(r.data.includes(Buffer.from("sintetico-exif"))).toBe(false);
    expect((await sharp(r.data).metadata()).width).toBe(4);
  });
  it("imagem corrompida vai para a quarentena", async () => {
    const broken = Buffer.concat([png.subarray(0, 16), Buffer.alloc(32, 7)]);
    expect(await sanitizeAttachment("png", broken)).toMatchObject({ ok: false, reason: "image_decode_failed" });
  });
  it("CSV: fórmulas neutralizadas, aspas preservadas, separador detectado", () => {
    expect(neutralizeCsv('nome,valor\nAna,=SUM(A1:A2)\nBia,"+1, 2"\n@cmd,-3\n')).toBe("nome,valor\nAna,'=SUM(A1:A2)\nBia,\"'+1, 2\"\n'@cmd,'-3\n");
    expect(neutralizeCsv("a;b\n=1;x")).toBe("a;b\n'=1;x\n");
  });
  it("texto: UTF-8 inválido recusado; controles removidos", async () => {
    expect(await sanitizeAttachment("txt", Buffer.from([0x61, 0xff, 0x62]))).toMatchObject({ ok: false });
    const r = await sanitizeAttachment("txt", Buffer.from("linha\u0007 ok\r\nfim"));
    expect(r.ok && r.data.toString()).toBe("linha ok\nfim");
  });
  it("PDF com conteúdo ativo é recusado, inclusive ofuscado ou em fluxo comprimido", () => {
    expect(checkPdf(pdf("1 0 obj<</S/JavaScript/JS(app.alert(1))>>endobj"))).toMatchObject({ ok: false, reason: "pdf_active:JavaScript" });
    expect(checkPdf(pdf("1 0 obj<</OpenAction 2 0 R>>endobj"))).toMatchObject({ ok: false });
    expect(checkPdf(pdf("1 0 obj<</S/J#61vaScript>>endobj"))).toMatchObject({ ok: false, reason: "pdf_active:JavaScript" });
    expect(checkPdf(pdf("1 0 obj<</Encrypt 5 0 R>>endobj"))).toMatchObject({ ok: false, reason: "pdf_active:Encrypt" });
    const hidden = deflateSync(Buffer.from("<</Type/Action/S/Launch/F(cmd.exe)>>"));
    const compressed = Buffer.concat([Buffer.from("%PDF-1.5\n1 0 obj<</Filter/FlateDecode/Length 10>>stream\n", "latin1"), hidden, Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1")]);
    expect(checkPdf(compressed)).toMatchObject({ ok: false, reason: "pdf_active:Launch" });
    expect(checkPdf(Buffer.from("%PDF-1.4\nsem fim", "latin1"))).toMatchObject({ ok: false, reason: "pdf_invalid" });
  });
  it("PDF sem conteúdo ativo é liberado sem reconstrução (risco residual documentado)", () => {
    expect(checkPdf(pdf("1 0 obj<</Type/Catalog>>endobj"))).toMatchObject({ ok: true, sanitizer: "pdf_structural" });
  });
  it("limitação: o arquivo de teste EICAR em .txt passa pela CDR (não é antivírus)", async () => {
    const eicar = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
    expect((await sanitizeAttachment("txt", Buffer.from(eicar))).ok).toBe(true);
  });
});

describe("recebimento de e-mail: regras puras (RN-15 a RN-19)", () => {
  const domain = "in.exemplo.test";
  it("classifica destinatários: r+token@ e {slug}@ no domínio de recebimento", () => {
    const token = "a".repeat(32);
    expect(classifyRecipients([`Suporte <r+${token}@${domain}>`, `acme@${domain}`, `acme+vendas@${domain}`, "outro@fora.test", `r+curto@${domain}`], domain)).toEqual([
      { kind: "reply", token }, { kind: "org", slug: "acme" }, { kind: "org", slug: "acme" }, { kind: "reply", token: "invalid" },
    ]);
    expect(parseAddress('"Carla Souza" <Carla@Exemplo.test>')).toEqual({ name: "Carla Souza", address: "carla@exemplo.test" });
  });
  it("identifica mensagens automáticas (RN-16; CA-06.3)", () => {
    expect(isAutomated({ from: "a@x.test", headers: { "auto-submitted": "auto-replied" } })).toBe("auto_submitted");
    expect(isAutomated({ from: "MAILER-DAEMON@x.test", headers: {} })).toBe("auto_sender");
    expect(isAutomated({ from: "a@x.test", headers: { precedence: "bulk" } })).toBe("precedence");
    expect(isAutomated({ from: "a@x.test", headers: { "content-type": "multipart/report; report-type=delivery-status" } })).toBe("delivery_report");
    expect(isAutomated({ from: "a@x.test", headers: { "auto-submitted": "no" } })).toBeNull();
  });
  it("falha de autenticação: DMARC fail, ou SPF e DKIM com fail", () => {
    expect(authFailed({ spf: "pass", dkim: "pass", dmarc: "pass" })).toBe(false);
    expect(authFailed({ dmarc: "fail" })).toBe(true);
    expect(authFailed({ spf: "fail", dkim: "fail", dmarc: "unknown" })).toBe(true);
    expect(authFailed({ spf: "fail", dkim: "pass", dmarc: "pass" })).toBe(false);
    expect(authFailed(null)).toBe(false);
  });
  it("remove o histórico citado (RF-EML-06; CA-06.2)", () => {
    expect(extractReply(`Obrigada, resolvido.\n\n${REPLY_MARKER}\n\nResposta anterior`)).toBe("Obrigada, resolvido.");
    expect(extractReply("Ainda não chegou.\n\nEm seg., 10 de nov. de 2026 às 10:00, Suporte <s@x.test> escreveu:\n> texto antigo")).toBe("Ainda não chegou.");
    expect(extractReply("Ok!\nOn Mon, Nov 10, 2026 at 10:00 AM Support wrote:\n> old")).toBe("Ok!");
    expect(extractReply("Nova linha\n> citação 1\n> citação 2")).toBe("Nova linha");
  });
  it("HTML sanitizado: sem script, iframe, formulário, estilo ou imagem remota (CA-06.8)", () => {
    const out = sanitizeEmailHtml('<p onclick="x()">Olá</p><script>alert(1)</script><iframe src="https://x"></iframe><form><input></form><style>p{}</style><img src="https://rastreio.test/p.gif"><a href="javascript:alert(1)">a</a><a href="https://ok.test">b</a>');
    for (const bad of ["<script", "alert(1)", "<iframe", "<form", "<input", "<style", "<img", "onclick", "javascript:", "rastreio.test"]) expect(out).not.toContain(bad);
    expect(out).toContain("Olá");
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain("[imagem remota não carregada]");
  });
});

describe("tokens, webhook e e-mails (ADR-007, ADR-009)", () => {
  it("token de resposta: 128 bits em hexadecimal, determinístico por chamado", () => {
    const id = "0192f000-0000-7000-8000-000000000001";
    expect(replyToken(id)).toMatch(/^[0-9a-f]{32}$/);
    expect(replyToken(id)).toBe(replyToken(id));
    expect(replyToken(id)).not.toBe(replyToken("0192f000-0000-7000-8000-000000000002"));
  });
  it("link de avaliação assinado por chamado e resolução", () => {
    const id = "0192f000-0000-7000-8000-000000000001";
    expect(verifyCsatSignature(id, 1, csatSignature(id, 1))).toBe(true);
    expect(verifyCsatSignature(id, 2, csatSignature(id, 1))).toBe(false);
    expect(verifyCsatSignature(id, 1, "zz")).toBe(false);
  });
  it("chave de limite de taxa nunca contém a identidade em claro", () => {
    const k = rateKey("magic_email", "org", "Carla@Exemplo.test");
    expect(k).toMatch(/^magic_email:[0-9a-f]{64}$/);
    expect(k).toBe(rateKey("magic_email", "org", "carla@exemplo.test"));
  });
  it("assinatura Svix: válida, adulterada e expirada", () => {
    const secret = `whsec_${Buffer.from("segredo-sintetico-de-teste").toString("base64")}`;
    const body = '{"type":"email.received"}';
    const ts = "1700000000";
    const sig = createHmac("sha256", Buffer.from("segredo-sintetico-de-teste")).update(`msg_1.${ts}.${body}`).digest("base64");
    const headers = (s: string, t = ts) => new Headers({ "svix-id": "msg_1", "svix-timestamp": t, "svix-signature": `v1,${s}` });
    expect(verifySvixSignature(secret, headers(sig), body, 1700000010)).toBe(true);
    expect(verifySvixSignature(secret, headers(sig), body + " ", 1700000010)).toBe(false);
    expect(verifySvixSignature(secret, headers(sig), body, 1700001000)).toBe(false);
    expect(verifySvixSignature("sem-prefixo", headers(sig), body, 1700000010)).toBe(false);
  });
  it("e-mail de resolução traz o convite de CSAT e o marcador de resposta quando há recebimento", () => {
    const r = renderEmail("ticket_resolved", { protocol: "A-000001", subject: "S", organizationName: "A", body: null, link: "l", csatLink: "https://x.test/avaliar", canReplyByEmail: true });
    expect(r.text.startsWith(REPLY_MARKER)).toBe(true);
    expect(r.text).toContain("https://x.test/avaliar");
    const m = renderEmail("magic_link", { protocol: null, subject: null, organizationName: "A", body: null, link: "https://x.test/p/a/acesso/tok" });
    expect(m.text).toContain("uma única vez");
    expect(m.text).toContain("https://x.test/p/a/acesso/tok");
  });
});
