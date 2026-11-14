import { ApiError, GoogleGenAI, ThinkingLevel, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";
import type { Taxonomy, TriageInput } from "./triage-schema";
import { ProviderError, type ProviderResponse, type TriageProvider } from "./provider";

// Provedor Gemini (ADR-005; AI_ARCHITECTURE seção 3). Só é usado com AI_PROVIDER=gemini; o padrão continua "simulated".
// - Recebe o conteúdo já minimizado e mascarado por buildTriageInput (RIA-08, RIA-09): este módulo não lê dados do chamado.
// - Saída estruturada com o schema da triagem; a validação final continua em parseTriageOutput (RIA-04).
// - Sem novas tentativas no SDK (retryOptions ausente): quem repete é o pipeline, que registra custo e cota de cada
//   tentativa (RIA-05). Aqui só se classifica o erro como transitório ou permanente.

/** Interface mínima do SDK usada pelo provedor (permite testes sem rede). */
export interface GeminiModels {
  generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse>;
}

export interface GeminiOptions {
  model: string;
  /** Chave da API. Nunca é registrada em log nem incluída em mensagens de erro. */
  apiKey?: string;
  /** Tempo limite por chamada, em ms (padrão 20 s). */
  timeoutMs?: number;
  /** Teto de tokens de saída por chamada (controle de custo). */
  maxOutputTokens?: number;
  /** Cliente injetado (testes). Sem ele, cria o cliente oficial com a chave. */
  models?: GeminiModels;
  /** fetch injetado no SDK oficial (testes de contrato sem rede). */
  fetch?: typeof fetch;
}

export const GEMINI_DEFAULT_TIMEOUT_MS = 20_000;
export const GEMINI_MAX_OUTPUT_TOKENS = 1_024;

/** Status HTTP que justificam nova tentativa: tempo esgotado, limite de taxa e falhas do servidor. */
const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);
/** Respostas bloqueadas não melhoram com nova tentativa. */
const BLOCKED_FINISH = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY", "LANGUAGE"]);

export class GeminiTriageProvider implements TriageProvider {
  readonly model: string;
  private readonly models: GeminiModels;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;

  constructor(opts: GeminiOptions) {
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? GEMINI_DEFAULT_TIMEOUT_MS;
    this.maxOutputTokens = opts.maxOutputTokens ?? GEMINI_MAX_OUTPUT_TOKENS;
    if (opts.models) this.models = opts.models;
    else {
      if (!opts.apiKey) throw new ProviderError("permanent", "gemini_not_configured");
      this.models = new GoogleGenAI({ apiKey: opts.apiKey, ...(opts.fetch ? { httpOptions: { fetch: opts.fetch } } : {}) }).models;
    }
  }

  async generate(input: TriageInput, _taxonomy: Taxonomy): Promise<ProviderResponse> {
    const started = performance.now();
    let res: GenerateContentResponse;
    try {
      res = await this.models.generateContent({
        model: this.model,
        contents: input.content,
        config: {
          systemInstruction: input.systemInstruction,
          responseMimeType: "application/json",
          responseJsonSchema: input.responseJsonSchema,
          temperature: 0,
          maxOutputTokens: this.maxOutputTokens,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          abortSignal: AbortSignal.timeout(this.timeoutMs),
        },
      });
    } catch (e) {
      throw classifyGeminiError(e);
    }
    const latencyMs = Math.round(performance.now() - started);
    const blockReason = res.promptFeedback?.blockReason;
    if (blockReason) throw new ProviderError("permanent", `blocked_${String(blockReason).toLowerCase()}`);
    const finish = res.candidates?.[0]?.finishReason;
    if (finish && BLOCKED_FINISH.has(String(finish))) throw new ProviderError("permanent", `blocked_${String(finish).toLowerCase()}`);
    const u = res.usageMetadata ?? {};
    return {
      // Texto vazio ou truncado (MAX_TOKENS) falha na validação e gera a nova tentativa de saída inválida (RIA-04).
      text: res.text ?? "",
      usage: { inputTokens: u.promptTokenCount ?? 0, outputTokens: u.candidatesTokenCount ?? 0, thoughtTokens: u.thoughtsTokenCount ?? 0 },
      latencyMs,
    };
  }
}

/** Converte qualquer falha da chamada em ProviderError, sem copiar a mensagem original (pode conter dados da requisição). */
export function classifyGeminiError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  if (e instanceof ApiError) {
    return new ProviderError(TRANSIENT_STATUS.has(e.status) ? "transient" : "permanent", `http_${e.status}`);
  }
  const names = [(e as { name?: string } | null)?.name, ((e as { cause?: { name?: string } } | null)?.cause)?.name];
  if (names.some((n) => n === "TimeoutError" || n === "AbortError")) return new ProviderError("transient", "timeout");
  // Falha de rede (DNS, conexão recusada/reiniciada): o fetch lança TypeError.
  if (e instanceof TypeError) return new ProviderError("transient", "network");
  return new ProviderError("transient", "provider_exception");
}
