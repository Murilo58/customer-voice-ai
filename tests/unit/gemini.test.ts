// Provedor Gemini (ADR-005) sem rede: o SDK oficial roda de verdade, com um fetch falso no lugar da API.
import { describe, expect, it } from "vitest";
import { classifyGeminiError, GeminiTriageProvider } from "@/server/ai/gemini";
import { getTriageProvider, ProviderError, SimulatedTriageProvider } from "@/server/ai/provider";
import { buildTriageInput, parseTriageOutput, type Taxonomy } from "@/server/ai/triage-schema";

const taxonomy: Taxonomy = {
  categories: [{ id: "11111111-1111-7111-8111-111111111111", name: "Entrega" }],
  reasons: [{ id: "33333333-3333-7333-8333-333333333333", name: "Atraso" }],
  teams: [],
};
const input = buildTriageInput({ subject: "Pedido atrasado", description: "Meu CPF é 529.982.247-25 e o pedido não chegou.", channel: "email" }, taxonomy);
const FAKE_KEY = "chave-falsa-de-teste";

const suggestion = {
  type: "complaint", category_id: taxonomy.categories[0]!.id, reason_id: taxonomy.reasons[0]!.id, team_id: null,
  urgency: "medium", sentiment: "negative", escalation_risk: false, risk_signals: [], rationale: "Atraso na entrega.",
};
const okBody = (text = JSON.stringify(suggestion), extra: Record<string, unknown> = {}) => ({
  candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 812, candidatesTokenCount: 96, thoughtsTokenCount: 4, totalTokenCount: 912 },
  ...extra,
});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const apiError = (status: number, statusText: string) => json(status, { error: { code: status, message: "erro sintético", status: statusText } });

/** fetch falso: registra a requisição e devolve a próxima resposta da fila. */
function fakeFetch(...responses: (Response | Error | "hang")[]) {
  const calls: { url: string; headers: Headers; body: any }[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers), body: init?.body ? JSON.parse(String(init.body)) : null });
    const next = responses.length > 1 ? responses.shift()! : responses[0]!;
    if (next === "hang") {
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
    }
    if (next instanceof Error) throw next;
    return next.clone();
  }) as typeof fetch;
  return { fn, calls };
}

const provider = (f: typeof fetch, timeoutMs?: number) => new GeminiTriageProvider({ model: "gemini-3.1-flash-lite", apiKey: FAKE_KEY, fetch: f, timeoutMs });

describe("provedor Gemini: requisição (contrato com o SDK oficial)", () => {
  it("envia modelo, chave no cabeçalho, instrução de sistema, conteúdo mascarado e saída estruturada", async () => {
    const { fn, calls } = fakeFetch(json(200, okBody()));
    await provider(fn).generate(input, taxonomy);
    expect(calls).toHaveLength(1);
    const [c] = calls;
    expect(c!.url).toContain("models/gemini-3.1-flash-lite:generateContent");
    expect(c!.url).not.toContain(FAKE_KEY);
    expect(c!.headers.get("x-goog-api-key")).toBe(FAKE_KEY);
    const text = JSON.stringify(c!.body);
    expect(text).toContain("[CPF]");
    expect(text).not.toContain("529.982.247-25");
    expect(c!.body.systemInstruction.parts[0].text).toBe(input.systemInstruction);
    expect(c!.body.generationConfig).toMatchObject({
      responseMimeType: "application/json", responseJsonSchema: input.responseJsonSchema, temperature: 0, maxOutputTokens: 1024,
      thinkingConfig: { thinkingLevel: "MINIMAL" },
    });
  });

  it("mapeia texto e consumo de tokens; a saída passa na validação da triagem", async () => {
    const { fn } = fakeFetch(json(200, okBody()));
    const r = await provider(fn).generate(input, taxonomy);
    expect(r.usage).toEqual({ inputTokens: 812, outputTokens: 96, thoughtTokens: 4 });
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    expect(parseTriageOutput(r.text, taxonomy)).toMatchObject({ type: "complaint", category_id: taxonomy.categories[0]!.id });
  });

  it("texto vazio volta como string vazia (o pipeline trata como saída inválida e tenta de novo)", async () => {
    const { fn } = fakeFetch(json(200, { candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }], usageMetadata: { promptTokenCount: 10 } }));
    const r = await provider(fn).generate(input, taxonomy);
    expect(r.text).toBe("");
    expect(() => parseTriageOutput(r.text, taxonomy)).toThrow();
  });
});

