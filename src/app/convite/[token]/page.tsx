import Link from "next/link";
import { acceptInvitationAction } from "@/app/actions/organizations";
import { AuthLayout } from "@/app/ui/auth-layout";
import { ErrorAlert, param, type SearchParams } from "@/app/components";
import { getSessionUser } from "@/server/identity/session";
import { ROLE_LABEL } from "@/server/organizations/permissions";
import { getMemberInvitation } from "@/server/organizations/service";
import { PasswordFields } from "@/app/password-fields";

export const dynamic = "force-dynamic";

export default async function InvitationPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: SearchParams }) {
  const { token } = await params;
  const sp = await searchParams;
  const [inv, user] = await Promise.all([getMemberInvitation(token), getSessionUser()]);
  const error = param(sp, "erro") ?? (!inv ? "invitation_not_found" : inv.state !== "valid" ? `invitation_${inv.state}` : undefined);
  const action = acceptInvitationAction.bind(null, token);
  const loginHref = `/entrar?next=${encodeURIComponent(`/convite/${token}`)}`;
  return (
    <AuthLayout title="Convite para a equipe">
      <ErrorAlert code={error} />
      {inv && inv.state === "valid" && (
        <>
          <p>
            Você foi convidado para <strong>{inv.organization.name}</strong> como {ROLE_LABEL[inv.role]}. Convite para {inv.email}.
          </p>
          {user ? (
            user.email === inv.email ? (
              <form action={action}>
                <button type="submit">Aceitar convite</button>
              </form>
            ) : (
              <p>Você está conectado como {user.email}. Saia e entre com {inv.email} para aceitar.</p>
            )
          ) : (
            <>
              <p className="muted">
                Já tem conta? <Link href={loginHref}>Entre para aceitar</Link>. Caso contrário, crie sua conta:
              </p>
              <form action={action}>
                <PasswordFields />
                <button type="submit">Criar conta e aceitar</button>
              </form>
            </>
          )}
        </>
      )}
    </AuthLayout>
  );
}
