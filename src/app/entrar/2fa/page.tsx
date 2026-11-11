import { verifyTwoFactorAction } from "@/app/actions/auth";
import { ErrorAlert, param, type SearchParams } from "@/app/components";

export default async function TwoFactorPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  return (
    <main>
      <h1>Verificação em duas etapas</h1>
      <div className="card">
        <ErrorAlert code={param(sp, "erro")} />
        <form action={verifyTwoFactorAction}>
          <input type="hidden" name="next" value={param(sp, "next") ?? "/app"} />
          <label htmlFor="code">Código do aplicativo autenticador</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required />
          <button type="submit">Verificar</button>
        </form>
      </div>
    </main>
  );
}
