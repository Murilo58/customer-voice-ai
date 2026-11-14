import { verifyTwoFactorAction } from "@/app/actions/auth";
import { AuthLayout } from "@/app/ui/auth-layout";
import { ErrorAlert, param, type SearchParams } from "@/app/components";

export default async function TwoFactorPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  return (
    <AuthLayout title="Verificação em duas etapas" subtitle="Digite o código de 6 dígitos do seu aplicativo autenticador.">
      <ErrorAlert code={param(sp, "erro")} />
      <form action={verifyTwoFactorAction}>
        <input type="hidden" name="next" value={param(sp, "next") ?? "/app"} />
        <label htmlFor="code">Código do aplicativo autenticador</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required />
        <button type="submit">Verificar</button>
      </form>
    </AuthLayout>
  );
}
