// CA-12.1: cálculo em horas úteis com fim de semana, feriado, pausa, reabertura e troca de prioridade.
// Calendário de referência: America/Sao_Paulo (UTC-3, sem horário de verão), seg a sex 09:00–18:00.
// 2026-11-13 é sexta; 2026-11-16 segunda; 2026-11-20 (sexta) é feriado no cenário.
import { describe, expect, it } from "vitest";
import { addBusinessSeconds, businessSeconds, DEFAULT_WEEK, parseWeek, zonedInstant, type Calendar } from "@/server/sla/calendar";
import { computeMetric, computeSla, nextIntervals, type Interval, type SlaSnapshot, type SlaTicket } from "@/server/sla/engine";

const TZ = "America/Sao_Paulo";
const cal: Calendar = { timezone: TZ, week: DEFAULT_WEEK, holidays: new Set(["2026-11-20"]) };
const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return zonedInstant(date, h * 60 + m, TZ);
};
const H = 3600;

describe("calendário (RN-23)", () => {
  it("conta só o expediente no mesmo dia", () => {
    expect(businessSeconds(at("2026-11-16", "08:00"), at("2026-11-16", "10:30"), cal)).toBe(1.5 * H);
    expect(businessSeconds(at("2026-11-16", "17:00"), at("2026-11-16", "20:00"), cal)).toBe(1 * H);
  });

  it("fim de semana não conta: sexta 17:00 → segunda 10:00 = 2 h", () => {
    expect(businessSeconds(at("2026-11-13", "17:00"), at("2026-11-16", "10:00"), cal)).toBe(2 * H);
  });

  it("feriado não conta: quinta 17:00 → segunda 10:00, com sexta feriado = 2 h", () => {
    expect(businessSeconds(at("2026-11-19", "17:00"), at("2026-11-23", "10:00"), cal)).toBe(2 * H);
  });

  it("somar horas úteis pula noite, fim de semana e feriado", () => {
    // 4 h a partir de sexta 16:00: 2 h na sexta, 2 h na segunda → segunda 11:00
    expect(addBusinessSeconds(at("2026-11-13", "16:00"), 4 * H, cal)).toEqual(at("2026-11-16", "11:00"));
    // Início fora do expediente (sábado) → começa segunda 09:00
    expect(addBusinessSeconds(at("2026-11-14", "12:00"), 1 * H, cal)).toEqual(at("2026-11-16", "10:00"));
    // Quinta 17:00 + 2 h, sexta feriado → segunda 10:00
    expect(addBusinessSeconds(at("2026-11-19", "17:00"), 2 * H, cal)).toEqual(at("2026-11-23", "10:00"));
    expect(addBusinessSeconds(at("2026-11-16", "09:00"), 1, { ...cal, week: {} })).toBeNull();
  });

  it("valida o horário comercial salvo", () => {
    expect(parseWeek({ "1": [540, 1080], "7": [0, 10], "2": [600, 500], "3": "x" })).toEqual({ "1": [540, 1080] });
  });
});

const snapshot = (business: boolean): SlaSnapshot => ({
  timezone: TZ,
  week: DEFAULT_WEEK,
  policies: {
    medium: { firstResponseMinutes: 4 * 60, resolutionMinutes: 16 * 60, businessHours: business },
    high: { firstResponseMinutes: 2 * 60, resolutionMinutes: 8 * 60, businessHours: business },
    low: { firstResponseMinutes: null, resolutionMinutes: null, businessHours: business },
  },
});

const ticket = (over: Partial<SlaTicket>): SlaTicket => ({
  status: "open", priority: "medium", firstRespondedAt: null, resolvedAt: null, cancelledAt: null, snapshot: snapshot(true), intervals: [], ...over,
});
const iv = (...pairs: [Date, Date | null][]): Interval[] => pairs.map(([s, e]) => [s.toISOString(), e ? e.toISOString() : null]);
const holidays = cal.holidays;

