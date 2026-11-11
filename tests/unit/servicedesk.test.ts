import { describe, expect, it } from "vitest";
import { parseTriageOutput, buildTriageInput } from "@/server/ai/triage-schema";
import { renderEmail } from "@/server/email/outbound";
import { allowedTransitions, canTransition, resolutionBlockers } from "@/server/servicedesk/status";
import { zonedDayStart } from "@/server/servicedesk/tickets";

describe("RN-05: ciclo de status", () => {
  it("permite somente as transições previstas", () => {
    expect(allowedTransitions("new")).toEqual(["open", "cancelled"]);
    expect(allowedTransitions("open")).toEqual(["waiting_customer", "waiting_third_party", "resolved", "cancelled"]);
    expect(allowedTransitions("closed")).toEqual([]);
    expect(allowedTransitions("cancelled")).toEqual([]);
    expect(canTransition("resolved", "closed")).toBe(false);
    expect(canTransition("resolved", "closed", "system")).toBe(true);
    expect(canTransition("open", "closed", "system")).toBe(false);
  });

  it("RN-06: exige tipo e categoria sem sugestão pendente", () => {
    expect(resolutionBlockers({ type: null, categoryId: null, pendingReviewFields: [] })).toEqual(["type", "category"]);
    expect(resolutionBlockers({ type: "complaint", categoryId: "c", pendingReviewFields: ["category"] })).toEqual(["category"]);
    expect(resolutionBlockers({ type: "complaint", categoryId: "c", pendingReviewFields: ["reason", "priority"] })).toEqual([]);
  });
});

describe("período no fuso da organização", () => {
  it("converte o início do dia para UTC", () => {
    expect(zonedDayStart("2026-11-11", "America/Sao_Paulo").toISOString()).toBe("2026-11-11T03:00:00.000Z");
    expect(zonedDayStart("2026-11-11", "America/Manaus").toISOString()).toBe("2026-11-11T04:00:00.000Z");
    expect(zonedDayStart("2026-07-01", "America/New_York").toISOString()).toBe("2026-07-01T04:00:00.000Z");
  });
  it("recusa datas inválidas", () => {
    expect(() => zonedDayStart("2026-02-30", "America/Sao_Paulo")).toThrow();
    expect(() => zonedDayStart("11/11/2026", "America/Sao_Paulo")).toThrow();
  });
});

describe("e-mail transacional (RN-19)", () => {
  it("resposta pública leva só a mensagem nova e o link", () => {
    const r = renderEmail("public_reply", { protocol: "ACME-000001", subject: "Pedido", organizationName: "ACME", body: "Nova mensagem", link: "https://x.test/p/acme" });
    expect(r.subject).toBe("[ACME-000001] Pedido");
    expect(r.text.startsWith("Nova mensagem")).toBe(true);
    expect(r.text).toContain("https://x.test/p/acme");
  });
  it("aviso de resolução cita o prazo de reabertura", () => {
    expect(renderEmail("ticket_resolved", { protocol: "A-000002", subject: "S", organizationName: "A", body: null, link: "l" }).text).toContain("7 dias");
  });
});

describe("equipe sugerida pela triagem", () => {
  const taxonomy = { categories: [], reasons: [], teams: [{ id: "44444444-4444-7444-8444-444444444444", name: "Financeiro" }] };
  const base = { type: "complaint", category_id: null, reason_id: null, urgency: "low", sentiment: "neutral", escalation_risk: false, risk_signals: [], rationale: "ok" };

  it("aceita equipe ativa e descarta equipe fora da lista (RN-14; CA-02.5)", () => {
    expect(parseTriageOutput(JSON.stringify({ ...base, team_id: taxonomy.teams[0]!.id }), taxonomy).team_id).toBe(taxonomy.teams[0]!.id);
    expect(parseTriageOutput(JSON.stringify({ ...base, team_id: "arquivada" }), taxonomy)).toMatchObject({ team_id: null, discarded: ["team"] });
    expect(parseTriageOutput(JSON.stringify(base), taxonomy).team_id).toBeNull();
  });
  it("lista as equipes no prompt e no schema", () => {
    const input = buildTriageInput({ subject: "a", description: "b", channel: "manual" }, taxonomy);
    expect(input.systemInstruction).toContain("Financeiro");
    expect(JSON.stringify(input.responseJsonSchema)).toContain(taxonomy.teams[0]!.id);
  });
});
