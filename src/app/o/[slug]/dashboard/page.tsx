import { notFound } from "next/navigation";
import { ErrorAlert, param, type SearchParams } from "@/app/components";
import { CHANNEL_LABEL, formatDuration, PRIORITY_LABEL, TYPE_LABEL } from "@/lib/labels";
import { getDashboard, getDashboardOptions, type DashboardFilters } from "@/server/dashboard/metrics";
import { DomainError, ForbiddenError } from "@/server/errors";
import { requireActor } from "@/server/identity/session";
import { can } from "@/server/organizations/permissions";
import { getAiSettings } from "@/server/servicedesk/taxonomy";

const FIELD_LABEL: Record<string, string> = { type: "Tipo", category: "Categoria", reason: "Motivo", priority: "Prioridade", team: "Equipe" };
const percent = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

function Distribution({ title, rows }: { title: string; rows: { label: string; total: number }[] }) {
  return (
    <div>
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="muted">Sem dados.</p> : (
        <table><tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td>{r.total}</td></tr>)}</tbody></table>
      )}
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
  return (
    <>
      <h1>Dashboard</h1>
      <ErrorAlert code={error} />
      <form className="card filters" method="get">
        <span><label htmlFor="from">De</label><input id="from" name="from" type="date" defaultValue={data?.period.from ?? filters.from} /></span>
        <span><label htmlFor="to">Até</label><input id="to" name="to" type="date" defaultValue={data?.period.to ?? filters.to} /></span>
        <span>
          <label htmlFor="teamId">Equipe</label>
          <select id="teamId" name="teamId" defaultValue={filters.teamId ?? ""}>
            <option value="">Todas</option>
            {options.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </span>
        <span>
          <label htmlFor="categoryId">Categoria</label>
          <select id="categoryId" name="categoryId" defaultValue={filters.categoryId ?? ""}>
            <option value="">Todas</option>
            {options.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </span>
        <span>
          <label htmlFor="channel">Canal</label>
          <select id="channel" name="channel" defaultValue={filters.channel ?? ""}>
            <option value="">Todos</option>
            {Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </span>
        <span><label>&nbsp;</label><button type="submit">Aplicar</button></span>
      </form>
      {data && (
        <>
          <div className="card">
            <p className="muted">Período {data.period.from} a {data.period.to} ({data.period.timezone}). Indicadores calculados por consultas ao banco (RN-40 a RN-45); nenhum valor vem da IA.</p>
            <table>
              <tbody>
                <tr><th>Recebidos</th><td>{data.received}</td><th>Resolvidos</th><td>{data.resolved}</td><th>Backlog no fim do período</th><td>{data.backlog}</td></tr>
                <tr>
                  <th>1ª resposta (média · mediana)</th>
                  <td colSpan={2}>{formatDuration(data.firstResponse.calendar.avg)} · {formatDuration(data.firstResponse.calendar.median)} corridas<br />{formatDuration(data.firstResponse.business.avg)} · {formatDuration(data.firstResponse.business.median)} úteis</td>
                  <th>Resolução (média · mediana)</th>
                  <td colSpan={2}>{formatDuration(data.resolution.calendar.avg)} · {formatDuration(data.resolution.calendar.median)} corridas<br />{formatDuration(data.resolution.business.avg)} · {formatDuration(data.resolution.business.median)} úteis</td>
                </tr>
                <tr>
                  <th>SLA de 1ª resposta cumprido</th><td>{percent(data.sla.firstResponse.rate)} <span className="muted">({data.sla.firstResponse.achieved} de {data.sla.firstResponse.achieved + data.sla.firstResponse.breached})</span></td>
                  <th>SLA de resolução cumprido</th><td>{percent(data.sla.resolution.rate)} <span className="muted">({data.sla.resolution.achieved} de {data.sla.resolution.achieved + data.sla.resolution.breached})</span></td>
                  <th>CSAT</th><td className="muted">disponível no I-4</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="card filters">
            <Distribution title="Por categoria" rows={data.byCategory.map((r) => ({ label: r.label ?? "Sem categoria", total: r.total }))} />
            <Distribution title="Por tipo" rows={data.byType.map((r) => ({ label: r.key ? TYPE_LABEL[r.key as keyof typeof TYPE_LABEL] : "Não classificado", total: r.total }))} />
            <Distribution title="Por prioridade" rows={data.byPriority.map((r) => ({ label: PRIORITY_LABEL[r.key as keyof typeof PRIORITY_LABEL] ?? String(r.key), total: r.total }))} />
          </div>
          <div className="card">
            <h2>Por equipe</h2>
            <table>
              <thead><tr><th>Equipe</th><th>Recebidos</th><th>Resolvidos</th><th>Backlog</th></tr></thead>
              <tbody>{data.byTeam.map((t) => <tr key={t.teamId ?? "none"}><td>{t.name ?? "Sem equipe"}</td><td>{t.received}</td><td>{t.resolved}</td><td>{t.backlog}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="card">
            <h2>Aceitação da triagem (RN-13)</h2>
            <p>Taxa: <strong>{percent(data.triage.rate)}</strong> ({data.triage.accepted} aceitos sem alteração, {data.triage.changed} alterados) · sugestões não revisadas: {data.triage.pending}</p>
            <table>
              <thead><tr><th>Campo</th><th>Aceitos</th><th>Alterados</th><th>Taxa</th><th>Pendentes</th></tr></thead>
              <tbody>{data.triage.byField.map((f) => <tr key={f.field}><td>{FIELD_LABEL[f.field] ?? f.field}</td><td>{f.accepted}</td><td>{f.changed}</td><td>{percent(f.rate)}</td><td>{f.pending}</td></tr>)}</tbody>
            </table>
          </div>
          {ai && (
            <div className="card">
              <h2>Consumo de IA no mês (RF-DSH-05)</h2>
              <p>{ai.usage.calls} chamadas · {ai.usage.inputTokens + ai.usage.outputTokens + ai.usage.thoughtTokens} tokens · cota {ai.quota.used} de {ai.quota.limit} ({ai.quota.limit ? Math.round((ai.quota.used / ai.quota.limit) * 100) : 100}%)</p>
            </div>
          )}
        </>
      )}
    </>
  );
}
