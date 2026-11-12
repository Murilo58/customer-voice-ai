import { getDb, type Db } from "@/server/db/client";

// Limite de taxa por identidade em janela fixa (ADR-009): upsert atômico em rate_limit_counters.
// A borda (WAF) absorve o volume; aqui ficam os limites por e-mail, IP e organização.

export interface RateRule {
  limit: number;
  windowSeconds: number;
}

export const RATE_RULES = {
  /** Formulário público: por IP e por e-mail na organização */
  portalSubmitIp: { limit: 20, windowSeconds: 600 },
  portalSubmitEmail: { limit: 10, windowSeconds: 3600 },
  /** Link mágico: 3 a cada 15 min por e-mail e 10/h por IP */
  magicLinkEmail: { limit: 3, windowSeconds: 900 },
  magicLinkIp: { limit: 10, windowSeconds: 3600 },
  /** Resposta e avaliação pelo portal: por sessão */
  portalReply: { limit: 30, windowSeconds: 3600 },
  /** No máximo 1 e-mail automático por hora para endereço não verificado (RN-16) */
  autoEmail: { limit: 1, windowSeconds: 3600 },
} as const satisfies Record<string, RateRule>;

/** Conta a tentativa e informa se está dentro do limite. A chave deve vir de rateKey(). */
export async function hitRateLimit(key: string, rule: RateRule, db: Db = getDb()): Promise<boolean> {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limit_counters (key, window_start, count)
    VALUES (${key}, to_timestamp(floor(extract(epoch FROM now()) / ${rule.windowSeconds}) * ${rule.windowSeconds}), 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_counters.count + 1
    RETURNING count`;
  return (rows[0]?.count ?? Infinity) <= rule.limit;
}

/** Limpeza das janelas antigas (varredor). */
export async function pruneRateLimits(db: Db = getDb()): Promise<number> {
  return db.$executeRaw`DELETE FROM rate_limit_counters WHERE window_start < now() - interval '1 day'`;
}
