import Link from "next/link";
import { requestPasswordResetAction } from "@/app/actions/auth";
import { ErrorAlert, param, Success, type SearchParams } from "@/app/components";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  return (
    <main>
      <h1>Recuperar acesso</h1>
      <div className="card">
        <ErrorAlert code={param(sp, "erro")} />
        <Success show={param(sp, "enviado") === "1"}>
          Se houver uma conta com este e-mail, enviamos um link para redefinir a senha. O link vale por 30 minutos.
        </Success>
        <form action={requestPasswordResetAction}>
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} />
          <button type="submit">Enviar link</button>
        </form>
        <p><Link href="/entrar">Voltar para entrar</Link></p>
      </div>
    </main>
  );
}