describe("motor de SLA (RN-20 a RN-24)", () => {
  it("prazo de primeira resposta em horas úteis atravessa o fim de semana", () => {
    // Criado sexta 16:00, meta 4 h úteis → segunda 11:00; risco (80% = 3h12) → segunda 10:12
    const t = ticket({ intervals: iv([at("2026-11-13", "16:00"), null]) });
    const r = computeMetric(t, "first_response", at("2026-11-13", "17:00"), holidays);
    expect(r).toMatchObject({ state: "ok", consumedSeconds: 1 * H, remainingSeconds: 3 * H });
    expect(r.dueAt).toEqual(at("2026-11-16", "11:00"));
    expect(r.riskAt).toEqual(at("2026-11-16", "10:12"));
  });

  it("situação: em risco a partir de 80% e violado ao atingir a meta", () => {
    const t = ticket({ intervals: iv([at("2026-11-13", "16:00"), null]) });
    expect(computeMetric(t, "first_response", at("2026-11-16", "10:30"), holidays).state).toBe("risk");
    const v = computeMetric(t, "first_response", at("2026-11-16", "12:00"), holidays);
    expect(v.state).toBe("breached");
    expect(v.remainingSeconds).toBe(-1 * H);
    expect(v.crossed.breach).toEqual(at("2026-11-16", "11:00"));
  });

  it("pausa em Aguardando cliente (RN-22): o tempo pausado não conta e o prazo some enquanto pausado", () => {
    // Corre seg 09:00–10:00, pausa até ter 09:00, volta a correr
    const paused = ticket({ status: "waiting_customer", intervals: iv([at("2026-11-16", "09:00"), at("2026-11-16", "10:00")]) });
    const p = computeMetric(paused, "resolution", at("2026-11-17", "08:00"), holidays);
    expect(p).toMatchObject({ state: "paused", consumedSeconds: 1 * H, dueAt: null });
    const resumed = ticket({ intervals: iv([at("2026-11-16", "09:00"), at("2026-11-16", "10:00")], [at("2026-11-17", "09:00"), null]) });
    const r = computeMetric(resumed, "resolution", at("2026-11-17", "10:00"), holidays);
    expect(r.consumedSeconds).toBe(2 * H);
    // Restam 14 h úteis a partir de ter 10:00: 8 h na terça, 6 h na quarta → qua 15:00
    expect(r.dueAt).toEqual(at("2026-11-18", "15:00"));
  });

  it("reabertura retoma a contagem do tempo restante (RN-21)", () => {
    const resolved = ticket({ status: "resolved", resolvedAt: at("2026-11-16", "13:00"), intervals: iv([at("2026-11-16", "09:00"), at("2026-11-16", "13:00")]) });
    expect(computeMetric(resolved, "resolution", at("2026-11-17", "09:00"), holidays)).toMatchObject({ state: "met", consumedSeconds: 4 * H, dueAt: null });
    const reopened = ticket({ intervals: iv([at("2026-11-16", "09:00"), at("2026-11-16", "13:00")], [at("2026-11-17", "09:00"), null]) });
    expect(computeMetric(reopened, "resolution", at("2026-11-17", "11:00"), holidays)).toMatchObject({ state: "ok", consumedSeconds: 6 * H, remainingSeconds: 10 * H });
  });

  it("troca de prioridade recalcula a partir da criação com a nova meta (RN-24)", () => {
    const base = { intervals: iv([at("2026-11-16", "09:00"), null]) };
    const now = at("2026-11-16", "11:00");
    expect(computeMetric(ticket({ ...base, priority: "medium" }), "first_response", now, holidays).state).toBe("ok");
    const high = computeMetric(ticket({ ...base, priority: "high" }), "first_response", now, holidays);
    expect(high).toMatchObject({ state: "breached", remainingSeconds: 0 });
    expect(high.dueAt).toEqual(at("2026-11-16", "11:00"));
    expect(computeMetric(ticket({ ...base, priority: "low" }), "first_response", now, holidays).state).toBe("none");
  });

  it("primeira resposta encerra a meta; resposta após o prazo é cumprida com atraso", () => {
    const t = ticket({ firstRespondedAt: at("2026-11-16", "14:00"), intervals: iv([at("2026-11-16", "09:00"), null]) });
    const r = computeMetric(t, "first_response", at("2026-11-17", "09:00"), holidays);
    expect(r).toMatchObject({ state: "met_late", consumedSeconds: 5 * H, dueAt: null });
    expect(r.crossed.breach).toEqual(at("2026-11-16", "13:00"));
  });

  it("horas corridas ignoram o calendário", () => {
    const t = ticket({ snapshot: snapshot(false), intervals: iv([at("2026-11-14", "10:00"), null]) });
    const r = computeMetric(t, "first_response", at("2026-11-14", "12:00"), holidays);
    expect(r).toMatchObject({ consumedSeconds: 2 * H, state: "ok" });
    expect(r.dueAt).toEqual(at("2026-11-14", "14:00"));
  });

  it("cancelado fica fora (RN-45) e chamado sem snapshot não tem SLA", () => {
    const c = ticket({ status: "cancelled", cancelledAt: at("2026-11-16", "10:00"), intervals: iv([at("2026-11-16", "09:00"), at("2026-11-16", "10:00")]) });
    expect(computeMetric(c, "resolution", at("2026-11-20", "10:00"), holidays)).toMatchObject({ state: "cancelled", crossed: { risk: null, breach: null } });
    expect(computeSla(ticket({ snapshot: null }), new Date(), holidays).resolution.state).toBe("none");
  });

  it("intervalos abrem e fecham conforme o status", () => {
    const t0 = new Date("2026-11-16T12:00:00Z");
    const t1 = new Date("2026-11-16T13:00:00Z");
    const a = nextIntervals([], null, "new", t0);
    expect(a).toEqual([[t0.toISOString(), null]]);
    expect(nextIntervals(a, "new", "open", t1)).toEqual(a);
    const b = nextIntervals(a, "open", "waiting_customer", t1);
    expect(b).toEqual([[t0.toISOString(), t1.toISOString()]]);
    expect(nextIntervals(b, "waiting_customer", "open", t1)).toHaveLength(2);
  });
});
