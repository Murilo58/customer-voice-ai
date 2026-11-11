import type { Prisma } from "@/generated/prisma/client";
import { newId } from "@/lib/security";
import { getDb, type Db } from "@/server/db/client";
import type { Tx } from "@/server/db/tenant";

// Outbox no PostgreSQL (ADR-006): o job é gravado na mesma transação do fato que o origina.
// Entrega pelo menos uma vez; os handlers são idempotentes. A fila gerenciada (Vercel Queues)
// será acoplada no deploy; até lá, o job é processado após a resposta (after) e pelo varredor.

export interface ClaimedJob {
  id: string;
  type: string;
  organization_id: string | null;
  payload: Prisma.JsonValue;
  attempts: number;
  max_attempts: number;
}

export type JobHandler = (job: ClaimedJob) => Promise<void>;

const LOCK_SECONDS = 120;

/** Grava o job na transação corrente. Repetição com a mesma chave não cria outro (CA-08.6). */
export async function enqueueJob(
  tx: Tx,
  job: { type: string; organizationId: string | null; payload: Record<string, unknown>; idempotencyKey: string; maxAttempts?: number; runAfter?: Date },
): Promise<string | null> {
  const id = newId();
  // Sem runAfter, vale o relógio do banco (default da coluna). Agendamentos longos (dias) toleram o relógio local.
  const r = await tx.job.createMany({
    data: {
      id, type: job.type, organizationId: job.organizationId, payload: job.payload as Prisma.InputJsonValue, idempotencyKey: job.idempotencyKey, maxAttempts: job.maxAttempts ?? 5,
      ...(job.runAfter ? { runAfter: job.runAfter } : {}),
    },
    skipDuplicates: true,
  });
  return r.count === 1 ? id : null;
}

/** Reivindica jobs prontos (ou com trava expirada) sem bloquear outros workers. */
export async function claimJobs(limit: number, db: Db = getDb(), onlyId?: string): Promise<ClaimedJob[]> {
  return db.$queryRaw<ClaimedJob[]>`
    UPDATE jobs SET status = 'running', attempts = attempts + 1,
      locked_until = now() + make_interval(secs => ${LOCK_SECONDS}), updated_at = now()
    WHERE id IN (
      SELECT id FROM jobs
      WHERE ((status = 'pending' AND run_after <= now()) OR (status = 'running' AND locked_until < now()))
        AND (${onlyId ?? null}::uuid IS NULL OR id = ${onlyId ?? null}::uuid)
      ORDER BY run_after
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, type, organization_id, payload, attempts, max_attempts`;
}

/** Espera exponencial com jitter: 30 s, 60 s, 120 s… até 30 min. */
export function backoffSeconds(attempts: number, random = Math.random): number {
  const base = Math.min(30 * 2 ** Math.max(0, attempts - 1), 1800);
  return Math.round(base * (0.8 + random() * 0.4));
}

export async function processJob(job: ClaimedJob, handlers: Record<string, JobHandler>, db: Db = getDb()): Promise<"succeeded" | "retry" | "dead"> {
  const handler = handlers[job.type];
  try {
    if (!handler) throw new Error(`Handler inexistente: ${job.type}`);
    await handler(job);
    await db.job.update({ where: { id: job.id }, data: { status: "succeeded", lockedUntil: null, lastError: null } });
    return "succeeded";
  } catch (e) {
    const message = String((e as Error)?.message ?? e).slice(0, 500);
    if (job.attempts >= job.max_attempts) {
      await db.job.update({ where: { id: job.id }, data: { status: "dead", lockedUntil: null, lastError: message } });
      console.error(`[jobs] job ${job.id} (${job.type}) esgotou as tentativas: ${message}`);
      return "dead";
    }
    await db.job.update({
      where: { id: job.id },
      data: { status: "pending", lockedUntil: null, lastError: message, runAfter: new Date(Date.now() + backoffSeconds(job.attempts) * 1000) },
    });
    return "retry";
  }
}

export async function runJobById(id: string, handlers: Record<string, JobHandler>, db: Db = getDb()) {
  const [job] = await claimJobs(1, db, id);
  return job ? processJob(job, handlers, db) : null;
}

export async function runPendingJobs(limit: number, handlers: Record<string, JobHandler>, db: Db = getDb()) {
  const jobs = await claimJobs(limit, db);
  const results = [];
  for (const job of jobs) results.push(await processJob(job, handlers, db));
  return { claimed: jobs.length, results };
}
