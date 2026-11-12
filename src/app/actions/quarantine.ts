"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { decideQuarantine } from "@/server/email/quarantine";
import { requireActor } from "@/server/identity/session";
import { defaultJobHandlers } from "@/server/jobs/handlers";
import { runPendingJobs } from "@/server/jobs/outbox";
import { backWithError, field } from "./helpers";

// Decisão na quarentena (RF-EML-08; CA-06.9): justificativa obrigatória, auditada.
export async function decideQuarantineAction(slug: string, id: string, form: FormData): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await decideQuarantine(actor, id, { action: field(form, "action"), justification: field(form, "justification"), ticketNumber: Number(field(form, "ticket_number")) || null });
  } catch (e) {
    backWithError(`/o/${slug}/quarentena/${id}`, e);
  }
  after(() => runPendingJobs(5, defaultJobHandlers()).catch((e) => console.error("[jobs] after", e)));
  redirect(`/o/${slug}/quarentena?ok=1`);
}
