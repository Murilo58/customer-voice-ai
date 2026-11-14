import type { Taxonomy, TriageInput } from "./triage-schema";
import { GeminiTriageProvider } from "./gemini";

// Provedor de triagem desacoplado (RIA-03: modelo é configuração).
// Padrão: "simulated" (determinístico, sem rede e sem custo). O Gemini (gemini.ts) só é usado com
// AI_PROVIDER=gemini, GEMINI_API_KEY e AI_TRIAGE_MODEL definidos explicitamente (ADR-005).

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  thoughtTokens: number;
}

export interface ProviderResponse {
  text: string;
  usage: ProviderUsage;
  latencyMs: number;
}

export interface TriageProvider {
  readonly model: string;
  generate(input: TriageInput, taxonomy: Taxonomy): Promise<ProviderResponse>;
}

/** Geração de texto livre (sugestão de resposta). O conteúdo chega já minimizado e mascarado. */
export interface TextInput {
  systemInstruction: string;
  content: string;
  maxOutputTokens: number;
  temperature: number;
}

export interface TextProvider {
  readonly model: string;
  generateText(input: TextInput): Promise<ProviderResponse>;
}

export type AiProvider = TriageProvider & TextProvider;

/** transient: timeout, 429, 5xx (nova tentativa). permanent: chave, modelo, requisição (sem nova tentativa). */
export class ProviderError extends Error {
  constructor(
    readonly kind: "transient" | "permanent",
    readonly code: string,
  ) {
    super(`Falha do provedor de IA: ${code}`);
  }
}

const estimateTokens = (s: string) => Math.ceil(s.length / 4);

/** Classificação por palavras-chave, apenas para desenvolvimento e testes com dados sintéticos. */
export class SimulatedTriageProvider implements AiProvider {
  readonly model = "simulated-v1";

  async generate(input: TriageInput, taxonomy: Taxonomy): Promise<ProviderResponse> {
    const started = performance.now();
    const text = input.content.toLowerCase();
    const has = (...words: string[]) => words.some((w) => text.includes(w));
    const type = has("elogio", "parabéns", "obrigad") ? "compliment"
      : has("sugiro", "sugestão", "seria bom") ? "suggestion"
      : has("como ", "dúvida", "qual ", "?") && !has("não chegou", "defeito", "cobrad") ? "question"
      : has("quero", "gostaria", "solicito", "preciso") && !has("absurdo", "péssimo") ? "request"
      : "complaint";
    const risk = has("procon", "reclame aqui", "advogado", "processo judicial", "justiça");
    const signals = [has("procon") && "procon", has("reclame aqui") && "reclame_aqui", has("advogado", "justiça", "processo judicial") && "acao_judicial", has("cancelar", "cancelamento") && "cancelamento"].filter(Boolean);
    const sentiment = has("absurdo", "péssimo", "ridículo", "horrível") ? "very_negative" : type === "complaint" ? "negative" : type === "compliment" ? "positive" : "neutral";
    const urgency = has("urgente", "bloquead", "cobrança indevida", "cobrado duas vezes", "hoje") ? "high" : type === "question" || type === "suggestion" || type === "compliment" ? "low" : "medium";
    const match = (items: { id: string; name: string }[]) =>
      items.find((i) => i.name.toLowerCase().split(/[\s/,-]+/).some((w) => w.length > 3 && text.includes(w)))?.id ?? null;
    const body = {
      type,
      category_id: match(taxonomy.categories),
      reason_id: match(taxonomy.reasons),
      team_id: match(taxonomy.teams ?? []),
      urgency,
      sentiment,
      escalation_risk: risk,
      risk_signals: signals,
      confidence: { type: 0.6, category: 0.5, reason: 0.4, urgency: 0.6 },
      rationale: "Classificação simulada por palavras-chave (ambiente sem IA real).",
    };
    const out = JSON.stringify(body);
    return {
      text: out,
      usage: { inputTokens: estimateTokens(input.systemInstruction + input.content), outputTokens: estimateTokens(out), thoughtTokens: 0 },
      latencyMs: Math.round(performance.now() - started),
    };
  }

  /** Resposta fixa e cordial, sem rede: serve para desenvolvimento e testes da sugestão de resposta. */
  async generateText(input: TextInput): Promise<ProviderResponse> {
    const text = "Olá, [NOME]. Agradecemos o contato e lamentamos o transtorno. Recebemos sua mensagem e vamos analisar o caso com atenção. Retornaremos com uma atualização assim que tivermos novidades.";
    return { text, usage: { inputTokens: estimateTokens(input.systemInstruction + input.content), outputTokens: estimateTokens(text), thoughtTokens: 0 }, latencyMs: 0 };
  }
}

/** Provedor que falha de forma permanente: a triagem segue o modo degradado (RF-TRI-07) sem chamar a rede. */
const unavailableProvider = (model: string, code: string): AiProvider => ({
  model,
  generate: async () => { throw new ProviderError("permanent", code); },
  generateText: async () => { throw new ProviderError("permanent", code); },
});

/** Mesmo provedor e modelo da triagem para todas as funcionalidades de IA (ADR-005). */
export function getTriageProvider(env: Record<string, string | undefined> = process.env): AiProvider {
  const provider = env.AI_PROVIDER || "simulated";
  if (provider === "simulated") return new SimulatedTriageProvider();
  if (provider === "gemini") {
    // Sem modelo padrão: a escolha é explícita, conforme o benchmark (RIA-13). Só modelos com preço conhecido,
    // para que custo, cota e teto global sejam calculados corretamente (RF-CON-01, RF-CON-04).
    const model = env.AI_TRIAGE_MODEL?.trim();
    const apiKey = env.GEMINI_API_KEY?.trim();
    if (!model || !apiKey) return unavailableProvider(model || "gemini", "gemini_not_configured");
    if (!(model in PRICES) || model === "simulated-v1") return unavailableProvider(model, "gemini_model_not_priced");
    const timeoutMs = Number(env.AI_TIMEOUT_MS);
    return new GeminiTriageProvider({ model, apiKey, ...(Number.isFinite(timeoutMs) && timeoutMs > 0 ? { timeoutMs } : {}) });
  }
  throw new Error(`AI_PROVIDER desconhecido: ${provider}`);
}

/** Preços por 1M de tokens, versionados (AI_ARCHITECTURE 5.1). Custo em micro-dólares. */
export const PRICE_VERSION = "2026-11-09";
const PRICES: Record<string, { input: number; output: number }> = {
  "simulated-v1": { input: 0, output: 0 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
};

export function costUsdMicros(model: string, usage: ProviderUsage): bigint {
  // Modelo sem preço conhecido: custo pela tabela mais cara conhecida (estimativa conservadora).
  const p = PRICES[model] ?? { input: 0.3, output: 2.5 };
  // "response pricing is the sum of output tokens and thinking tokens"
  return BigInt(Math.ceil(usage.inputTokens * p.input + (usage.outputTokens + usage.thoughtTokens) * p.output));
}