describe("provedor Gemini: erros transitórios e permanentes", () => {
  const expectError = async (p: Promise<unknown>, kind: string, code: string) => {
    const e = await p.then(() => null, (x) => x);
    expect(e).toBeInstanceOf(ProviderError);
    expect(e).toMatchObject({ kind, code });
    expect(String(e.message)).not.toContain(FAKE_KEY);
  };

  for (const [status, label] of [[429, "RESOURCE_EXHAUSTED"], [500, "INTERNAL"], [503, "UNAVAILABLE"], [504, "DEADLINE_EXCEEDED"]] as const) {
    it(`HTTP ${status} é transitório`, async () => {
      const { fn, calls } = fakeFetch(apiError(status, label));
      await expectError(provider(fn).generate(input, taxonomy), "transient", `http_${status}`);
      expect(calls).toHaveLength(1); // sem nova tentativa dentro do SDK: o pipeline controla as tentativas e o custo
    });
  }

  for (const [status, label] of [[400, "INVALID_ARGUMENT"], [401, "UNAUTHENTICATED"], [403, "PERMISSION_DENIED"], [404, "NOT_FOUND"]] as const) {
    it(`HTTP ${status} é permanente`, async () => {
      const { fn } = fakeFetch(apiError(status, label));
      await expectError(provider(fn).generate(input, taxonomy), "permanent", `http_${status}`);
    });
  }

  it("tempo esgotado é transitório", async () => {
    const { fn } = fakeFetch("hang");
    await expectError(provider(fn, 30).generate(input, taxonomy), "transient", "timeout");
  });

  it("falha de rede é transitória", async () => {
    const { fn } = fakeFetch(new TypeError("fetch failed"));
    await expectError(provider(fn).generate(input, taxonomy), "transient", "network");
  });

  it("conteúdo bloqueado é permanente (não adianta repetir)", async () => {
    const { fn } = fakeFetch(json(200, { promptFeedback: { blockReason: "SAFETY" }, usageMetadata: { promptTokenCount: 10 } }));
    await expectError(provider(fn).generate(input, taxonomy), "permanent", "blocked_safety");
    const { fn: fn2 } = fakeFetch(json(200, { candidates: [{ content: { parts: [{ text: "" }] }, finishReason: "PROHIBITED_CONTENT" }] }));
    await expectError(provider(fn2).generate(input, taxonomy), "permanent", "blocked_prohibited_content");
  });

  it("erros desconhecidos viram transitórios sem copiar a mensagem original", () => {
    const e = classifyGeminiError(new Error(`falha com ${FAKE_KEY}`));
    expect(e).toMatchObject({ kind: "transient", code: "provider_exception" });
    expect(e.message).not.toContain(FAKE_KEY);
  });

  it("sem chave e sem cliente injetado não cria o provedor", () => {
    expect(() => new GeminiTriageProvider({ model: "gemini-3.1-flash-lite" })).toThrow(ProviderError);
  });
});

describe("seleção do provedor (getTriageProvider)", () => {
  const unavailable = async (env: Record<string, string | undefined>, code: string) => {
    const p = getTriageProvider(env);
    expect(p).not.toBeInstanceOf(GeminiTriageProvider);
    await expect(p.generate(input, taxonomy)).rejects.toMatchObject({ kind: "permanent", code });
    return p;
  };

  it("o padrão continua sendo o simulado", () => {
    expect(getTriageProvider({})).toBeInstanceOf(SimulatedTriageProvider);
    expect(getTriageProvider({ AI_PROVIDER: "simulated", GEMINI_API_KEY: FAKE_KEY, AI_TRIAGE_MODEL: "gemini-3.1-flash-lite" })).toBeInstanceOf(SimulatedTriageProvider);
  });

  it("gemini sem chave ou sem modelo fica indisponível (modo degradado), sem rede", async () => {
    await unavailable({ AI_PROVIDER: "gemini", AI_TRIAGE_MODEL: "gemini-3.1-flash-lite" }, "gemini_not_configured");
    expect((await unavailable({ AI_PROVIDER: "gemini", GEMINI_API_KEY: FAKE_KEY }, "gemini_not_configured")).model).toBe("gemini");
  });

  it("modelo sem preço conhecido é recusado (custo e teto precisam ser calculáveis)", async () => {
    await unavailable({ AI_PROVIDER: "gemini", GEMINI_API_KEY: FAKE_KEY, AI_TRIAGE_MODEL: "gemini-modelo-sem-preco" }, "gemini_model_not_priced");
    await unavailable({ AI_PROVIDER: "gemini", GEMINI_API_KEY: FAKE_KEY, AI_TRIAGE_MODEL: "simulated-v1" }, "gemini_model_not_priced");
  });

  it("gemini configurado usa o modelo escolhido (troca só por configuração)", () => {
    for (const model of ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]) {
      const p = getTriageProvider({ AI_PROVIDER: "gemini", GEMINI_API_KEY: FAKE_KEY, AI_TRIAGE_MODEL: model });
      expect(p).toBeInstanceOf(GeminiTriageProvider);
      expect(p.model).toBe(model);
    }
  });

  it("provedor desconhecido é erro de configuração", () => {
    expect(() => getTriageProvider({ AI_PROVIDER: "outro" })).toThrow(/desconhecido/);
  });
});
