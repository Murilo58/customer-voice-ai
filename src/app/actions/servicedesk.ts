"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { defaultJobHandlers } from "@/server/jobs/handlers";
import { runJobById, runPendingJobs } from "@/server/jobs/outbox";
import { requireActor } from "@/server/identity/session";
import { createCompany, createContact, updateContact } from "@/server/servicedesk/contacts";
import { addInternalNote, createManualTicket, updateTicketFields } from "@/server/servicedesk/tickets";
import { addPublicReply, assignTicket, assumeTicket, changeStatus, setTicketTeam } from "@/server/servicedesk/workflow";
import { filesFromForm, prepareFiles, putInQuarantine } from "@/server/attachments/service";
import { backWithError, field } from "./helpers";

export async function createCompanyAction(slug: string, form: FormData): Promise<void> {
  const { actor } = await requireActor(slug);
  let id: string;
  try {
    id = (await createCompany(actor, { name: field(form, "name"), emailDomain: field(form, "email_domain") })).id;
  } catch (e) {
    backWithError(`/o/${slug}/empresas`, e);
  }
  redirect(`/o/${slug}/empresas/${id}`);
}

export async function createContactAction(slug: string, form: FormData): Promise<void> {
  const { actor } = await requireActor(slug);
  let id: string;
  try {
    id = (await createContact(actor, { name: field(form, "name"), email: field(form, "email"), phone: field(form, "phone"), clientCompanyId: field(form, "company_id") })).id;
  } catch (e) {
    backWithError(`/o/${slug}/contatos/novo`, e);
  }
  const next = field(form, "next");
  redirect(next === "ticket" ? `/o/${slug}/chamados/novo?contato=${id}` : `/o/${slug}/contatos/${id}`);
}

export async function updateContactAction(slug: string, contactId: string, form: FormData): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await updateContact(actor, contactId, { name: field(form, "name"), email: field(form, "email"), phone: field(form, "phone"), clientCompanyId: field(form, "company_id") });
  } catch (e) {
    backWithError(`/o/${slug}/contatos/${contactId}`, e);
  }
  redirect(`/o/${slug}/contatos/${contactId}?ok=1`);
}

export async function createTicketAction(slug: string, form: FormData): Promise<void> {
  const { actor } = await requireActor(slug);
  let created: Awaited<ReturnType<typeof createManualTicket>>;
  try {
    created = await createManualTicket(actor, {
      contactId: field(form, "contact_id"),
      subject: field(form, "subject"),
      description: field(form, "description"),
      type: field(form, "type"),
      priority: field(form, "priority"),
      teamId: field(form, "team_id") || null,
    });
  } catch (e) {
    backWithError(`/o/${slug}/chamados/novo`, e);
  }
  // Triagem após a resposta; se falhar aqui, o varredor reprocessa o job pendente.
  const jobId = created.jobId;
  if (jobId) after(() => runJobById(jobId, defaultJobHandlers()).catch((e) => console.error("[triage] after", e)));
  redirect(`/o/${slug}/chamados/${created.number}`);
}

/** Anexos do formulário: validados e gravados em quarantine/ antes da transação da mensagem (ADR-008). */
async function formFiles(organizationId: string, form: FormData) {
  const files = prepareFiles(await filesFromForm(form));
  await putInQuarantine(organizationId, files);
  return files;
}

export async function addNoteAction(slug: string, ticketId: string, number: number, form: FormData): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await addInternalNote(actor, ticketId, field(form, "body"), { files: await formFiles(actor.organizationId, form) });
  } catch (e) {
    backWithError(`/o/${slug}/chamados/${number}`, e);
  }
  after(() => runPendingJobs(5, defaultJobHandlers()).catch((e) => console.error("[jobs] after", e)));
  redirect(`/o/${slug}/chamados/${number}`);
}

export async function updateTicketFieldsAction(slug: string, ticketId: string, number: number, form: FormData): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await updateTicketFields(actor, ticketId, { type: field(form, "type"), priority: field(form, "priority") });
  } catch (e) {
    backWithError(`/o/${slug}/chamados/${number}`, e);
  }
  redirect(`/o/${slug}/chamados/${number}`);
}

// ---------- Fluxo do atendimento (I-3) ----------

const ticketPath = (slug: string, number: number) => `/o/${slug}/chamados/${number}`;

/** Executa a ação e processa os jobs gerados (e-mail) após a resposta; o varredor cobre falhas. */
async function ticketAction(slug: string, number: number, fn: (actor: Awaited<ReturnType<typeof requireActor>>["actor"]) => Promise<unknown>) {
  const { actor } = await requireActor(slug);
  try {
    await fn(actor);
  } catch (e) {
    backWithError(ticketPath(slug, number), e);
  }
  after(() => runPendingJobs(5, defaultJobHandlers()).catch((e) => console.error("[jobs] after", e)));
  redirect(ticketPath(slug, number));
}

export async function changeStatusAction(slug: string, ticketId: string, number: number, form: FormData): Promise<void> {
  await ticketAction(slug, number, (actor) => changeStatus(actor, ticketId, field(form, "status"), { reason: field(form, "reason") }));
}

export async function assumeTicketAction(slug: string, ticketId: string, number: number): Promise<void> {
  await ticketAction(slug, number, (actor) => assumeTicket(actor, ticketId));
}

export async function assignTicketAction(slug: string, ticketId: string, number: number, form: FormData): Promise<void> {
  await ticketAction(slug, number, (actor) => assignTicket(actor, ticketId, field(form, "membership_id") || null));
}

export async function setTicketTeamAction(slug: string, ticketId: string, number: number, form: FormData): Promise<void> {
  await ticketAction(slug, number, (actor) => setTicketTeam(actor, ticketId, field(form, "team_id") || null));
}

export async function publicReplyAction(slug: string, ticketId: string, number: number, form: FormData): Promise<void> {
  await ticketAction(slug, number, async (actor) => addPublicReply(actor, ticketId, field(form, "body"), { files: await formFiles(actor.organizationId, form) }));
}
