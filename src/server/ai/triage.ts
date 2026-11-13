import { Prisma, type TicketPriority } from "@/generated/prisma/client";
import { newId } from "@/lib/security";
import { getDb, type Db } from "@/server/db/client";
import { withTenant, type Tx } from "@/server/db/tenant";
import type { ClaimedJob } from "@/server/jobs/outbox";
import { refreshSla } from "@/server/sla/service";
import { suggestPriority } from "./priority";
import { costUsdMicros, getTriageProvider, PRICE_VERSION, ProviderError, type ProviderUsage, type TriageProvider } from "./provider";
import { buildTriageInput, idempotencyKey, InvalidOutputError, parseTriageOutput, PROMPT_VERSION, type Taxonomy, type TriageSuggestion } from "./triage-schema";

// Worker de triagem (AI_ARCHITECTURE seção 3). A IA só sugere: não altera status, não envia
// mensagens e não fecha chamados (RIA-14). Qualquer falha mantém o atendimento manual (RF-TRI-07).

export const TRIAGE_JOB = "triage";

export interface TriagePayload {
  ticketId: string;
  forced?: boolean;
  forcedReason?: string;
  forcedBy?: string;
}

export interface TriageDeps {
  provider?: TriageProvider;
  db?: Db;
  /** Espera entre tentativas (testes usam 0). */
  retryDelayMs?: number;
}

export type TriageOutcome =
  | "suggested"
  | "skipped_idempotent"
  | "unavailable_ai_disabled"
  | "unavailable_quota"
  | "unavailable_budget"
  | "unavailable_failed"
  | "ticket_not_found";

export const currentPeriod = (d = new Date()) => d.toISOString().slice(0, 7);
export const quotaDefault = () => Number(process.env.AI_QUOTA_DEFAULT_OPS ?? 1500);
export const budgetDefaultMicros = () => BigInt(Math.round(Number(process.env.AI_GLOBAL_BUDGET_USD ?? 5) * 1_000_000));

/** Campos editáveis pelo painel de classificação. A equipe é revisada pela atribuição (RF-ATD-06). */
export const REVIEWABLE_FIELDS = ["type", "category", "reason", "priority"] as const;
export type ReviewableField = (typeof REVIEWABLE_FIELDS)[number];
export type TriageField = ReviewableField | "team";

