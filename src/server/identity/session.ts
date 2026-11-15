import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/server/db/client";
import { ForbiddenError } from "@/server/errors";
import { requirePermission, resolveActor, type TenantActor } from "@/server/organizations/service";
import { getAuth } from "./auth";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  twoFactorEnabled: boolean;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  // Cookies atuais da requisição: dentro de uma server action que trocou a sessão (ex.: ativação do 2FA), a
  // renderização seguinte precisa enxergar o cookie novo, e não o do cabeçalho original (sessão já excluída).
  const h = new Headers(await headers());
  const cookie = (await cookies()).toString();
  if (cookie) h.set("cookie", cookie);
  else h.delete("cookie");
  const session = await getAuth().api.getSession({ headers: h });
  if (!session) return null;
  const u = session.user as typeof session.user & { twoFactorEnabled?: boolean | null };
  return { id: u.id, name: u.name, email: u.email, twoFactorEnabled: !!u.twoFactorEnabled };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/entrar");
  return user;
}

/** Usuário + vínculo ativo validado na organização da URL. Sem vínculo: 404, sem revelar a existência. */
export async function requireActor(slug: string): Promise<{ user: SessionUser; actor: TenantActor }> {
  const user = await requireUser();
  const actor = await resolveActor(user.id, slug);
  if (!actor) notFound();
  return { user, actor };
}

/** Acesso a chamados e contatos. Negação é auditada e responde 404 (sem revelar a tela). */
export async function requireServiceActor(slug: string): Promise<{ user: SessionUser; actor: TenantActor }> {
  const ctx = await requireActor(slug);
  try {
    await requirePermission(ctx.actor, "service.access");
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  return ctx;
}

/** Superadmin com MFA obrigatório (RSG-06). */
export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  const admin = await getDb().platformAdmin.findUnique({ where: { userId: user.id } });
  if (!admin) notFound();
  if (!user.twoFactorEnabled) redirect("/conta/seguranca?motivo=mfa-obrigatorio");
  return user;
}
