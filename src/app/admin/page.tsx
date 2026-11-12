import { createOrganizationInvitationAction } from "@/app/actions/organizations";
import { ErrorAlert, param, Success, type SearchParams } from "@/app/components";
import { setGlobalBudgetAction, setOrganizationQuotaAction, setOrganizationStatusAction } from "@/app/actions/sla";
import { AccountHeader } from "@/app/ui/account-header";
import { Badge, btn, Card, Field, PageHeader, TableCard } from "@/app/ui/primitives";
import { requirePlatformAdmin } from "@/server/identity/session";
import { listPlatformOrganizations } from "@/server/platform/backoffice";

export const dynamic = "force-dynamic";

const day = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await requirePlatformAdmin();
  const sp = await searchParams;
  const data = await listPlatformOrganizations(admin.id);
  const budgetPct = data.budget.limitUsd ? Math.min(100, Math.round((data.budget.spentUsd / data.budget.limitUsd) * 100)) : 100;
  return (
    <div className="account">
      <AccountHeader user={admin} />
      <main className="account-main">
        <div className="account-container">
          <PageHeader title="Superadmin" meta="Backoffice da plataforma. Sem acesso ao conteúdo dos chamados (CA-16.4)." />
          <ErrorAlert code={param(sp, "erro")} />
          <Success show={param(sp, "ok") === "1"}>Convite de organização criado e enviado.</Success>
          <div className="settings-grid">
            <Card title="Convidar organização para o beta" actions={<span className="muted">RF-ORG-01</span>}>
              <form action={createOrganizationInvitationAction} className="form-stack">
                <Field id="email" label="E-mail do responsável" hint="O convite vale por 7 dias.">
                  <input id="email" name="email" type="email" required aria-describedby="email-hint" />
                </Field>
                <div className="form-actions"><button type="submit" className="btn btn-primary">Criar convite</button></div>
              </form>
            </Card>
            <Card title={`Teto global de IA · ${data.period}`} actions={<span className="muted">RF-CON-04</span>}>
              <div className="panel-row"><span>Gasto no mês</span><strong>US$ {data.budget.spentUsd.toFixed(4)} de US$ {data.budget.limitUsd.toFixed(2)}</strong></div>
              <div className={`progress${data.budget.tripped || budgetPct >= 90 ? " progress-warn" : ""}`} role="progressbar" aria-label="Teto global de IA consumido" aria-valuemin={0} aria-valuemax={100} aria-valuenow={budgetPct}>
                <span style={{ width: `${budgetPct}%` }} />
              </div>
              {data.budget.tripped && <p className="alert" role="status">Teto atingido: triagem suspensa em todas as organizações.</p>}
              <form action={setGlobalBudgetAction}>
                <label htmlFor="limit">Novo teto mensal (US$)</label>
                <div className="inline-form">
                  <input id="limit" name="limit" type="number" min={0} step="0.01" defaultValue={data.budget.limitUsd} required />
                  <button type="submit" className={btn("secondary", "sm")}>Salvar teto</button>
                </div>
              </form>
            </Card>
          </div>
          {/* RF-ORG-09: sem acesso a conteúdo de chamados (CA-16.4) */}
          <TableCard title={`Organizações (${data.organizations.length})`} label="Organizações da plataforma (rolável)" actions={<span className="muted">RF-ORG-09</span>}>
            <thead><tr><th scope="col">Organização</th><th scope="col">Situação</th><th scope="col">IA no mês</th><th scope="col">Cota mensal (RF-CON-02)</th></tr></thead>
            <tbody>
              {data.organizations.map((o) => (
                <tr key={o.id}>
                  <td><span className="t-person"><strong>{o.name}</strong><span className="muted">{o.slug} · criada em {day.format(o.createdAt)}</span></span></td>
                  <td>
                    <form action={setOrganizationStatusAction.bind(null, o.id, o.status === "active" ? "suspended" : "active")} className="inline-form">
                      {o.status === "active" ? <Badge tone="ok">Ativa</Badge> : <Badge tone="danger">Suspensa</Badge>}
                      <button type="submit" className={btn("ghost", "sm")}>{o.status === "active" ? "Suspender" : "Reativar"}<span className="sr-only"> {o.name}</span></button>
                    </form>
                  </td>
                  <td>
                    <span className="t-person">
                      <span>{o.aiEnabled ? <Badge tone="ai">IA ativada</Badge> : <Badge tone="neutral">IA desativada</Badge>}</span>
                      <span className="muted">{o.usage.calls} chamadas · {o.usage.tokens} tokens · US$ {o.usage.costUsd.toFixed(4)}</span>
                    </span>
                  </td>
                  <td>
                    <span className="muted">{o.quota.used} de {o.quota.limit} ({o.quota.limit ? Math.round((o.quota.used / o.quota.limit) * 100) : 100}%)</span>
                    <form action={setOrganizationQuotaAction.bind(null, o.id)} className="inline-form">
                      <input name="limit" type="number" min={0} max={1000000} defaultValue={o.quota.limit} aria-label={`Cota mensal de ${o.name}`} className="input-sm" />
                      <button type="submit" className={btn("ghost", "sm")}>Salvar<span className="sr-only"> cota de {o.name}</span></button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        </div>
      </main>
    </div>
  );
}
