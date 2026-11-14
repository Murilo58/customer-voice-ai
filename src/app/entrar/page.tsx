import { signInAction } from "@/app/actions/auth";
import Link from "next/link";
import { ErrorAlert, param, Success, type SearchParams } from "@/app/components";
import { AuthLayout } from "@/app/ui/auth-layout";
import { PasswordInput } from "@/app/ui/password-input";

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  return (
    <AuthLayout title="Entrar" subtitle="Acesse a central de atendimento da sua organização.">
      <ErrorAlert code={param(sp, "erro")} />
      <Success show={param(sp, "redefinida") === "1"}>Senha redefinida. Entre com a nova senha.</Success>
      <form action={signInAction}>
        <input type="hidden" name="next" value={param(sp, "next") ?? "/app"} />
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
        <div className="label-row">
          <label htmlFor="password">Senha</label>
          <Link href="/recuperar-senha">Esqueci minha senha</Link>
        </div>
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
        <button type="submit">Entrar</button>
      </form>
      <p className="auth-note">O acesso é feito por convite. Se você ainda não recebeu o seu, fale com o administrador da sua organização.</p>
    </AuthLayout>
  );
}
