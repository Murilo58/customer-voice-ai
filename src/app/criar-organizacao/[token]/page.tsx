import Link from "next/link";
import { createOrganizationAction } from "@/app/actions/organizations";
import { AuthLayout } from "@/app/ui/auth-layout";
import { ErrorAlert, param, type SearchParams } from "@/app/components";
import { PasswordFields } from "@/app/password-fields";
import { getSessionUser } from "@/server/identity/session";
import { getOrganizationInvitation } from "@/server/organizations/service";

export const dynamic = "force-dynamic";

const TIMEZONES = ["America/Sao_Paulo", "America/Manaus", "America/Belem", "America/Fortaleza", "America/Recife", "America/Cuiaba", "America/Rio_Branco", "America/Noronha"];

export default async function CreateOrganizationPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: SearchParams }) {
  const { token } = await params;
  const sp = await searchParams;
  const [inv, user] = await Promise.all([getOrganizationInvitation(token), getSessionUser()]);
  const error = param(sp, "erro") ?? (!inv ? "invitation_not_found" : inv.state !== "valid" ? `invitation_${inv.state}` : undefined);
  const loginHref = `/entrar?next=${encodeURIComponent(`/criar-organizacao/${token}`)}`;
  return (
    <AuthLayout title="Criar organização">
      <ErrorAlert code={error} />
      {inv && inv.state === "valid" &&
        (user && user.email !== inv.email ? (
          <p>Você está conectado como {user.email}. Saia e use {inv.email} para criar a organização.</p>
        ) : (
          <form action={createOrganizationAction.bind(null, token)}>
            <p>Convite para {inv.email}.</p>
            {!user && (
              <>
                <p className="muted">
                  Já tem conta? <Link href={loginHref}>Entre primeiro</Link>.
                </p>
                <PasswordFields />
              </>
            )}
            <label htmlFor="org_name">Nome da organização</label>
            <input id="org_name" name="org_name" required minLength={2} maxLength={120} />
            <label htmlFor="slug">Identificador (usado no endereço)</label>
            <input id="slug" name="slug" required pattern="[a-z0-9][a-z0-9\-]{1,46}[a-z0-9]" placeholder="minha-empresa" />
            <label htmlFor="timezone">Fuso horário</label>
            <select id="timezone" name="timezone" defaultValue="America/Sao_Paulo">
              {TIMEZONES.map((tz) => (
                <option key={tz}>{tz}</option>
              ))}
            </select>
            <button type="submit">Criar organização</button>
          </form>
        ))}
    </AuthLayout>
  );
}
