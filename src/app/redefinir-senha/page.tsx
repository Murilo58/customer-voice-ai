import type { Metadata } from "next";
import Link from "next/link";
import { resetPasswordAction } from "@/app/actions/auth";
import { ErrorAlert, param, type SearchParams } from "@/app/components";

// O token está na URL: sem Referer para evitar vazamento a terceiros.
export const metadata: Metadata = { referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const token = param(sp, "token") ?? "";
  return (
    <main>
      <h1>Definir nova senha</h1>
      <div className="card">
        <ErrorAlert code={param(sp, "erro")} />
        {token ? (
          <form action={resetPasswordAction}>
            <input type="hidden" name="token" value={token} />
            <label htmlFor="password">Nova senha (mínimo 12 caracteres)</label>
            <input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
            <label htmlFor="confirm">Confirme a nova senha</label>
            <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
            <button type="submit">Salvar nova senha</button>
            <p className="muted">Ao salvar, todas as sessões abertas são encerradas.</p>
          </form>
        ) : (
          <p>Link inválido. <Link href="/recuperar-senha">Solicite um novo</Link>.</p>
        )}
      </div>
    </main>
  );
}
