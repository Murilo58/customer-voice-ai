import Link from "next/link";
import { ErrorAlert, param, type SearchParams } from "@/app/components";
import { CHANNEL_LABEL, PRIORITY_LABEL, SLA_STATE_LABEL, STATUS_LABEL, TYPE_LABEL, VIEW_LABEL } from "@/lib/labels";
import { DomainError } from "@/server/errors";
import { requireServiceActor } from "@/server/identity/session";
import { listMembers } from "@/server/organizations/service";
import { can } from "@/server/organizations/permissions";
import { listTeams } from "@/server/organizations/teams";
import { listTaxonomy } from "@/server/servicedesk/taxonomy";
import { listTickets, TICKET_VIEWS, type TicketFilters } from "@/server/servicedesk/tickets";

const FILTER_KEYS = ["q", "view", "status", "priority", "type", "channel", "teamId", "assignee", "categoryId", "risk", "from", "to", "sla", "sort"] as const;

function Select({ name, label, value, options, empty }: { name: string; label: string; value?: string; options: [string, string][]; empty: string }) {
  return (
    <span>
      <label htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={value ?? ""}>
        <option value="">{empty}</option>
        {options.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </span>
  );
}

export default async function TicketsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { actor } = await requireServiceActor(slug);
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, param(sp, k) || undefined])) as TicketFilters;
  let error: string | undefined;
  let data: Awaited<ReturnType<typeof listTickets>> = { rows: [], truncated: false };
  try {
    data = await listTickets(actor, filters);
  } catch (e) {
    if (!(e instanceof DomainError)) throw e;
    error = e.code;
  }
  const [teams, taxonomy, members] = await Promise.all([
    listTeams(actor, { includeArchived: true }),
    listTaxonomy(actor, { includeInactive: true }),
    can(actor.role, "members.manage") ? listMembers(actor).then((r) => r.members.map((m) => ({ id: m.id, name: m.user.name }))) : Promise.resolve(null),
  ]);
  // Sem gestão de membros, o filtro de responsável lista os membros das equipes.
  const people = members ?? [...new Map(teams.flatMap((t) => t.members.map((m) => [m.membershipId, { id: m.membershipId, name: m.membership.user.name }]))).values()];
  const viewHref = (v?: string) => `/o/${slug}/chamados${v ? `?view=${v}` : ""}`;
  return (
    <>
      <h1>Chamados</h1>
      <p><Link href={`/o/${slug}/chamados/novo`}>+ Novo chamado</Link></p>
      {/* Visões pré-definidas (RF-ATD-12) */}
      <nav className="card">
        <Link href={viewHref()}>{filters.view ? "Todos" : <strong>Todos</strong>}</Link>
        {TICKET_VIEWS.map((v) => (
          <span key={v}> · <Link href={viewHref(v)}>{filters.view === v ? <strong>{VIEW_LABEL[v]}</strong> : VIEW_LABEL[v]}</Link></span>
        ))}
      </nav>
      <ErrorAlert code={error ?? param(sp, "erro")} />
      <form className="card" method="get">
        {filters.view && <input type="hidden" name="view" value={filters.view} />}
        <label htmlFor="q">Buscar por protocolo, assunto, descrição, nome ou e-mail do contato</label>
        <input id="q" name="q" defaultValue={filters.q} maxLength={100} />
        <div className="filters">
          <Select name="status" label="Status" value={filters.status} empty="Todos" options={Object.entries(STATUS_LABEL)} />
          <Select name="priority" label="Prioridade" value={filters.priority} empty="Todas" options={Object.entries(PRIORITY_LABEL)} />
          <Select name="type" label="Tipo" value={filters.type} empty="Todos" options={Object.entries(TYPE_LABEL)} />
          <Select name="channel" label="Canal" value={filters.channel} empty="Todos" options={Object.entries(CHANNEL_LABEL)} />
          <Select name="teamId" label="Equipe" value={filters.teamId} empty="Todas" options={teams.map((t) => [t.id, t.archivedAt ? `${t.name} (arquivada)` : t.name])} />
          <Select name="categoryId" label="Categoria" value={filters.categoryId} empty="Todas" options={taxonomy.categories.map((c) => [c.id, c.name])} />
          <Select
            name="assignee" label="Responsável" value={filters.assignee} empty="Todos"
            options={[["me", "Eu"], ["none", "Sem responsável"], ...people.map((m): [string, string] => [m.id, m.name])]}
          />
          <Select name="sla" label="Situação do SLA" value={filters.sla} empty="Todas" options={[["on_time", "No prazo"], ["at_risk", "Em risco"], ["breached", "Violado"]]} />
          <Select name="sort" label="Ordenar por" value={filters.sort} empty="Mais recentes" options={[["sla", "Prazo de SLA mais próximo"]]} />
          <Select name="risk" label="Risco de escalada" value={filters.risk} empty="Indiferente" options={[["1", "Com risco"]]} />
          <span><label htmlFor="from">Criado de</label><input id="from" name="from" type="date" defaultValue={filters.from} /></span>
          <span><label htmlFor="to">até</label><input id="to" name="to" type="date" defaultValue={filters.to} /></span>
        </div>
        <button type="submit">Filtrar</button>
      </form>
      <div className="card">
        {data.rows.length === 0 ? <p className="muted">Nenhum chamado encontrado.</p> : (
          <table>
            <thead><tr><th>Protocolo</th><th>Assunto</th><th>Contato</th><th>Tipo</th><th>Prioridade</th><th>Status</th><th>SLA</th><th>Equipe</th><th>Responsável</th><th>Criado em</th></tr></thead>
            <tbody>
              {data.rows.map((t) => (
                <tr key={t.id}>
                  <td><Link href={`/o/${slug}/chamados/${t.number}`}>{t.protocol}</Link></td>
                  <td>
                    {t.subject} {t.escalationRisk && <span className="badge">risco</span>} {t.triageState === "suggested" && <span className="badge">revisar triagem</span>}
                  </td>
                  <td>{t.contact.name}</td>
                  <td>{t.type ? TYPE_LABEL[t.type] : "—"}</td>
                  <td>{PRIORITY_LABEL[t.priority]}</td>
                  <td>{STATUS_LABEL[t.status]}</td>
                  <td>{t.sla ? (t.sla === "on_time" ? SLA_STATE_LABEL[t.sla] : <span className="badge">{SLA_STATE_LABEL[t.sla]}</span>) : "—"}</td>
                  <td>{t.team?.name ?? "—"}</td>
                  <td>{t.assignee?.user.name ?? "—"}</td>
                  <td>{t.createdAt.toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data.truncated && <p className="muted">Mostrando os 100 mais recentes. Refine os filtros para ver os demais.</p>}
      </div>
    </>
  );
}
