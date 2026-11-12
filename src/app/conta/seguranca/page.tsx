import Link from "next/link";
import { signOutEverywhereAction } from "@/app/actions/auth";
import { ErrorAlert, param, Success, type SearchParams } from "@/app/components";
import { requireUser } from "@/server/identity/session";
import { AccountHeader } from "@/app/ui/account-header";
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
          <Link className="back-link" href="/app">← Organizações</Link>
          <h1>Segurança da conta</h1>
          <ErrorAlert code={param(sp, "motivo") ?? param(sp, "erro")} />
          <Success show={param(sp, "ok") === "1"}>Autenticação em dois fatores ativada.</Success>
          <div className="card">
            <h2>Autenticação em dois fatores</h2>
            {user.twoFactorEnabled ? <p>Ativada.</p> : <TwoFactorSetup />}
          </div>
          <div className="card">
            <h2>Sessões</h2>
            <form action={signOutEverywhereAction}>
              <button type="submit" className="danger">Sair de todos os dispositivos</button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
