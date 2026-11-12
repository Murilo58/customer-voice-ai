import { notFound } from "next/navigation";
import { ErrorAlert, param, type SearchParams } from "@/app/components";
import { Card, EmptyState, PageHeader } from "@/app/ui/primitives";
import { CHANNEL_LABEL, formatDuration, PRIORITY_LABEL, TYPE_LABEL } from "@/lib/labels";
import { getDashboard, getDashboardOptions, type DashboardFilters } from "@/server/dashboard/metrics";
import { DomainError, ForbiddenError } from "@/server/errors";
import { requireActor } from "@/server/identity/session";
import { can } from "@/server/organizations/permissions";
import { getAiSettings } from "@/server/servicedesk/taxonomy";

const FIELD_LABEL: Record<string, string> = { type: "Tipo", category: "Categoria", reason: "Motivo", priority: "Prioridade", team: "Equipe" };
const percent = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);
const num = (v: number) => v.toLocaleString("pt-BR");
const formatDay = (iso: string) => iso.split("-").reverse().join("/");

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: React.ReactNode; tone?: "warn" }) {
  return (
    <div className={`kpi${tone ? ` kpi-${tone}` : ""}`}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {hint && <span className="kpi-hint">{hint}</span>}
    </div>
  );
}

/**
 * Barras horizontais em CSS (uma série, um tom). O valor e a participação ficam escritos ao lado de cada barra;
 * a barra é só reforço visual (aria-hidden), então a lista funciona como tabela para leitores de tela.
 */
