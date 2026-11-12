import Link from "next/link";
import { ErrorAlert, param, type SearchParams } from "@/app/components";
import { Icon } from "@/app/ui/icons";
import { Badge, btn, ButtonLink, EmptyState, PageHeader, PriorityBadge, SlaBadge, StatusBadge } from "@/app/ui/primitives";
import { CHANNEL_LABEL, PRIORITY_LABEL, STATUS_LABEL, TYPE_LABEL, VIEW_LABEL } from "@/lib/labels";
import { DomainError } from "@/server/errors";
import { requireServiceActor } from "@/server/identity/session";
import { listMembers } from "@/server/organizations/service";
import { can } from "@/server/organizations/permissions";
import { listTeams } from "@/server/organizations/teams";
import { listTaxonomy } from "@/server/servicedesk/taxonomy";
import { listTickets, TICKET_VIEWS, type TicketFilters } from "@/server/servicedesk/tickets";

const FILTER_KEYS = ["q", "view", "status", "priority", "type", "channel", "teamId", "assignee", "categoryId", "risk", "from", "to", "sla", "sort"] as const;
/** Filtros que ficam recolhidos em "Mais filtros"; a seção abre sozinha quando algum deles está ativo. */
const MORE_KEYS = ["type", "channel", "teamId", "categoryId", "sla", "risk", "from", "to", "sort"] as const;
const SLA_OPTIONS: [string, string][] = [["on_time", "No prazo"], ["at_risk", "Em risco"], ["breached", "Violado"]];

