"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { defaultJobHandlers } from "@/server/jobs/handlers";
import type { ReviewableField } from "@/server/ai/triage";
import { requireActor } from "@/server/identity/session";
import { runPendingJobs } from "@/server/jobs/outbox";
import { DomainError, ForbiddenError } from "@/server/errors";
import { applySuggestedTaxonomy, createTaxonomyItem, setAiEnabled, updateTaxonomyItem, type TaxonomyKind } from "@/server/servicedesk/taxonomy";
import { confirmAllSuggestions, requestReprocess, setClassificationField } from "@/server/servicedesk/triage-review";
import { backWithError, field } from "./helpers";
import { messageFor } from "@/lib/messages";
import { suggestReply } from "@/server/ai/reply-suggestion";

export type SuggestReplyResult = { ok: true; text: string } | { ok: false; message: string };

/**
 * Sugestão de resposta com IA (só o id do chamado vem do navegador). Devolve o texto para o editor:
 * não envia nem grava mensagem. Falhas viram mensagem amigável, sem detalhes internos.
 */
export async function suggestReplyAction(slug: string, ticketId: string): Promise<SuggestReplyResult> {
  const { actor } = await requireActor(slug);
  try {
    const { text } = await suggestReply(actor, ticketId);
    return { ok: true, text };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, message: messageFor(e.code)! };
    if (e instanceof ForbiddenError) return { ok: false, message: "Você não tem permissão para esta ação." };
    console.error("suggestReplyAction falhou", e instanceof Error ? e.name : "erro");
    return { ok: false, message: messageFor("ai_reply_failed")! };
  }
}

const ticketPath = (slug: string, number: number) => `/o/${slug}/chamados/${number}`;

export async function confirmAllAction(slug: string, ticketId: string, number: number): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await confirmAllSuggestions(actor, ticketId);
  } catch (e) {
    backWithError(ticketPath(slug, number), e);
  }
  redirect(ticketPath(slug, number));
}

export async function setFieldAction(slug: string, ticketId: string, number: number, fieldName: ReviewableField, form: FormData): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await setClassificationField(actor, ticketId, fieldName, field(form, "value"));
  } catch (e) {
    backWithError(ticketPath(slug, number), e);
  }
  redirect(ticketPath(slug, number));
}

export async function reprocessAction(slug: string, ticketId: string, number: number, form: FormData): Promise<void> {
  const { actor } = await requireActor(slug);
  let result: "enqueued" | "unchanged";
  try {
    result = await requestReprocess(actor, ticketId, { force: field(form, "force") === "1", reason: field(form, "reason") });
  } catch (e) {
    backWithError(ticketPath(slug, number), e);
  }
  if (result === "unchanged") backWithError(ticketPath(slug, number), new DomainError("reprocess_unchanged", ""));
  after(() => runPendingJobs(5, defaultJobHandlers()).catch((e) => console.error("[triage] reprocess", e)));
  redirect(ticketPath(slug, number));
}

// ---------- Configurações (Administrador) ----------

const settingsPath = (slug: string) => `/o/${slug}/configuracoes`;

export async function toggleAiAction(slug: string, enabled: boolean): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await setAiEnabled(actor, enabled);
  } catch (e) {
    backWithError(settingsPath(slug), e);
  }
  redirect(settingsPath(slug));
}

export async function createTaxonomyAction(slug: string, kind: TaxonomyKind, form: FormData): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await createTaxonomyItem(actor, kind, { name: field(form, "name"), defaultPriority: field(form, "default_priority") });
  } catch (e) {
    backWithError(settingsPath(slug), e);
  }
  redirect(settingsPath(slug));
}

export async function updateTaxonomyAction(slug: string, kind: TaxonomyKind, id: string, form: FormData): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await updateTaxonomyItem(actor, kind, id, { name: field(form, "name"), defaultPriority: field(form, "default_priority") });
  } catch (e) {
    backWithError(settingsPath(slug), e);
  }
  redirect(settingsPath(slug));
}

export async function setTaxonomyActiveAction(slug: string, kind: TaxonomyKind, id: string, active: boolean): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await updateTaxonomyItem(actor, kind, id, { active });
  } catch (e) {
    backWithError(settingsPath(slug), e);
  }
  redirect(settingsPath(slug));
}

export async function applySuggestedTaxonomyAction(slug: string): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await applySuggestedTaxonomy(actor);
  } catch (e) {
    backWithError(settingsPath(slug), e);
  }
  redirect(settingsPath(slug));
}