function BarList({ title, rows }: { title: string; rows: { label: string; total: number }[] }) {
  const sum = rows.reduce((a, r) => a + r.total, 0);
  const max = Math.max(0, ...rows.map((r) => r.total));
  return (
    <Card title={title}>
      {sum === 0 ? <p className="muted">Sem chamados no período.</p> : (
        <ul className="bar-list">
          {rows.map((r) => (
            <li key={r.label} className="bar-row">
              <span className="bar-label">{r.label}</span>
              <span className="bar-value">{num(r.total)} <span className="muted">· {Math.round((r.total / sum) * 100)}%</span></span>
              <span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ width: `${max ? (r.total / max) * 100 : 0}%` }} /></span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Duration({ title, m }: { title: string; m: { calendar: { avg: number | null; median: number | null }; business: { avg: number | null; median: number | null } } }) {
  return (
    <div className="duration">
      <h3>{title}</h3>
      <table className="data-table">
        <thead><tr><th scope="col"><span className="sr-only">Contagem</span></th><th scope="col">Média</th><th scope="col">Mediana</th></tr></thead>
        <tbody>
          <tr><th scope="row">Horas corridas</th><td>{formatDuration(m.calendar.avg)}</td><td>{formatDuration(m.calendar.median)}</td></tr>
          <tr><th scope="row">Horas úteis</th><td>{formatDuration(m.business.avg)}</td><td>{formatDuration(m.business.median)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

// Dashboard operacional (RF-DSH-01 a 05). Leitura executiva acessa em modo somente leitura (RF-ORG-10).
export default async function DashboardPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { actor } = await requireActor(slug);
  if (!can(actor.role, "dashboard.read", actor.executiveRead)) notFound();
  const filters: DashboardFilters = { from: param(sp, "from") || undefined, to: param(sp, "to") || undefined, teamId: param(sp, "teamId") || undefined, categoryId: param(sp, "categoryId") || undefined, channel: param(sp, "channel") || undefined };
  let data: Awaited<ReturnType<typeof getDashboard>> | null = null;
  let error: string | undefined;
  try {
    data = await getDashboard(actor, filters);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    if (!(e instanceof DomainError)) throw e;
    error = e.code;
  }
  // Opções de filtro: equipes e categorias (sem acesso a chamados)
  const options = await getDashboardOptions(actor);
  const ai = can(actor.role, "settings.manage") ? await getAiSettings(actor) : null;
  const quotaPct = ai ? (ai.quota.limit ? Math.min(100, Math.round((ai.quota.used / ai.quota.limit) * 100)) : 100) : 0;
  const csatMax = data ? Math.max(0, ...data.csat.distribution) : 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        meta={data ? <>Período de {formatDay(data.period.from)} a {formatDay(data.period.to)} · fuso {data.period.timezone}</> : "Indicadores do período"}
      />
      <ErrorAlert code={error} />

      <form className="card toolbar" method="get" aria-label="Filtros do dashboard">
        <div className="dash-filters">
          <div><label htmlFor="from">De</label><input id="from" name="from" type="date" defaultValue={data?.period.from ?? filters.from} /></div>
          <div><label htmlFor="to">Até</label><input id="to" name="to" type="date" defaultValue={data?.period.to ?? filters.to} /></div>
          <div>
            <label htmlFor="teamId">Equipe</label>
            <select id="teamId" name="teamId" defaultValue={filters.teamId ?? ""}>
              <option value="">Todas</option>
              {options.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="categoryId">Categoria</label>
            <select id="categoryId" name="categoryId" defaultValue={filters.categoryId ?? ""}>
              <option value="">Todas</option>
              {options.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="channel">Canal</label>
            <select id="channel" name="channel" defaultValue={filters.channel ?? ""}>
              <option value="">Todos</option>
              {Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="toolbar-submit"><button type="submit" className="btn btn-primary">Aplicar</button></div>
        </div>
      </form>

      {!data && !error && <EmptyState icon="chart" title="Sem dados para exibir" />}

      {data && (
        <>
          <section aria-labelledby="dash-volume">
            <h2 id="dash-volume" className="section-title">Volume e qualidade</h2>
            <div className="kpi-grid">
              <Stat label="Recebidos" value={num(data.received)} hint="Criados no período" />
              <Stat label="Resolvidos" value={num(data.resolved)} hint="Resolvidos no período" />
              <Stat label="Backlog" value={num(data.backlog)} hint="Ativos no fim do período" />
              <Stat label="SLA de 1ª resposta" value={percent(data.sla.firstResponse.rate)} hint={`${num(data.sla.firstResponse.achieved)} de ${num(data.sla.firstResponse.achieved + data.sla.firstResponse.breached)} no prazo`} tone={data.sla.firstResponse.breached > 0 ? "warn" : undefined} />
              <Stat label="SLA de resolução" value={percent(data.sla.resolution.rate)} hint={`${num(data.sla.resolution.achieved)} de ${num(data.sla.resolution.achieved + data.sla.resolution.breached)} no prazo`} tone={data.sla.resolution.breached > 0 ? "warn" : undefined} />
              <Stat label="CSAT" value={percent(data.csat.rate)} hint={`${num(data.csat.satisfied)} de ${num(data.csat.responses)} com nota 4 ou 5`} />
            </div>
            <p className="dash-note">Indicadores calculados por consultas ao banco (RN-40 a RN-45); nenhum valor vem da IA.</p>
          </section>

          <div className="dash-grid">
            <Card title="Tempos de atendimento">
              <div className="duration-grid">
                <Duration title="1ª resposta" m={data.firstResponse} />
                <Duration title="Resolução" m={data.resolution} />
              </div>
            </Card>
            <Card title="Satisfação (CSAT)">
              <p className="dash-sub">
                Média <strong>{data.csat.average ?? "—"}</strong> · taxa de resposta <strong>{percent(data.csat.responseRate)}</strong> · {num(data.csat.responses)} resposta(s)
              </p>
              {data.csat.responses === 0 ? <p className="muted">Nenhuma avaliação no período.</p> : (
                <ul className="bar-list">
                  {data.csat.distribution.map((n, i) => (
                    <li key={i} className="bar-row">
                      <span className="bar-label">Nota {i + 1}</span>
                      <span className="bar-value">{num(n)}</span>
                      <span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ width: `${csatMax ? (n / csatMax) * 100 : 0}%` }} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="dash-grid dash-grid-3">
            <BarList title="Por categoria" rows={data.byCategory.map((r) => ({ label: r.label ?? "Sem categoria", total: r.total }))} />
            <BarList title="Por tipo" rows={data.byType.map((r) => ({ label: r.key ? TYPE_LABEL[r.key as keyof typeof TYPE_LABEL] : "Não classificado", total: r.total }))} />
            <BarList title="Por prioridade" rows={data.byPriority.map((r) => ({ label: PRIORITY_LABEL[r.key as keyof typeof PRIORITY_LABEL] ?? String(r.key), total: r.total }))} />
          </div>

          <Card title="Por equipe" className="table-card">
            {data.byTeam.length === 0 ? <p className="muted dash-pad">Sem dados.</p> : (
              <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabela por equipe (rolável)">
                <table className="data-table">
                  <thead><tr><th scope="col">Equipe</th><th scope="col" className="num">Recebidos</th><th scope="col" className="num">Resolvidos</th><th scope="col" className="num">Backlog</th></tr></thead>
                  <tbody>{data.byTeam.map((t) => <tr key={t.teamId ?? "none"}><td>{t.name ?? <span className="muted">Sem equipe</span>}</td><td className="num">{num(t.received)}</td><td className="num">{num(t.resolved)}</td><td className="num">{num(t.backlog)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="dash-grid">
            <Card title="Aceitação da triagem" className="table-card">
              <p className="dash-sub dash-pad">
                Taxa <strong>{percent(data.triage.rate)}</strong> · {num(data.triage.accepted)} aceitas sem alteração, {num(data.triage.changed)} alteradas · {num(data.triage.pending)} sugestão(ões) não revisada(s) <span className="muted">(RN-13)</span>
              </p>
              {data.triage.byField.length === 0 ? <p className="muted dash-pad">Nenhuma sugestão da IA revisada no período.</p> : (
              <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabela de aceitação por campo (rolável)">
                <table className="data-table">
                  <thead><tr><th scope="col">Campo</th><th scope="col" className="num">Aceitos</th><th scope="col" className="num">Alterados</th><th scope="col" className="num">Taxa</th><th scope="col" className="num">Pendentes</th></tr></thead>
                  <tbody>{data.triage.byField.map((f) => <tr key={f.field}><td>{FIELD_LABEL[f.field] ?? f.field}</td><td className="num">{num(f.accepted)}</td><td className="num">{num(f.changed)}</td><td className="num">{percent(f.rate)}</td><td className="num">{num(f.pending)}</td></tr>)}</tbody>
                </table>
              </div>
              )}
            </Card>
            {ai && (
              <Card title="Consumo de IA no mês">
                <div className="panel-row"><span>Chamadas</span><strong>{num(ai.usage.calls)}</strong></div>
                <div className="panel-row"><span>Tokens</span><strong>{num(ai.usage.inputTokens + ai.usage.outputTokens + ai.usage.thoughtTokens)}</strong></div>
                <div className="panel-row"><span>Cota usada</span><strong>{num(ai.quota.used)} de {num(ai.quota.limit)} ({quotaPct}%)</strong></div>
                <div className={`progress${quotaPct >= 90 ? " progress-warn" : ""}`} role="progressbar" aria-label="Cota de IA usada no mês" aria-valuemin={0} aria-valuemax={100} aria-valuenow={quotaPct}>
                  <span style={{ width: `${quotaPct}%` }} />
                </div>
                <p className="panel-note">RF-DSH-05. Visível apenas para quem gerencia as configurações.</p>
              </Card>
            )}
          </div>
        </>
      )}
    </>
  );
}
