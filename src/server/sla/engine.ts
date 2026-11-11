import type { TicketPriority, TicketStatus } from "@/generated/prisma/client";
import { addBusinessSeconds, businessSeconds, type Calendar, type WeekHours } from "./calendar";

// Cálculo de SLA (RF-SLA-02, RF-SLA-03; RN-20 a RN-24). Funções puras e determinísticas:
// o tempo consumido vem dos intervalos em que o relógio corre (Novo e Aberto). Aguardando
// cliente/terceiro pausa (RN-22); Resolvido para a contagem e a reabertura a retoma (RN-21).
// Mudar a prioridade recalcula a partir da criação com a meta da nova prioridade (RN-24).

export type Metric = "first_response" | "resolution";
export const METRICS: readonly Metric[] = ["first_response", "resolution"];
export const RISK_RATIO = 0.8;

export interface PolicyTargets {
  firstResponseMinutes: number | null;
  resolutionMinutes: number | null;
  businessHours: boolean;
}

/** Calendário e metas vigentes na criação do chamado (CA-12.3, CA-03.3). */
export interface SlaSnapshot {
  timezone: string;
  week: WeekHours;
  policies: Partial<Record<TicketPriority, PolicyTargets>>;
}

/** [início, fim | null] em ISO 8601 */
export type Interval = [string, string | null];

export const RUNNING_STATUSES: readonly TicketStatus[] = ["new", "open"];
export const isRunning = (s: TicketStatus) => RUNNING_STATUSES.includes(s);

/** Abre ou fecha o intervalo corrente conforme a mudança de status. */
export function nextIntervals(intervals: Interval[], from: TicketStatus | null, to: TicketStatus, at: Date): Interval[] {
  const was = from !== null && isRunning(from);
  const will = isRunning(to);
  const out = intervals.map((i) => [...i] as Interval);
  const last = out.at(-1);
  if (!was && will && !(last && last[1] === null)) out.push([at.toISOString(), null]);
  if (was && !will && last && last[1] === null) last[1] = at.toISOString();
  return out;
}

function clip(intervals: Interval[], until: Date | null): [Date, Date | null][] {
  const out: [Date, Date | null][] = [];
  for (const [s, e] of intervals) {
    const start = new Date(s);
    let end = e ? new Date(e) : null;
    if (until) {
      if (start >= until) break;
      if (!end || end > until) end = until;
    }
    out.push([start, end]);
  }
  return out;
}

function span(from: Date, to: Date, business: boolean, cal: Calendar): number {
  return business ? businessSeconds(from, to, cal) : Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

/** Segundos de SLA consumidos até `now`. */
export function consumedSeconds(intervals: [Date, Date | null][], now: Date, business: boolean, cal: Calendar): number {
  let total = 0;
  for (const [s, e] of intervals) {
    if (s >= now) break;
    total += span(s, e && e < now ? e : now, business, cal);
  }
  return total;
}

/** Instante em que o consumo atinge `target` segundos; null se não atingir nos intervalos conhecidos. */
export function instantAt(intervals: [Date, Date | null][], target: number, business: boolean, cal: Calendar): Date | null {
  let need = target;
  for (const [s, e] of intervals) {
    const segment = e ? span(s, e, business, cal) : Infinity;
    if (need <= segment) return business ? addBusinessSeconds(s, need, cal) : new Date(s.getTime() + need * 1000);
    need -= segment;
  }
  return null;
}

export type MetricState = "none" | "ok" | "risk" | "breached" | "paused" | "met" | "met_late" | "cancelled";

export interface MetricResult {
  metric: Metric;
  state: MetricState;
  targetSeconds: number | null;
  consumedSeconds: number;
  remainingSeconds: number | null;
  /** Prazo e marco de 80%, enquanto a meta está em aberto */
  dueAt: Date | null;
  riskAt: Date | null;
  /** Limites já cruzados até agora (para registro único de risco e violação) */
  crossed: { risk: Date | null; breach: Date | null };
}

export interface SlaTicket {
  status: TicketStatus;
  priority: TicketPriority;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
  cancelledAt: Date | null;
  snapshot: SlaSnapshot | null;
  intervals: Interval[];
}

export function computeMetric(t: SlaTicket, metric: Metric, now: Date, holidays: ReadonlySet<string>): MetricResult {
  const policy = t.snapshot?.policies[t.priority];
  const minutes = metric === "first_response" ? policy?.firstResponseMinutes : policy?.resolutionMinutes;
  const none: MetricResult = { metric, state: "none", targetSeconds: null, consumedSeconds: 0, remainingSeconds: null, dueAt: null, riskAt: null, crossed: { risk: null, breach: null } };
  if (!t.snapshot || !policy || !minutes) return none;
  const cal: Calendar = { timezone: t.snapshot.timezone, week: t.snapshot.week, holidays };
  const target = minutes * 60;
  // Fim da contagem: primeira resposta pública (RN-20) ou resolução (RN-21)
  const stoppedAt = metric === "first_response" ? t.firstRespondedAt : ["resolved", "closed"].includes(t.status) ? t.resolvedAt : null;
  const intervals = clip(t.intervals, stoppedAt);
  const effective = stoppedAt && stoppedAt < now ? stoppedAt : now;
  const consumed = consumedSeconds(intervals, effective, policy.businessHours, cal);
  const dueAt = instantAt(intervals, target, policy.businessHours, cal);
  const riskAt = instantAt(intervals, Math.ceil(target * RISK_RATIO), policy.businessHours, cal);
  const crossed = { risk: riskAt && riskAt <= effective ? riskAt : null, breach: dueAt && dueAt <= effective ? dueAt : null };
  const base = { metric, targetSeconds: target, consumedSeconds: consumed, remainingSeconds: target - consumed, crossed };
  if (stoppedAt) return { ...base, state: consumed <= target ? "met" : "met_late", dueAt: null, riskAt: null };
  // Cancelados ficam fora dos indicadores de tempo e de SLA (RN-45)
  if (t.status === "cancelled") return { ...base, state: "cancelled", dueAt: null, riskAt: null, crossed: { risk: null, breach: null } };
  const running = t.intervals.at(-1)?.[1] === null && isRunning(t.status);
  const state: MetricState = consumed >= target ? "breached" : consumed >= target * RISK_RATIO ? "risk" : running ? "ok" : "paused";
  return { ...base, state, dueAt, riskAt };
}

export function computeSla(t: SlaTicket, now: Date, holidays: ReadonlySet<string>): Record<Metric, MetricResult> {
  return { first_response: computeMetric(t, "first_response", now, holidays), resolution: computeMetric(t, "resolution", now, holidays) };
}
