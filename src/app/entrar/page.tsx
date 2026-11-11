import { signInAction } from "@/app/actions/auth";
import Link from "next/link";
import { ErrorAlert, param, Success, type SearchParams } from "@/app/components";

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  return (
    <main>
      <h1>Entrar</h1>
      <div className="card">
        <ErrorAlert code={param(sp, "erro")} />
        <Success show={param(sp, "redefinida") === "1"}>Senha redefinida. Entre com a nova senha.</Success>
        <form action={signInAction}>
          <input type="hidden" name="next" value={param(sp, "next") ?? "/app"} />
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" autoComplete="username" required />
          <label htmlFor="password">Senha</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          <button type="submit">Entrar</button>
        </form>
        <p><Link href="/recuperar-senha">Esqueci minha senha</Link></p>
        <p className="muted">O acesso é feito por convite.</p>
      </div>
    </main>
  );
}
