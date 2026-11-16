import Link from "next/link";
import { verifyRecoveryCodeAction, verifyTwoFactorAction } from "@/app/actions/auth";
import { AuthLayout } from "@/app/ui/auth-layout";
import { ErrorAlert, param, type SearchParams } from "@/app/components";

export default async function TwoFactorPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const next = param(sp, "next") ?? "/app";
  const recovery = param(sp, "modo") === "recuperacao";
  const href = (mode?: string) => `/entrar/2fa?${new URLSearchParams({ ...(mode ? { modo: mode } : {}), next })}`;

  if (recovery) {
    return (
      <AuthLayout title="Verificação em duas etapas" subtitle="Digite um dos códigos de recuperação que você guardou ao ativar a verificação.">
        <ErrorAlert code={param(sp, "erro")} />
        <form action={verifyRecoveryCodeAction}>
          <input type="hidden" name="next" value={next} />
          <label htmlFor="code">Código de recuperação</label>
          <input id="code" name="code" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="XXXXX-XXXXX" maxLength={13} required />
          <p className="field-hint">Cada código vale uma única vez. Depois de entrar, guarde os códigos restantes em local seguro.</p>
          <button type="submit">Verificar</button>
        </form>
        <p className="auth-note">
          <Link href={href()}>Usar o código do aplicativo autenticador</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Verificação em duas etapas" subtitle="Digite o código de 6 dígitos do seu aplicativo autenticador.">
      <ErrorAlert code={param(sp, "erro")} />
      <form action={verifyTwoFactorAction}>
        <input type="hidden" name="next" value={next} />
        <label htmlFor="code">Código do aplicativo autenticador</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required />
        <button type="submit">Verificar</button>
      </form>
      <p className="auth-note">
        <Link href={href("recuperacao")}>Perdeu o acesso ao aplicativo? Usar um código de recuperação</Link>
      </p>
    </AuthLayout>
  );
}
