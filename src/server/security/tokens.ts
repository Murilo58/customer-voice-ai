import { createHmac, timingSafeEqual } from "node:crypto";

// Tokens derivados (HMAC-SHA256 com separação por finalidade): o valor enviado ao destinatário é
// recalculado no envio a partir do id do registro, e só o hash (sha256) fica no banco.
// Trocar o segredo invalida tokens de resposta, links mágicos e links de avaliação em aberto.

function secret(): string {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("BETTER_AUTH_SECRET ausente ou curto.");
  return s;
}

function mac(purpose: string, value: string): Buffer {
  return createHmac("sha256", secret()).update(`cva:${purpose}:${value}`, "utf8").digest();
}

/** Token de resposta por e-mail: 128 bits em hexadecimal minúsculo (sobrevive a endereços normalizados). */
export function replyToken(ticketId: string): string {
  return mac("reply", ticketId).subarray(0, 16).toString("hex");
}

/** Link mágico do portal: 256 bits, derivado do id do registro de acesso. */
export function magicLinkToken(portalTokenId: string): string {
  return mac("magic", portalTokenId).toString("base64url");
}

/** Assinatura do link de avaliação (CSAT) por chamado e resolução. */
export function csatSignature(ticketId: string, resolutionSeq: number): string {
  return mac("csat", `${ticketId}:${resolutionSeq}`).subarray(0, 16).toString("hex");
}

export function verifyCsatSignature(ticketId: string, resolutionSeq: number, signature: string): boolean {
  if (!/^[0-9a-f]{32}$/.test(signature)) return false;
  const expected = Buffer.from(csatSignature(ticketId, resolutionSeq), "hex");
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

/** Chave de limite de taxa: identidade (IP, e-mail) nunca em claro (ADR-009; RSG-08). */
export function rateKey(kind: string, ...parts: string[]): string {
  if (!/^[a-z_]+$/.test(kind)) throw new Error("Tipo de chave inválido.");
  return `${kind}:${mac("rate", `${kind}:${parts.join("|").toLowerCase()}`).toString("hex")}`;
}

/** IP do cliente informado pela borda (Vercel define x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
