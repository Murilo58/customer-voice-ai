"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { normalizeEmail } from "@/lib/security";
import { recordAuthEvent } from "@/server/audit/audit";
import { getDb } from "@/server/db/client";
import { getAuth } from "@/server/identity/auth";
import { requireUser } from "@/server/identity/session";
import { DomainError } from "@/server/errors";
import { backWithError, field } from "./helpers";

function safeNext(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/app";
}

export async function signInAction(form: FormData): Promise<void> {
  const email = normalizeEmail(field(form, "email"));
  const next = safeNext(field(form, "next") || "/app");
  let result: Awaited<ReturnType<ReturnType<typeof getAuth>["api"]["signInEmail"]>>;
  try {
    result = await getAuth().api.signInEmail({ body: { email, password: field(form, "password") }, headers: await headers() });
  } catch (e) {
    if (e instanceof APIError) {
      await recordAuthEvent(getDb(), { action: "auth.login_failed", details: { email } });
      backWithError(`/entrar?next=${encodeURIComponent(next)}`, new DomainError("invalid_credentials", ""));
    }
    backWithError("/entrar", e);
  }
  if ("twoFactorRedirect" in result && result.twoFactorRedirect) {
    redirect(`/entrar/2fa?next=${encodeURIComponent(next)}`);
  }
  if ("user" in result && result.user) await recordAuthEvent(getDb(), { action: "auth.login", actorId: result.user.id });
  redirect(next);
}

export async function verifyTwoFactorAction(form: FormData): Promise<void> {
  const next = safeNext(field(form, "next") || "/app");
  try {
    const r = await getAuth().api.verifyTOTP({ body: { code: field(form, "code").replace(/\s/g, "") }, headers: await headers() });
    await recordAuthEvent(getDb(), { action: "auth.login", actorId: r.user.id, details: { mfa: true } });
  } catch (e) {
    if (e instanceof APIError) {
      await recordAuthEvent(getDb(), { action: "auth.mfa_failed" });
      backWithError(`/entrar/2fa?next=${encodeURIComponent(next)}`, new DomainError("invalid_code", ""));
    }
    backWithError("/entrar/2fa", e);
  }
  redirect(next);
}

export async function signOutAction(): Promise<void> {
  const user = await requireUser();
  await getAuth().api.signOut({ headers: await headers() });
  await recordAuthEvent(getDb(), { action: "auth.logout", actorId: user.id });
  redirect("/entrar");
}

/** Logout em todos os dispositivos (RF-ORG-03; CA-02.3). */
export async function signOutEverywhereAction(): Promise<void> {
  const user = await requireUser();
  await getAuth().api.revokeSessions({ headers: await headers() });
  await recordAuthEvent(getDb(), { action: "auth.logout_all", actorId: user.id });
  redirect("/entrar");
}

export interface TwoFactorSetupState {
  totpURI?: string;
  backupCodes?: string[];
  error?: string;
}

/** Devolve o URI TOTP pelo estado do formulário: o segredo nunca vai para a URL nem para logs. */
export async function enableTwoFactorAction(_prev: TwoFactorSetupState, form: FormData): Promise<TwoFactorSetupState> {
  const user = await requireUser();
  try {
    const r = await getAuth().api.enableTwoFactor({ body: { password: field(form, "password") }, headers: await headers() });
    if (r.method !== "totp") return { error: "unexpected" };
    await recordAuthEvent(getDb(), { action: "auth.mfa_setup_started", actorId: user.id });
    return { totpURI: r.totpURI, backupCodes: r.backupCodes };
  } catch (e) {
    if (e instanceof APIError) return { error: "invalid_credentials" };
    console.error("[action] enableTwoFactor", e);
    return { error: "unexpected" };
  }
}

export async function confirmTwoFactorAction(form: FormData): Promise<void> {
  const user = await requireUser();
  try {
    await getAuth().api.verifyTOTP({ body: { code: field(form, "code").replace(/\s/g, "") }, headers: await headers() });
  } catch (e) {
    if (e instanceof APIError) backWithError("/conta/seguranca", new DomainError("invalid_code", ""));
    backWithError("/conta/seguranca", e);
  }
  await recordAuthEvent(getDb(), { action: "auth.mfa_enabled", actorId: user.id });
  redirect("/conta/seguranca?ok=1");
}

// ---------- Recuperação de acesso (RF-ORG-03) ----------

/** Resposta sempre igual, exista ou não a conta (sem enumeração de e-mails). */
export async function requestPasswordResetAction(form: FormData): Promise<void> {
  const email = normalizeEmail(field(form, "email"));
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 254) {
    try {
      await getAuth().api.requestPasswordReset({ body: { email }, headers: await headers() });
    } catch (e) {
      if (!(e instanceof APIError)) console.error("[auth] reset", e);
    }
  }
  redirect("/recuperar-senha?enviado=1");
}

export async function resetPasswordAction(form: FormData): Promise<void> {
  const token = field(form, "token");
  const password = field(form, "password");
  const back = `/redefinir-senha?token=${encodeURIComponent(token)}`;
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(token)) backWithError("/recuperar-senha", new DomainError("invalid_reset_token", ""));
  if (password !== field(form, "confirm")) backWithError(back, new DomainError("password_mismatch", ""));
  if (password.length < 12 || password.length > 128) backWithError(back, new DomainError("weak_password", ""));
  try {
    await getAuth().api.resetPassword({ body: { newPassword: password, token }, headers: await headers() });
  } catch (e) {
    if (e instanceof APIError) backWithError("/recuperar-senha", new DomainError("invalid_reset_token", ""));
    backWithError(back, e);
  }
  redirect("/entrar?redefinida=1");
}
