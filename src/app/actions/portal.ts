"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { filesFromForm } from "@/server/attachments/service";
import { defaultJobHandlers } from "@/server/jobs/handlers";
import { runJobById, runPendingJobs } from "@/server/jobs/outbox";
import {
  consumeMagicLink, getPortalSession, logoutPortal, PORTAL_COOKIE, portalReply, requestMagicLink, submitCsat, submitPortalTicket,
} from "@/server/portal/service";
import { clientIp } from "@/server/security/tokens";
import { backWithError, field } from "./helpers";

// Ações do portal público (RF-POR-01 a 05). Sem sessão da equipe: a identidade é a sessão do portal.

const base = (slug: string) => `/p/${slug}`;

function runAfter(jobIds: (string | null | undefined)[]) {
  const ids = jobIds.filter((v): v is string => !!v);
  if (ids.length) after(async () => {
    for (const id of ids) await runJobById(id, defaultJobHandlers()).catch((e) => console.error("[portal] after", e));
  });
}

async function session(slug: string) {
  const s = await getPortalSession(slug, (await cookies()).get(PORTAL_COOKIE)?.value);
  if (!s) redirect(`${base(slug)}/entrar?erro=magic_link_invalid`);
  return s;
}

export async function submitPortalTicketAction(slug: string, form: FormData): Promise<void> {
  let protocol: string;
  try {
    const r = await submitPortalTicket(slug, {
      name: field(form, "name"), email: field(form, "email"), subject: field(form, "subject"), description: field(form, "description"),
      botToken: field(form, "cf-turnstile-response"), ip: clientIp(await headers()), files: await filesFromForm(form),
    });
    protocol = r.protocol;
    runAfter(r.jobIds);
    after(() => runPendingJobs(10, defaultJobHandlers()).catch((e) => console.error("[portal] after", e)));
  } catch (e) {
    backWithError(base(slug), e);
  }
  redirect(`${base(slug)}?protocolo=${encodeURIComponent(protocol)}`);
}

export async function requestMagicLinkAction(slug: string, form: FormData): Promise<void> {
  try {
    const r = await requestMagicLink(slug, { email: field(form, "email"), botToken: field(form, "cf-turnstile-response"), ip: clientIp(await headers()) });
    runAfter([r.jobId]);
  } catch (e) {
    backWithError(`${base(slug)}/entrar`, e);
  }
  redirect(`${base(slug)}/entrar?enviado=1`);
}

/** Confirmação por botão (POST): leitores de link em e-mails não consomem o acesso de uso único. */
export async function consumeMagicLinkAction(slug: string, token: string): Promise<void> {
  try {
    const s = await consumeMagicLink(slug, token);
    (await cookies()).set(PORTAL_COOKIE, s.sessionToken, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: base(slug), expires: s.expiresAt,
    });
  } catch (e) {
    backWithError(`${base(slug)}/entrar`, e);
  }
  redirect(`${base(slug)}/chamados`);
}

export async function logoutPortalAction(slug: string): Promise<void> {
  const s = await getPortalSession(slug, (await cookies()).get(PORTAL_COOKIE)?.value);
  if (s) await logoutPortal(s);
  (await cookies()).delete({ name: PORTAL_COOKIE, path: base(slug) });
  redirect(base(slug));
}

export async function portalReplyAction(slug: string, number: number, form: FormData): Promise<void> {
  const s = await session(slug);
  const path = `${base(slug)}/chamados/${number}`;
  let next = path;
  try {
    const r = await portalReply(s, number, { text: field(form, "body"), files: await filesFromForm(form) });
    if (r.createdTicket && r.number) next = `${base(slug)}/chamados/${r.number}?continuacao=1`;
    runAfter([r.jobId]);
    after(() => runPendingJobs(10, defaultJobHandlers()).catch((e) => console.error("[portal] after", e)));
  } catch (e) {
    backWithError(path, e);
  }
  redirect(next);
}

export async function portalCsatAction(slug: string, number: number, ticketId: string, resolutionSeq: number, form: FormData): Promise<void> {
  const s = await session(slug);
  const path = `${base(slug)}/chamados/${number}`;
  try {
    await submitCsat(slug, { ticketId, resolutionSeq, score: Number(field(form, "score")), comment: field(form, "comment") }, { session: s });
  } catch (e) {
    backWithError(path, e);
  }
  redirect(`${path}?avaliado=1`);
}

export async function linkCsatAction(slug: string, ticketId: string, resolutionSeq: number, signature: string, form: FormData): Promise<void> {
  const path = `${base(slug)}/avaliar?t=${ticketId}&r=${resolutionSeq}&s=${signature}`;
  try {
    await submitCsat(slug, { ticketId, resolutionSeq, score: Number(field(form, "score")), comment: field(form, "comment") }, { signature });
  } catch (e) {
    backWithError(path, e);
  }
  redirect(`${path}&avaliado=1`);
}