/** Carrega o que a triagem precisa, já minimizado (RIA-09). Do contato, só o nome: serve para mascarar menções no texto e nunca é enviado. */
export async function loadTriageContext(tx: Tx, ticketId: string) {
  const found = await tx.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, organizationId: true, subject: true, description: true, channel: true, type: true, categoryId: true, reasonId: true, teamId: true, priority: true, priorityManual: true, contact: { select: { name: true } } },
  });
  if (!found) return null;
  const { contact, ...rest } = found;
  const ticket = { ...rest, contactName: contact.name };
  const [org, categories, reasons, teams] = await Promise.all([
    tx.organization.findUniqueOrThrow({ where: { id: ticket.organizationId }, select: { aiEnabled: true } }),
    tx.category.findMany({ where: { active: true }, select: { id: true, name: true, defaultPriority: true }, orderBy: { name: "asc" } }),
    tx.reason.findMany({ where: { active: true }, select: { id: true, name: true, defaultPriority: true }, orderBy: { name: "asc" } }),
    tx.team.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const taxonomy: Taxonomy = { categories: categories.map(({ id, name }) => ({ id, name })), reasons: reasons.map(({ id, name }) => ({ id, name })), teams };
  return { ticket, org, taxonomy, categories, reasons };
}

async function markUnavailable(tx: Tx, ticketId: string, organizationId: string, reason: string) {
  await tx.ticket.update({ where: { id: ticketId }, data: { triageState: "unavailable" } });
  await tx.ticketEvent.create({ data: { id: newId(), organizationId, ticketId, type: "triage.unavailable", actorType: "system", data: { reason } } });
}

/** Teto global (RF-CON-04). Retorna false se a plataforma atingiu o limite do mês. */
async function globalBudgetAvailable(db: Db): Promise<boolean> {
  const period = currentPeriod();
  // O teto definido pelo Superadmin vale para os meses seguintes (RF-CON-04); sem definição, o padrão da plataforma.
  const last = await db.platformAiBudget.findFirst({ orderBy: { period: "desc" }, select: { limitUsdMicros: true } });
  await db.platformAiBudget.createMany({ data: { period, limitUsdMicros: last?.limitUsdMicros ?? budgetDefaultMicros() }, skipDuplicates: true });
  const b = await db.platformAiBudget.findUniqueOrThrow({ where: { period } });
  return !b.trippedAt && b.spentUsdMicros < b.limitUsdMicros;
}

async function addGlobalSpend(db: Db, micros: bigint) {
  if (micros <= 0n) return;
  const period = currentPeriod();
  await db.$executeRaw`UPDATE platform_ai_budget SET spent_usd_micros = spent_usd_micros + ${micros},
    tripped_at = CASE WHEN spent_usd_micros + ${micros} >= limit_usd_micros THEN coalesce(tripped_at, now()) ELSE tripped_at END
    WHERE period = ${period}`;
}

/** Reserva atômica de uma operação da cota mensal (RF-CON-02) e alertas de 80% e 100% (RF-CON-03). */
async function reserveQuota(tx: Tx, organizationId: string): Promise<boolean> {
  const period = currentPeriod();
  const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { aiQuotaOps: true } });
  await tx.aiQuota.createMany({ data: { organizationId, period, limitOps: org.aiQuotaOps ?? quotaDefault() }, skipDuplicates: true });
  const rows = await tx.$queryRaw<{ used_ops: number; limit_ops: number; alerted_80_at: Date | null; alerted_100_at: Date | null }[]>`
    UPDATE ai_quotas SET used_ops = used_ops + 1
    WHERE organization_id = app_current_org() AND period = ${period} AND used_ops < limit_ops
    RETURNING used_ops, limit_ops, alerted_80_at, alerted_100_at`;
  const q = rows[0];
  if (!q) return false;
  const alert = async (level: 80 | 100) => {
    await tx.aiQuota.update({ where: { organizationId_period: { organizationId, period } }, data: level === 80 ? { alerted80At: new Date() } : { alerted100At: new Date() } });
    await tx.auditLog.create({ data: { id: newId(), organizationId, actorType: "system", action: `ai.quota_${level}`, details: { period, used: q.used_ops, limit: q.limit_ops } } });
    // Alerta in-app aos Administradores; o Superadmin acompanha pelo backoffice (RF-CON-03).
    const admins = await tx.membership.findMany({ where: { role: "admin", status: "active" }, select: { id: true } });
    await tx.notification.createMany({ data: admins.map((m) => ({ id: newId(), organizationId, membershipId: m.id, type: `ai.quota_${level}`, data: { period, used: q.used_ops, limit: q.limit_ops } })) });
  };
  if (q.used_ops >= q.limit_ops && !q.alerted_100_at) await alert(100);
  else if (q.used_ops >= Math.ceil(q.limit_ops * 0.8) && !q.alerted_80_at) await alert(80);
  return true;
}

