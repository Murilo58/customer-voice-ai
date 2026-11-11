import { createHash, randomBytes } from "node:crypto";
import { uuidv7 } from "uuidv7";

export const newId = (): string => uuidv7();

/** Token opaco de 256 bits, enviado ao destinatário. Só o hash é persistido. */
export function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;

const SENSITIVE_KEY = /pass(word)?|senha|token|secret|segredo|authorization|cookie|^otp$|^code$|backup_?codes?/i;
const EMAIL_RE = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

/** Mascara detalhes de auditoria: remove chaves sensíveis e reduz e-mails (RF-AUD; RIA-09). */
export function maskDetails(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[profundidade]";
  if (typeof value === "string") return value.replace(EMAIL_RE, "$1***@$2");
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => maskDetails(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEY.test(k) ? "[removido]" : maskDetails(v, depth + 1);
    return out;
  }
  return value;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** IDs vindos de formulários e URLs são validados antes de chegar ao banco (colunas uuid). */
export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
