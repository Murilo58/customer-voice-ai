// Mascaramento antes do envio à IA (RIA-09; AI_ARCHITECTURE 4.1). Funções puras.

const onlyDigits = (s: string) => s.replace(/\D/g, "");

export function isValidCpf(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidCnpj(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function passesLuhn(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;
const PHONE = /(?:\+?55[\s-]?)?(?:\(?\d{2}\)?[\s-]?)?9?\d{4}[\s-]?\d{4}\b/g;
// CEP: com hífen ou precedido de "CEP" (8 dígitos soltos podem ser pedido ou telefone).
const CEP = /\bCEP:?\s*\d{5}-?\d{3}\b|\b\d{5}-\d{3}\b/gi;
// Logradouro com número: tipo do logradouro (com inicial maiúscula, para não pegar "rua" em texto corrido), nome curto,
// número e complemento opcional. Endereço sem número ou escrito todo em minúsculas não é detectado (limitação documentada).
const ADDRESS = /\b(?:Rua|R\.|Avenida|Av\.?|Travessa|Tv\.|Alameda|Al\.|Rodovia|Rod\.|Estrada|Praça|Largo)\s+[^\n,;.]{2,60}?,?\s*(?:n[º°o.]?\s*)?\d{1,5}\b(?:\s*[,-]?\s*(?:ap(?:to|artamento)?|bloco|bl|casa|sala|conj(?:unto)?)\.?\s*\w{1,6}\b)*/g;
// Partículas que não identificam ninguém sozinhas.
const NAME_PARTICLES = new Set(["da", "de", "do", "das", "dos", "e"]);

export interface MaskOptions {
  /** Nomes já conhecidos (ex.: o contato do chamado). O nome completo e cada parte com 3+ letras são mascarados. */
  knownNames?: (string | null | undefined)[];
}

export interface MaskResult {
  text: string;
  counts: Record<"email" | "cnpj" | "cpf" | "card" | "phone" | "cep" | "address" | "name", number>;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Expressão que encontra o nome completo e cada parte significativa, sem diferenciar maiúsculas. */
function namePattern(names: (string | null | undefined)[]): RegExp | null {
  const parts = new Set<string>();
  for (const n of names) {
    const full = n?.trim().replace(/\s+/g, " ");
    if (!full) continue;
    parts.add(full);
    for (const p of full.split(" ")) if (p.length >= 3 && !NAME_PARTICLES.has(p.toLowerCase())) parts.add(p);
  }
  if (!parts.size) return null;
  // Mais longos primeiro, para o nome completo virar um único marcador.
  const alt = [...parts].sort((a, b) => b.length - a.length).map(escapeRe).join("|");
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, "giu");
}

/** Substitui e-mails, CNPJ e CPF válidos, cartões (Luhn), telefones, CEPs, endereços e nomes conhecidos por marcadores. */
export function maskPII(input: string, opts: MaskOptions = {}): MaskResult {
  const counts = { email: 0, cnpj: 0, cpf: 0, card: 0, phone: 0, cep: 0, address: 0, name: 0 };
  let text = input.replace(EMAIL, () => (counts.email++, "[EMAIL]"));
  text = text.replace(CNPJ, (m) => (isValidCnpj(m) ? (counts.cnpj++, "[CNPJ]") : m));
  text = text.replace(CPF, (m) => (isValidCpf(m) ? (counts.cpf++, "[CPF]") : m));
  text = text.replace(CARD, (m) => (passesLuhn(m) ? (counts.card++, "[CARTAO]") : m));
  text = text.replace(CEP, () => (counts.cep++, "[CEP]"));
  text = text.replace(PHONE, (m) => (onlyDigits(m).length >= 8 ? (counts.phone++, "[TELEFONE]") : m));
  text = text.replace(ADDRESS, () => (counts.address++, "[ENDERECO]"));
  const names = namePattern(opts.knownNames ?? []);
  if (names) text = text.replace(names, () => (counts.name++, "[NOME]"));
  return { text, counts };
}
