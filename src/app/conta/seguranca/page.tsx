import { signOutEverywhereAction } from "@/app/actions/auth";
import { ErrorAlert, param, Success, type SearchParams } from "@/app/components";
import { requireUser } from "@/server/identity/session";
import { AccountHeader } from "@/app/ui/account-header";
import { Badge, btn, Card, PageHeader } from "@/app/ui/primitives";
import { TwoFactorSetup } from "./two-factor-setup";

export const dynamic = "force-dynamic";

export default async function SecurityPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  return (
    <div className="account">
      <AccountHeader user={user} />
      <main className="account-main">
        <div className="account-container account-narrow">
          <PageHeader back={{ href: "/app", label: "Organizações" }} title="Segurança da conta" meta={user.email} />
          <ErrorAlert code={param(sp, "motivo") ?? param(sp, "erro")} />
          <Success show={param(sp, "ok") === "1"}>Autenticação em duas etapas ativada.</Success>
          <Card title="Autenticação em duas etapas" actions={user.twoFactorEnabled ? <Badge tone="ok">Ativada</Badge> : <Badge tone="warn">Desativada</Badge>}>
            {!user.twoFactorEnabled && (
              <p className="muted">Proteja a conta com um código do aplicativo autenticador além da senha. É obrigatório para o acesso de superadmin.</p>
            )}
            {/* Mesmo componente nos dois estados: após a ativação, mantém os códigos de recuperação na tela até "Concluir". */}
            <TwoFactorSetup enabled={user.twoFactorEnabled} />
          </Card>
          <Card title="Sessões">
            <p className="muted">Encerra o acesso em todos os navegadores e dispositivos, inclusive neste.</p>
            <form action={signOutEverywhereAction}>
              <button type="submit" className={btn("danger")}>Sair de todos os dispositivos</button>
            </form>
          </Card>
        </div>
      </main>
    </div>
  );
}
