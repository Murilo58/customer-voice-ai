import { TRIAGE_JOB, triageJobHandler } from "@/server/ai/triage";
import { EMAIL_JOB, emailJobHandler } from "@/server/email/outbound";
import { AUTOCLOSE_JOB, autoCloseJobHandler } from "@/server/servicedesk/workflow";
import { SLA_JOB, slaJobHandler } from "@/server/sla/service";
import type { JobHandler } from "./outbox";

/** Registro dos handlers da outbox (varredor, after() e worker local). */
export const defaultJobHandlers = (): Record<string, JobHandler> => ({
  [TRIAGE_JOB]: triageJobHandler(),
  [EMAIL_JOB]: emailJobHandler(),
  [AUTOCLOSE_JOB]: autoCloseJobHandler(),
  [SLA_JOB]: slaJobHandler(),
});