interface Attempt {
  usage: ProviderUsage;
  latencyMs: number;
  outcome: "success" | "invalid_output" | "transient_error" | "permanent_error";
  cost: bigint;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Até 2 novas tentativas para erros transitórios e 1 para saída inválida (RIA-04, RIA-05). */
async function callWithRetries(provider: TriageProvider, input: ReturnType<typeof buildTriageInput>, taxonomy: Taxonomy, delayMs: number, db: Db) {
  const attempts: Attempt[] = [];
  let transientLeft = 2;
  let invalidLeft = 1;
  for (;;) {
    const started = performance.now();
    try {
      const res = await provider.generate(input, taxonomy);
      const cost = costUsdMicros(provider.model, res.usage);
      await addGlobalSpend(db, cost);
      try {
        const suggestion = parseTriageOutput(res.text, taxonomy);
        attempts.push({ usage: res.usage, latencyMs: res.latencyMs, outcome: "success", cost });
        return { suggestion, attempts };
      } catch (e) {
        if (!(e instanceof InvalidOutputError)) throw e;
        attempts.push({ usage: res.usage, latencyMs: res.latencyMs, outcome: "invalid_output", cost });
        if (invalidLeft-- <= 0) return { error: `invalid_output_${e.reason}`, attempts };
      }
    } catch (e) {
      const latencyMs = Math.round(performance.now() - started);
      const zero = { inputTokens: 0, outputTokens: 0, thoughtTokens: 0 };
      const transient = e instanceof ProviderError ? e.kind === "transient" : true;
      attempts.push({ usage: zero, latencyMs, outcome: transient ? "transient_error" : "permanent_error", cost: 0n });
      const code = e instanceof ProviderError ? e.code : "provider_exception";
      if (!transient || transientLeft-- <= 0) return { error: code, attempts };
      await sleep(delayMs * (3 - transientLeft) * (0.8 + Math.random() * 0.4));
    }
  }
}

function applySuggestion(
  ticket: NonNullable<Awaited<ReturnType<typeof loadTriageContext>>>["ticket"],
  s: TriageSuggestion,
  priority: TicketPriority,
): { data: Prisma.TicketUncheckedUpdateInput; reviews: { field: TriageField; value: string }[] } {
  // Valores definidos por pessoas prevalecem: a sugestão só preenche campos vazios.
  const data: Prisma.TicketUncheckedUpdateInput = { sentiment: s.sentiment, escalationRisk: s.escalation_risk };
  const reviews: { field: TriageField; value: string }[] = [];
  if (!ticket.type) (data.type = s.type, reviews.push({ field: "type", value: s.type }));
  if (!ticket.categoryId && s.category_id) (data.categoryId = s.category_id, reviews.push({ field: "category", value: s.category_id }));
  if (!ticket.reasonId && s.reason_id) (data.reasonId = s.reason_id, reviews.push({ field: "reason", value: s.reason_id }));
  if (!ticket.teamId && s.team_id) (data.teamId = s.team_id, reviews.push({ field: "team", value: s.team_id }));
  if (!ticket.priorityManual) (data.priority = priority, reviews.push({ field: "priority", value: priority }));
  return { data, reviews };
}

export async function runTriage(organizationId: string, payload: TriagePayload, deps: TriageDeps = {}): Promise<TriageOutcome> {
  const db = deps.db ?? getDb();
  const provider = deps.provider ?? getTriageProvider();
  const scope = { organizationId };

  const ctx = await withTenant(scope, (tx) => loadTriageContext(tx, payload.ticketId), db);
  if (!ctx) return "ticket_not_found";
  if (!ctx.org.aiEnabled) {
    await withTenant(scope, (tx) => markUnavailable(tx, ctx.ticket.id, organizationId, "ai_disabled"), db);
    return "unavailable_ai_disabled";
  }

  const input = buildTriageInput(ctx.ticket, ctx.taxonomy);
  const key = idempotencyKey(input, provider.model);
  if (!payload.forced) {
    const existing = await withTenant(scope, (tx) => tx.triageRun.findFirst({ where: { ticketId: ctx.ticket.id, idempotencyKey: key, forced: false }, select: { id: true } }), db);
    if (existing) return "skipped_idempotent";
  }
  if (!(await globalBudgetAvailable(db))) {
    await withTenant(scope, (tx) => markUnavailable(tx, ctx.ticket.id, organizationId, "global_budget"), db);
    return "unavailable_budget";
  }
  const reserved = await withTenant(scope, (tx) => reserveQuota(tx, organizationId), db);
  if (!reserved) {
    await withTenant(scope, (tx) => markUnavailable(tx, ctx.ticket.id, organizationId, "quota_exhausted"), db);
    return "unavailable_quota";
  }

  // A chamada externa acontece fora de transação: nenhuma conexão fica presa durante a rede.
  const call = await callWithRetries(provider, input, ctx.taxonomy, deps.retryDelayMs ?? 500, db);
  const runId = newId();
  const totals = call.attempts.reduce(
    (a, t) => ({ input: a.input + t.usage.inputTokens, output: a.output + t.usage.outputTokens, thoughts: a.thoughts + t.usage.thoughtTokens, latency: a.latency + t.latencyMs }),
    { input: 0, output: 0, thoughts: 0, latency: 0 },
  );

  try {
    return await withTenant(scope, async (tx) => {
      const succeeded = "suggestion" in call && call.suggestion;
      let priorityInfo: ReturnType<typeof suggestPriority> | null = null;
      if (succeeded) {
        const s = call.suggestion;
        const rule = (id: string | null, list: { id: string; defaultPriority: TicketPriority | null }[]) => list.find((x) => x.id === id)?.defaultPriority;
        priorityInfo = suggestPriority({
          organizationRules: [rule(ctx.ticket.categoryId ?? s.category_id, ctx.categories), rule(ctx.ticket.reasonId ?? s.reason_id, ctx.reasons)],
          escalationRisk: s.escalation_risk,
          urgency: s.urgency,
          sentiment: s.sentiment,
        });
      }
      await tx.triageRun.create({
        data: {
          id: runId, organizationId, ticketId: ctx.ticket.id, idempotencyKey: key, model: provider.model, promptVersion: PROMPT_VERSION,
          status: succeeded ? "succeeded" : "failed",
          result: succeeded ? ({ ...call.suggestion, suggested_priority: priorityInfo!.priority, priority_rules: priorityInfo!.rules, truncated: input.truncated } as Prisma.InputJsonValue) : Prisma.DbNull,
          errorCode: "error" in call ? call.error : null,
          forced: !!payload.forced, forcedReason: payload.forcedReason ?? null, forcedBy: payload.forcedBy ?? null,
          inputTokens: totals.input, outputTokens: totals.output, thoughtTokens: totals.thoughts, latencyMs: totals.latency,
        },
      });
      // Registro de consumo por chamada (RF-CON-01; CA-16.1)
      await tx.aiUsageEvent.createMany({
        data: call.attempts.map((a) => ({
          id: newId(), organizationId, feature: "triage", model: provider.model, triageRunId: runId,
          inputTokens: a.usage.inputTokens, outputTokens: a.usage.outputTokens, thoughtTokens: a.usage.thoughtTokens,
          costUsdMicros: a.cost, priceVersion: PRICE_VERSION, latencyMs: a.latencyMs, outcome: a.outcome,
        })),
      });
      if (!succeeded) {
        await markUnavailable(tx, ctx.ticket.id, organizationId, "error" in call ? call.error : "failed");
        return "unavailable_failed";
      }
      const { data, reviews } = applySuggestion(ctx.ticket, call.suggestion, priorityInfo!.priority);
      await tx.ticket.update({ where: { id: ctx.ticket.id }, data: { ...data, triageState: reviews.length ? "suggested" : "reviewed" } });
      if (data.priority && data.priority !== ctx.ticket.priority) await refreshSla(tx, organizationId, ctx.ticket.id);
      if (reviews.length) {
        await tx.triageReview.createMany({ data: reviews.map((r) => ({ id: newId(), organizationId, triageRunId: runId, field: r.field, suggestedValue: r.value })) });
      }
      await tx.ticketEvent.create({
        data: {
          id: newId(), organizationId, ticketId: ctx.ticket.id, type: "triage.suggested", actorType: "system",
          data: { model: provider.model, promptVersion: PROMPT_VERSION, fields: reviews.map((r) => r.field), discarded: call.suggestion.discarded, priorityRules: priorityInfo!.rules, forced: !!payload.forced },
        },
      });
      return "suggested" as const;
    }, db);
  } catch (e) {
    // Outro worker concluiu a mesma triagem (entrega pelo menos uma vez): nada a fazer.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "skipped_idempotent";
    throw e;
  }
}

export function triageJobHandler(deps: TriageDeps = {}) {
  return async (job: ClaimedJob) => {
    if (!job.organization_id) throw new Error("Job de triagem sem organização.");
    await runTriage(job.organization_id, job.payload as unknown as TriagePayload, deps);
  };
}