function Select({ name, label, value, options, empty }: { name: string; label: string; value?: string; options: [string, string][]; empty: string }) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={value ?? ""}>
        <option value="">{empty}</option>
        {options.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  );
}

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

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

  const base = `/o/${slug}/chamados`;
  const viewHref = (v?: string) => `${base}${v ? `?view=${v}` : ""}`;
  const teamOptions: [string, string][] = teams.map((t) => [t.id, t.archivedAt ? `${t.name} (arquivada)` : t.name]);
  const categoryOptions: [string, string][] = taxonomy.categories.map((c) => [c.id, c.name]);
  const assigneeOptions: [string, string][] = [["me", "Eu"], ["none", "Sem responsável"], ...people.map((m): [string, string] => [m.id, m.name])];

  // Filtros ativos, descritos com os mesmos rótulos dos campos (a visão aparece nas abas).
  const nameOf = (opts: [string, string][], v: string) => opts.find(([k]) => k === v)?.[1] ?? v;
  const chips: [string, string][] = [];
  if (filters.q) chips.push(["Busca", `“${filters.q}”`]);
  if (filters.status) chips.push(["Status", STATUS_LABEL[filters.status as keyof typeof STATUS_LABEL] ?? filters.status]);
  if (filters.priority) chips.push(["Prioridade", PRIORITY_LABEL[filters.priority as keyof typeof PRIORITY_LABEL] ?? filters.priority]);
  if (filters.assignee) chips.push(["Responsável", nameOf(assigneeOptions, filters.assignee)]);
  if (filters.type) chips.push(["Tipo", TYPE_LABEL[filters.type as keyof typeof TYPE_LABEL] ?? filters.type]);
  if (filters.channel) chips.push(["Canal", CHANNEL_LABEL[filters.channel as keyof typeof CHANNEL_LABEL] ?? filters.channel]);
  if (filters.teamId) chips.push(["Equipe", nameOf(teamOptions, filters.teamId)]);
  if (filters.categoryId) chips.push(["Categoria", nameOf(categoryOptions, filters.categoryId)]);
  if (filters.sla) chips.push(["SLA", nameOf(SLA_OPTIONS, filters.sla)]);
  if (filters.risk) chips.push(["Risco de escalada", "com risco"]);
  if (filters.from) chips.push(["Criado de", filters.from.split("-").reverse().join("/")]);
  if (filters.to) chips.push(["Criado até", filters.to.split("-").reverse().join("/")]);
  if (filters.sort) chips.push(["Ordem", "prazo de SLA mais próximo"]);
  const moreOpen = MORE_KEYS.some((k) => filters[k]);
  const count = data.rows.length;
  const countText = data.truncated ? `Mostrando os ${count} mais recentes` : `${count} chamado${count === 1 ? "" : "s"}`;

  return (
    <>
      <PageHeader
        title="Chamados"
        meta={<span>{error ? "Filtros inválidos" : countText}{filters.view ? ` · ${VIEW_LABEL[filters.view as keyof typeof VIEW_LABEL] ?? ""}` : ""}</span>}
        actions={<ButtonLink href={`${base}/novo`} icon="plus">Novo chamado</ButtonLink>}
      />

      {/* Visões pré-definidas (RF-ATD-12) */}
      <nav className="view-tabs" aria-label="Visões de chamados">
        <Link href={viewHref()} aria-current={filters.view ? undefined : "page"}>Todos</Link>
        {TICKET_VIEWS.map((v) => (
          <Link key={v} href={viewHref(v)} aria-current={filters.view === v ? "page" : undefined}>{VIEW_LABEL[v]}</Link>
        ))}
      </nav>

      <ErrorAlert code={error ?? param(sp, "erro")} />

      <form className="card toolbar" method="get" role="search" aria-label="Filtrar chamados">
        {filters.view && <input type="hidden" name="view" value={filters.view} />}
        <div className="toolbar-main">
          <div className="field search">
            <label htmlFor="q">Buscar</label>
            <Icon name="search" />
            <input id="q" name="q" type="search" defaultValue={filters.q} maxLength={100} placeholder="Protocolo, assunto, descrição, contato…" aria-describedby="q-hint" />
            <span id="q-hint" className="sr-only">Busca por protocolo, assunto, descrição, nome ou e-mail do contato</span>
          </div>
          <Select name="status" label="Status" value={filters.status} empty="Todos" options={Object.entries(STATUS_LABEL)} />
          <Select name="priority" label="Prioridade" value={filters.priority} empty="Todas" options={Object.entries(PRIORITY_LABEL)} />
          <Select name="assignee" label="Responsável" value={filters.assignee} empty="Todos" options={assigneeOptions} />
          <div className="toolbar-submit">
            <button type="submit" className={btn("primary")}>Filtrar</button>
          </div>
        </div>
        <details className="more-filters" open={moreOpen}>
          <summary>Mais filtros</summary>
          <div className="more-filters-grid">
            <Select name="type" label="Tipo" value={filters.type} empty="Todos" options={Object.entries(TYPE_LABEL)} />
            <Select name="channel" label="Canal" value={filters.channel} empty="Todos" options={Object.entries(CHANNEL_LABEL)} />
            <Select name="teamId" label="Equipe" value={filters.teamId} empty="Todas" options={teamOptions} />
            <Select name="categoryId" label="Categoria" value={filters.categoryId} empty="Todas" options={categoryOptions} />
            <Select name="sla" label="Situação do SLA" value={filters.sla} empty="Todas" options={SLA_OPTIONS} />
            <Select name="risk" label="Risco de escalada" value={filters.risk} empty="Indiferente" options={[["1", "Com risco"]]} />
            <div className="field"><label htmlFor="from">Criado de</label><input id="from" name="from" type="date" defaultValue={filters.from} /></div>
            <div className="field"><label htmlFor="to">Criado até</label><input id="to" name="to" type="date" defaultValue={filters.to} /></div>
            <Select name="sort" label="Ordenar por" value={filters.sort} empty="Mais recentes" options={[["sla", "Prazo de SLA mais próximo"]]} />
          </div>
        </details>
      </form>

      {chips.length > 0 && (
        <div className="active-filters" aria-label="Filtros ativos">
          <span className="muted">Filtros:</span>
          {chips.map(([k, v]) => <span key={k} className="chip"><span className="k">{k}:</span> {v}</span>)}
          <Link href={viewHref(filters.view)}>Limpar filtros</Link>
        </div>
      )}

      <section className="card table-card" aria-label="Lista de chamados">
        {count === 0 ? (
          <EmptyState
            title={chips.length || filters.view ? "Nenhum chamado encontrado" : "Nenhum chamado ainda"}
            action={chips.length ? <ButtonLink href={viewHref(filters.view)} variant="secondary" size="sm">Limpar filtros</ButtonLink> : undefined}
          >
            {chips.length ? "Nenhum chamado corresponde aos filtros aplicados." : filters.view ? "Não há chamados nesta visão no momento." : "Os chamados criados manualmente, pelo portal ou por e-mail aparecem aqui."}
          </EmptyState>
        ) : (
          <>
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabela de chamados (rolável)">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Chamado</th><th scope="col">Contato</th><th scope="col">Status</th><th scope="col">Prioridade</th>
                    <th scope="col">SLA</th><th scope="col">Equipe / responsável</th><th scope="col">Criado em</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((t) => (
                    <tr key={t.id}>
                      <td className="t-subject">
                        <Link href={`${base}/${t.number}`} title={t.subject}>{t.subject}</Link>
                        <div className="t-sub">
                          <span className="t-proto">{t.protocol}</span>
                          {t.type && <span className="t-proto">· {TYPE_LABEL[t.type]}</span>}
                          {t.escalationRisk && <Badge tone="danger">Risco de escalada</Badge>}
                          {t.triageState === "suggested" && <Badge tone="ai">Revisar triagem</Badge>}
                        </div>
                      </td>
                      <td>{t.contact.name}</td>
                      <td className="t-nowrap"><StatusBadge status={t.status} /></td>
                      <td className="t-nowrap"><PriorityBadge priority={t.priority} /></td>
                      <td className="t-nowrap">{t.sla ? <SlaBadge state={t.sla} /> : <span className="muted">—</span>}</td>
                      <td>
                        <span className="t-person">
                          <span>{t.assignee?.user.name ?? <span className="muted">Sem responsável</span>}</span>
                          <span className="muted">{t.team?.name ?? "Sem equipe"}</span>
                        </span>
                      </td>
                      <td className="t-nowrap">{dateFmt.format(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* No celular, cada chamado vira um card */}
            <ul className="ticket-cards">
              {data.rows.map((t) => (
                <li key={t.id}>
                  <Link href={`${base}/${t.number}`} className="ticket-card">
                    <span className="ticket-card-top"><span>{t.protocol}</span><span>{dateFmt.format(t.createdAt)}</span></span>
                    <strong>{t.subject}</strong>
                    <span className="tags">
                      <StatusBadge status={t.status} />
                      <PriorityBadge priority={t.priority} />
                      {t.sla && <SlaBadge state={t.sla} />}
                      {t.escalationRisk && <Badge tone="danger">Risco de escalada</Badge>}
                      {t.triageState === "suggested" && <Badge tone="ai">Revisar triagem</Badge>}
                    </span>
                    <span className="ticket-card-foot">
                      {t.contact.name} · {t.assignee?.user.name ?? "Sem responsável"}{t.team ? ` · ${t.team.name}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {data.truncated && <p className="list-foot muted">Mostrando os 100 mais recentes. Refine os filtros para ver os demais.</p>}
          </>
        )}
      </section>
    </>
  );
}
