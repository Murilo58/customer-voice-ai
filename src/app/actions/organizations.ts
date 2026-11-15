"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { MemberRole } from "@/generated/prisma/client";
import { normalizeEmail } from "@/lib/security";
import { recordAuthEvent } from "@/server/audit/audit";
import { getDb } from "@/server/db/client";
import { appUrl, getEmailSender } from "@/server/email/sender";
import { DomainError } from "@/server/errors";
import { getAuth } from "@/server/identity/auth";
import { getSessionUser, requireActor, requirePlatformAdmin } from "@/server/identity/session";
import {
  acceptMemberInvitation,
  changeMemberRole,
  createOrganizationFromInvitation,
  getMemberInvitation,
  getOrganizationInvitation,
  inviteMember,
  revokeMemberInvitation,
  setMemberStatus,
} from "@/server/organizations/service";
import { sendOrganizationInvitation } from "@/server/organizations/organization-invite";
import { backWithError, field } from "./helpers";

/** Cria a conta do convidado com o e-mail do convite. Posse do token comprova o e-mail. */
async function signUpInvited(email: string, form: FormData, back: string): Promise<{ id: string; email: string }> {
  const password = field(form, "password");
  if (password.length < 12 || password.length > 128) backWithError(back, new DomainError("invalid_password", ""));
  if (password !== field(form, "password_confirm")) backWithError(back, new DomainError("password_mismatch", ""));
  const name = field(form, "name").trim();
  if (name.length < 2 || name.length > 120) backWithError(back, new DomainError("invalid_name", ""));
  try {
    const r = await getAuth().api.signUpEmail({ body: { name, email, password }, headers: await headers() });
    await getDb().user.update({ where: { id: r.user.id }, data: { emailVerified: true } });
    await recordAuthEvent(getDb(), { action: "auth.signup_by_invitation", actorId: r.user.id });
    return { id: r.user.id, email: r.user.email };
  } catch (e) {
    if (e instanceof APIError) backWithError(back, new DomainError("user_exists", ""));
    backWithError(back, e);
  }
}

// ---------- Superadmin ----------

export async function createOrganizationInvitationAction(form: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  try {
    await sendOrganizationInvitation(admin.id, field(form, "email"));
  } catch (e) {
    backWithError("/admin", e);
  }
  redirect("/admin?ok=1");
}

// ---------- Criação de organização (RF-ORG-02) ----------

export async function createOrganizationAction(token: string, form: FormData): Promise<void> {
  const back = `/criar-organizacao/${encodeURIComponent(token)}`;
  const inv = await getOrganizationInvitation(token);
  if (!inv) backWithError(back, new DomainError("invitation_not_found", ""));
  if (inv.state !== "valid") backWithError(back, new DomainError(`invitation_${inv.state}`, ""));

  let user = await getSessionUser();
  if (!user) user = { ...(await signUpInvited(inv.email, form, back)), name: "", twoFactorEnabled: false };
  const slug = field(form, "slug").trim().toLowerCase();
  try {
    await createOrganizationFromInvitation({ token, userId: user.id, userEmail: user.email, name: field(form, "org_name"), slug, timezone: field(form, "timezone") || undefined });
  } catch (e) {
    backWithError(back, e);
  }
  redirect(`/o/${slug}`);
}

// ---------- Convite de colaborador (RF-ORG-04) ----------

export async function inviteMemberAction(slug: string, form: FormData): Promise<void> {
  const { actor } = await requireActor(slug);
  const back = `/o/${slug}/membros`;
  try {
    const inv = await inviteMember(actor, {
      email: field(form, "email"),
      role: field(form, "role") as MemberRole,
      teamIds: form.getAll("team_ids").filter((v): v is string => typeof v === "string"),
    });
    await getEmailSender().send({ to: inv.email, subject: "Convite para a equipe no VoxDesk AI", text: `Aceite o convite: ${appUrl(`/convite/${inv.token}`)}\nO convite expira em 7 dias.` });
  } catch (e) {
    backWithError(back, e);
  }
  redirect(`${back}?ok=convite`);
}

export async function acceptInvitationAction(token: string, form: FormData): Promise<void> {
  const back = `/convite/${encodeURIComponent(token)}`;
  const inv = await getMemberInvitation(token);
  if (!inv) backWithError(back, new DomainError("invitation_not_found", ""));
  if (inv.state !== "valid") backWithError(back, new DomainError(`invitation_${inv.state}`, ""));

  const current = await getSessionUser();
  const user = current ?? (await signUpInvited(normalizeEmail(inv.email), form, back));
  let slug: string;
  try {
    slug = (await acceptMemberInvitation({ token, userId: user.id, userEmail: user.email })).slug;
  } catch (e) {
    backWithError(back, e);
  }
  redirect(`/o/${slug}`);
}

export async function revokeInvitationAction(slug: string, invitationId: string): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await revokeMemberInvitation(actor, invitationId);
  } catch (e) {
    backWithError(`/o/${slug}/membros`, e);
  }
  redirect(`/o/${slug}/membros`);
}

// ---------- Gestão de membros (RF-ORG-05) ----------

export async function setMemberStatusAction(slug: string, membershipId: string, status: "active" | "inactive"): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await setMemberStatus(actor, membershipId, status);
  } catch (e) {
    backWithError(`/o/${slug}/membros`, e);
  }
  redirect(`/o/${slug}/membros`);
}

export async function changeRoleAction(slug: string, membershipId: string, form: FormData): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await changeMemberRole(actor, membershipId, field(form, "role") as MemberRole);
  } catch (e) {
    backWithError(`/o/${slug}/membros`, e);
  }
  redirect(`/o/${slug}/membros`);
}
