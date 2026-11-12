import { TRIAGE_JOB, triageJobHandler } from "@/server/ai/triage";
import { SANITIZE_JOB, sanitizeJobHandler } from "@/server/attachments/service";
import { INBOUND_JOB, inboundJobHandler, RECONCILE_JOB, reconcileJobHandler, scheduleReconcile } from "@/server/email/inbound/process";
import { EMAIL_JOB, emailJobHandler } from "@/server/email/outbound";
import { pruneRateLimits } from "@/server/security/rate-limit";
import { AUTOCLOSE_JOB, autoCloseJobHandler } from "@/server/servicedesk/workflow";
import { SLA_JOB, slaJobHandler } from "@/server/sla/service";
import type { JobHandler } from "./outbox";

/** Registro dos handlers da outbox (varredor, after() e worker local). */
export const defaultJobHandlers = (): Record<string, JobHandler> => ({
  [TRIAGE_JOB]: triageJobHandler(),
  [EMAIL_JOB]: emailJobHandler(),
  [AUTOCLOSE_JOB]: autoCloseJobHandler(),
  [SLA_JOB]: slaJobHandler(),
  [SANITIZE_JOB]: sanitizeJobHandler(),
  [INBOUND_JOB]: inboundJobHandler(),
  [RECONCILE_JOB]: reconcileJobHandler(),
});

/** Tarefas periódicas do varredor: reconciliação do recebimento (a cada 10 min) e limpeza de contadores. */
export async function scheduleMaintenance(): Promise<void> {
  await scheduleReconcile().catch((e) => console.error("[jobs] reconciliação", e));
  if (Math.random() < 0.05) await pruneRateLimits().catch((e) => console.error("[jobs] limpeza de limites", e));
}
