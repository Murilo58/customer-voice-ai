import Link from "next/link";
import { signOutEverywhereAction } from "@/app/actions/auth";
import { ErrorAlert, param, Success, type SearchParams } from "@/app/components";
import { requireUser } from "@/server/identity/session";
import { TwoFactorSetup } from "./two-factor-setup";

export const dynamic = "force-dynamic";

export default async function SecurityPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  return (
    <main>
      <p><Link href="/app">← Organizações</Link></p>
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
    </main>
  );
}
