// Calendário da organização (RN-23): horário comercial por dia da semana e feriados, no fuso da
// organização. Funções puras, sem banco (CA-12.1).

/** Dia da semana (0 = domingo) → [início, fim] em minutos locais; ausente = sem expediente. */
export type WeekHours = Partial<Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", [number, number]>>;

export interface Calendar {
  timezone: string;
  week: WeekHours;
  /** Datas locais AAAA-MM-DD */
  holidays: ReadonlySet<string>;
}

export const DEFAULT_WEEK: WeekHours = { "1": [540, 1080], "2": [540, 1080], "3": [540, 1080], "4": [540, 1080], "5": [540, 1080] };

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Limite de segurança das iterações (dias). */
const MAX_DAYS = 3_660;

export class InvalidDateError extends Error {}

function offsetMs(instant: number, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(new Date(instant)).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60_000 : 0;
}

/** Instante UTC de uma data local + minutos no fuso (trata horário de verão). */
export function zonedInstant(date: string, minutes: number, timeZone: string): Date {
  if (!DATE_RE.test(date)) throw new InvalidDateError(date);
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, mo - 1, d) + minutes * 60_000;
  if (Number.isNaN(guess) || new Date(Date.UTC(y, mo - 1, d)).getUTCDate() !== d) throw new InvalidDateError(date);
  const first = guess - offsetMs(guess, timeZone);
  return new Date(guess - offsetMs(first, timeZone));
}

/** Início do dia (00:00) no fuso, em UTC. */
export function zonedDayStart(date: string, timeZone: string): Date {
  return zonedInstant(date, 0, timeZone);
}

/** Data local AAAA-MM-DD de um instante no fuso. */
export function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

function nextDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) + DAY_MS).toISOString().slice(0, 10);
}

function weekday(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return String(new Date(Date.UTC(y, m - 1, d)).getUTCDay());
}

/** Janela de expediente de uma data local, em UTC, ou null (fim de semana, feriado, sem horário). */
function window(date: string, cal: Calendar): [number, number] | null {
  if (cal.holidays.has(date)) return null;
  const hours = cal.week[weekday(date) as keyof WeekHours];
  if (!hours || hours[1] <= hours[0]) return null;
  return [zonedInstant(date, hours[0], cal.timezone).getTime(), zonedInstant(date, hours[1], cal.timezone).getTime()];
}

/** Segundos de expediente entre dois instantes. */
export function businessSeconds(from: Date, to: Date, cal: Calendar): number {
  if (to <= from) return 0;
  let total = 0;
  let date = localDate(from, cal.timezone);
  const last = localDate(to, cal.timezone);
  for (let i = 0; i <= MAX_DAYS; i++) {
    const w = window(date, cal);
    if (w) total += Math.max(0, Math.min(w[1], to.getTime()) - Math.max(w[0], from.getTime()));
    if (date === last) break;
    date = nextDate(date);
  }
  return Math.floor(total / 1000);
}

/** Instante em que `seconds` de expediente terão passado a partir de `from`; null se o calendário não tiver expediente. */
export function addBusinessSeconds(from: Date, seconds: number, cal: Calendar): Date | null {
  let left = seconds * 1000;
  let date = localDate(from, cal.timezone);
  for (let i = 0; i <= MAX_DAYS; i++) {
    const w = window(date, cal);
    if (w) {
      const start = Math.max(w[0], from.getTime());
      const available = w[1] - start;
      if (available > 0) {
        if (left <= available) return new Date(start + left);
        left -= available;
      }
    }
    date = nextDate(date);
  }
  return null;
}

/** Valida o horário comercial informado pela organização. */
export function parseWeek(value: unknown): WeekHours {
  const out: WeekHours = {};
  if (!value || typeof value !== "object") return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[0-6]$/.test(k) || !Array.isArray(v) || v.length !== 2) continue;
    const [a, b] = v as [unknown, unknown];
    if (typeof a === "number" && typeof b === "number" && Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b <= 1440 && b > a) {
      out[k as keyof WeekHours] = [a, b];
    }
  }
  return out;
}
