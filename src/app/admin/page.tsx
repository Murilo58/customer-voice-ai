import { createOrganizationInvitationAction } from "@/app/actions/organizations";
import { ErrorAlert, param, Success, type SearchParams } from "@/app/components";
import { setGlobalBudgetAction, setOrganizationQuotaAction, setOrganizationStatusAction } from "@/app/actions/sla";
import { requirePlatformAdmin } from "@/server/identity/session";
import { listPlatformOrganizations } from "@/server/platform/backoffice";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await requirePlatformAdmin();
  const sp = await searchParams;
  const data = await listPlatformOrganizations(admin.id);
  return (
    <main>
      <h1>Superadmin</h1>
      <ErrorAlert code={param(sp, "erro")} />
      <Success show={param(sp, "ok") === "1"}>Convite de organização criado e enviado.</Success>
      <div className="card">
        <h2>Convidar organização para o beta (RF-ORG-01)</h2>
        <form action={createOrganizationInvitationAction}>
          <label htmlFor="email">E-mail do responsável</label>
          <input id="email" name="email" type="email" required />
          <button type="submit">Criar convite (validade de 7 dias)</button>
        </form>
      </div>
      <div className="card">
        <h2>Teto global de IA · {data.period} (RF-CON-04)</h2>
        <p>
          Gasto: US$ {data.budget.spentUsd.toFixed(4)} de US$ {data.budget.limitUsd.toFixed(2)}
          {data.budget.tripped && <> · <strong>teto atingido: triagem suspensa em todas as organizações</strong></>}
        </p>
        <form action={setGlobalBudgetAction}>
          <label htmlFor="limit">Novo teto mensal (US$)</label>
          <input id="limit" name="limit" type="number" min={0} step="0.01" defaultValue={data.budget.limitUsd} required />
          <button type="submit">Salvar teto</button>
        </form>
      </div>
      <div className="card">
        {/* RF-ORG-09: sem acesso a conteúdo de chamados (CA-16.4) */}
        <h2>Organizações (RF-ORG-09)</h2>
        <table>
          <thead><tr><th>Organização</th><th>Situação</th><th>IA no mês</th><th>Cota mensal (RF-CON-02)</th></tr></thead>
          <tbody>
            {data.organizations.map((o) => (
              <tr key={o.id}>
                <td>{o.name}<br /><span className="muted">{o.slug} · criada em {o.createdAt.toLocaleDateString("pt-BR")}</span></td>
                <td>
                  {o.status === "active" ? "Ativa" : <strong>Suspensa</strong>}{" "}
                  <form action={setOrganizationStatusAction.bind(null, o.id, o.status === "active" ? "suspended" : "active")} className="inline">
                    <button type="submit" className="link">{o.status === "active" ? "suspender" : "reativar"}</button>
                  </form>
                </td>
                <td>{o.aiEnabled ? "ativada" : "desativada"} · {o.usage.calls} chamadas · {o.usage.tokens} tokens · US$ {o.usage.costUsd.toFixed(4)}</td>
                <td>
                  {o.quota.used} de {o.quota.limit} ({o.quota.limit ? Math.round((o.quota.used / o.quota.limit) * 100) : 100}%)
                  <form action={setOrganizationQuotaAction.bind(null, o.id)}>
                    <input name="limit" type="number" min={0} max={1000000} defaultValue={o.quota.limit} aria-label="Cota mensal" className="input-sm" />{" "}
                    <button type="submit" className="link">salvar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
