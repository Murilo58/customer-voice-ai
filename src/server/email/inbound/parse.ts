import { createHash } from "node:crypto";
import sanitizeHtml from "sanitize-html";
import { REPLY_MARKER } from "@/server/email/outbound";

// Regras puras do recebimento (RN-15 a RN-19; RF-EML-06). Sem banco nem rede.

export interface InboundAuth {
  spf?: string | null;
  dkim?: string | null;
  dmarc?: string | null;
}

export interface InboundEmail {
  providerId: string;
  messageId: string | null;
  from: string;
  to: string[];
  receivedFor: string[];
  cc: string[];
  subject: string;
  text: string | null;
  html: string | null;
  headers: Record<string, string>;
  auth: InboundAuth | null;
  attachments: InboundAttachmentMeta[];
  /** Marcação de spam do provedor, quando existir */
  spam?: boolean;
  sizeBytes?: number | null;
}

export interface InboundAttachmentMeta {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  downloadUrl?: string | null;
}

/** "Nome <email@x>" → { name, address } (endereço em minúsculas). */
export function parseAddress(value: string): { name: string | null; address: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(value);
  const address = (m ? m[2]! : value).trim().toLowerCase();
  const name = m && m[1]!.trim() ? m[1]!.trim().slice(0, 120) : null;
  return { name, address };
}

export type Recipient =
  | { kind: "reply"; token: string }
  | { kind: "org"; slug: string };

/** Destinatários no domínio de recebimento: r+{token}@ (resposta) ou {slug}@ (endereço da organização). */
export function classifyRecipients(addresses: string[], domain: string): Recipient[] {
  const out: Recipient[] = [];
  for (const raw of addresses) {
    const { address } = parseAddress(raw);
    const at = address.lastIndexOf("@");
    if (at < 1 || address.slice(at + 1) !== domain) continue;
    const local = address.slice(0, at);
    const reply = /^r\+([0-9a-f]{32})$/.exec(local);
    if (reply) out.push({ kind: "reply", token: reply[1]! });
    else if (/^r\+/.test(local)) out.push({ kind: "reply", token: "invalid" });
    else {
      // {slug} ou {slug}+qualquer-coisa (subendereço ignorado)
      const slug = local.split("+")[0]!;
      if (/^[a-z0-9-]{3,48}$/.test(slug)) out.push({ kind: "org", slug });
    }
  }
  return out;
}

const AUTO_SENDERS = /^(mailer-daemon|postmaster|no-?reply|noreply|bounce[s]?|auto-?reply)@/i;

/** Respostas automáticas, avisos de férias e relatórios de entrega (RN-16). */
export function isAutomated(email: Pick<InboundEmail, "from" | "headers">): string | null {
  const h = (name: string) => (email.headers[name] ?? "").toLowerCase();
  const from = parseAddress(email.from).address;
  if (!from || from === "<>") return "null_sender";
  if (AUTO_SENDERS.test(from)) return "auto_sender";
  const autoSubmitted = h("auto-submitted");
  if (autoSubmitted && autoSubmitted !== "no") return "auto_submitted";
  if (/^(bulk|junk|list|auto_reply)$/.test(h("precedence"))) return "precedence";
  if (h("x-autoreply") || h("x-autorespond") || h("x-auto-response-suppress").includes("all")) return "autoreply_header";
  if (h("content-type").includes("multipart/report")) return "delivery_report";
  if (h("return-path") === "<>") return "null_sender";
  return null;
}

/** Falha de autenticação do remetente informada pelo provedor (RN-15c): DMARC fail, ou SPF e DKIM com fail. */
export function authFailed(auth: InboundAuth | null): boolean {
  if (!auth) return false;
  const v = (x?: string | null) => (x ?? "").toLowerCase();
  return v(auth.dmarc) === "fail" || (v(auth.spf) === "fail" && v(auth.dkim) === "fail");
}

/** HTML sanitizado (RN-19; CA-06.8): sem scripts, formulários, iframes, estilos; imagens remotas não carregam. */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html.slice(0, 500_000), {
    allowedTags: ["p", "br", "div", "span", "b", "strong", "i", "em", "u", "s", "ul", "ol", "li", "blockquote", "pre", "code", "a", "h1", "h2", "h3", "h4", "table", "thead", "tbody", "tr", "td", "th", "hr"],
    allowedAttributes: { a: ["href", "rel", "target", "referrerpolicy"] },
    allowedSchemes: ["http", "https", "mailto"],
    disallowedTagsMode: "discard",
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { href: attribs.href ?? "#", rel: "noopener noreferrer nofollow", target: "_blank", referrerpolicy: "no-referrer" } }),
      img: () => ({ tagName: "span", attribs: {}, text: "[imagem remota não carregada]" }),
    },
  });
}

/** Texto plano a partir do HTML sanitizado (quando o e-mail não traz parte text/plain). */
export function htmlToText(html: string): string {
  return sanitizeHtml(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h[1-4])>/gi, "\n"), { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n").trim();
}

const QUOTE_HEADERS = [
  /^\s*Em .{3,200}(escreveu|wrote):\s*$/i,
  /^\s*On .{3,200}wrote:\s*$/i,
  /^\s*-{2,}\s*(Original Message|Mensagem original|Forwarded message|Mensagem encaminhada)\s*-{2,}\s*$/i,
  /^\s*(De|From):\s.+$/i,
  /^\s*_{10,}\s*$/,
];

/** Texto novo da resposta, sem o histórico citado (RF-EML-06; CA-06.2). O original fica no registro de recebimento. */
export function extractReply(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let cut = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.includes(REPLY_MARKER) || QUOTE_HEADERS.some((re) => re.test(line))) { cut = i; break; }
  }
  const kept = lines.slice(0, cut);
  // Bloco final de linhas citadas com ">" também sai.
  while (kept.length && (kept[kept.length - 1]!.trim() === "" || kept[kept.length - 1]!.trimStart().startsWith(">"))) kept.pop();
  return kept.join("\n").trim();
}

/** Hash de remetente + assunto + corpo para a duplicidade sem Message-ID (RN-18). */
export function contentHash(from: string, subject: string, body: string): string {
  return createHash("sha256").update(`${from}\n${subject.trim()}\n${body.trim()}`, "utf8").digest("hex");
}

/** Limite de tamanho de mensagem (RN-19). */
export const MAX_INBOUND_TEXT = 200_000;
