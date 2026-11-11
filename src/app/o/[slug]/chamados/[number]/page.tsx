import Link from "next/link";
import { notFound } from "next/navigation";
import { addNoteAction, publicReplyAction } from "@/app/actions/servicedesk";
import { ErrorAlert, param, type SearchParams } from "@/app/components";
import { CHANNEL_LABEL, EMAIL_STATUS_LABEL, formatDuration, METRIC_LABEL, PRIORITY_LABEL, SLA_STATE_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/lib/labels";
import { getTicketSla } from "@/server/sla/service";
import { requireServiceActor } from "@/server/identity/session";
import { getTicket, type TimelineItem } from "@/server/servicedesk/tickets";
import { listTaxonomy } from "@/server/servicedesk/taxonomy";
import { getTriageView } from "@/server/servicedesk/triage-review";
import { can } from "@/server/organizations/permissions";
import { listAssignableMembers, listTeams } from "@/server/organizations/teams";
import { TriagePanel } from "./triage-panel";
import { WorkflowPanel } from "./workflow-panel";

const MESSAGE_LABEL: Record<string, string> = {
  public_reply: "Resposta pública",
  internal_note: "Nota interna",
  customer_message: "Mensagem do cliente",
  system: "Sistema",
};

function describeEvent(item: Extract<TimelineItem, { kind: "event" }>, names: Record<string, string>): string {
  const d = (item.data ?? {}) as Record<string, string | null>;
  const who = (id: string | null | undefined) => (id ? (names[id] ?? "membro") : "ninguém");
  if (item.type === "ticket.status_changed") {
    const st = (v: string | null) => (v ? (STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? v) : "—");
    const why = d.auto === "assumed" ? " (ao ser assumido)" : d.auto === "replied" ? " (ao ser respondido)" : d.auto ? " (automático)" : d.reason ? ` — motivo: ${d.reason}` : "";
    return `Status alterado de ${st(d.from ?? null)} para ${st(d.to ?? null)}${why}`;
  }
  if (item.type === "ticket.assigned") return d.to ? `Responsável: ${who(d.to)}${d.from ? ` (antes: ${who(d.from)})` : ""}` : `Responsável removido (antes: ${who(d.from)})`;
  if (item.type === "sla.risk") return `SLA em risco: ${METRIC_LABEL[d.metric ?? ""] ?? d.metric} (80% do prazo)`;
  if (item.type === "sla.breach") return `SLA violado: ${METRIC_LABEL[d.metric ?? ""] ?? d.metric}`;
  if (item.type === "ticket.team_changed") return `Equipe alterada de ${d.from ? who(d.from) : "nenhuma"} para ${d.to ? who(d.to) : "nenhuma"}`;
  if (item.type === "ticket.created") return `Chamado criado (canal ${CHANNEL_LABEL[d.channel as keyof typeof CHANNEL_LABEL] ?? d.channel})`;
  if (item.type === "ticket.field_changed") {
    const label = (v: string | null) => (v ? (d.field === "type" ? TYPE_LABEL[v as keyof typeof TYPE_LABEL] : PRIORITY_LABEL[v as keyof typeof PRIORITY_LABEL]) ?? v : "—");
    return `${d.field === "type" ? "Tipo alterado" : "Prioridade alterada"} de ${label(d.from ?? null)} para ${label(d.to ?? null)}`;
  }
  const TRIAGE_EVENTS: Record<string, string> = {
    "triage.suggested": "Triagem por IA sugeriu classificação",
    "triage.unavailable": `Triagem indisponível (${d.reason ?? "falha"})`,
    "triage.reviewed": "Sugestões da IA confirmadas",
    "triage.field_reviewed": `Sugestão de ${d.field === "team" ? "equipe" : d.field} ${d.outcome === "accepted" ? "aceita" : "alterada"}${d.field === "team" && d.final ? ` (${who(d.final)})` : ""}`,
    "triage.reprocess_requested": "Reprocessamento da triagem solicitado",
  };
  return TRIAGE_EVENTS[item.type] ?? item.type;
}

const LIVE_STATES = ["ok", "risk", "breached", "paused"];

/** Tempo restante e situação de cada meta (RF-SLA-03; CA-12.4). */
function SlaPanel({ sla }: { sla: NonNullable<Awaited<ReturnType<typeof getTicketSla>>> }) {
  const metrics = Object.values(sla).filter((m) => m.state !== "none");
  return (
    <div className="card">
      <h2>SLA</h2>
      {metrics.length === 0 ? <p className="muted">Sem meta de SLA para a prioridade deste chamado.</p> : (
        <table>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.metric}>
                <th>{METRIC_LABEL[m.metric]}</th>
                <td>{LIVE_STATES.includes(m.state) && m.state !== "ok" ? <span className="badge">{SLA_STATE_LABEL[m.state]}</span> : SLA_STATE_LABEL[m.state]}</td>
                <td>
                  {m.state === "met" || m.state === "met_late"
                    ? <>usado {formatDuration(m.consumedSeconds)} de {formatDuration(m.targetSeconds)}</>
                    : LIVE_STATES.includes(m.state)
                      ? <>restam {formatDuration(m.remainingSeconds)} de {formatDuration(m.targetSeconds)}{m.dueAt && <> · prazo {m.dueAt.toLocaleString("pt-BR")}</>}</>
                      : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default async function TicketPage({ params, searchParams }: { params: Promise<{ slug: string; number: string }>; searchParams: SearchParams }) {
  const { slug, number: raw } = await params;
  const sp = await searchParams;
  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number < 1) notFound();
  const { actor } = await requireServiceActor(slug);
  const data = await getTicket(actor, number);
  if (!data) notFound();
  const { ticket, timeline, names } = data;
  const canAssign = can(actor.role, "tickets.assign", actor.executiveRead);
  const [view, taxonomy, teams, assignable, sla] = await Promise.all([
    getTriageView(actor, ticket.id),
    listTaxonomy(actor, { includeInactive: true }),
    listTeams(actor),
    canAssign ? listAssignableMembers(actor) : Promise.resolve([]),
    getTicketSla(actor, ticket.id),
  ]);
  const teamSuggested = !!view.run?.reviews.some((r) => r.field === "team" && r.outcome === "pending");
  const replyable = ["new", "open", "waiting_customer", "waiting_third_party"].includes(ticket.status);
  // Itens desativados continuam visíveis no chamado que já os usa (RN-12), mas não são novas opções.
  const activeOr = (list: { id: string; name: string; active: boolean }[], keep: string | null) => list.filter((i) => i.active || i.id === keep);
  return (
    <>
      <p><Link href={`/o/${slug}/chamados`}>← Chamados</Link></p>
      <h1>{ticket.protocol} · {ticket.subject}</h1>
      <ErrorAlert code={param(sp, "erro")} />
      <div className="card">
        <p>
          Contato: <Link href={`/o/${slug}/contatos/${ticket.contact.id}`}>{ticket.contact.name}</Link> ({ticket.contact.email})
          {ticket.contact.company && <> · Empresa: <Link href={`/o/${slug}/empresas/${ticket.contact.company.id}`}>{ticket.contact.company.name}</Link></>}
        </p>
        <p>
          Canal: {CHANNEL_LABEL[ticket.channel]} · Criado em {ticket.createdAt.toLocaleString("pt-BR")} · Atualizado em {ticket.updatedAt.toLocaleString("pt-BR")}
        </p>
      </div>
      {sla && <SlaPanel sla={sla} />}
      <WorkflowPanel slug={slug} ticket={ticket} me={actor.membershipId} canAssign={canAssign} teamSuggested={teamSuggested} teams={teams} assignable={assignable} />
      <TriagePanel
        slug={slug}
        ticket={ticket}
        view={view}
        categories={activeOr(taxonomy.categories, ticket.categoryId)}
        reasons={activeOr(taxonomy.reasons, ticket.reasonId)}
        canReprocess={can(actor.role, "triage.reprocess", actor.executiveRead)}
      />
      <div className="card">
        <h2>Descrição</h2>
        <p style={{ whiteSpace: "pre-wrap" }}>{ticket.description}</p>
      </div>
      <div className="card">
        <h2>Linha do tempo</h2>
        <ol>
          {timeline.map((item) => (
            <li key={item.id} style={{ marginBottom: 12 }}>
              <span className="muted">{item.at.toLocaleString("pt-BR")} · </span>
              {item.kind === "event" ? (
                <>{describeEvent(item, names)} <span className="muted">— {item.actorName ?? "Sistema"}</span></>
              ) : (
                <div className={item.messageKind === "internal_note" ? "message-internal" : "message-public"}>
                  <strong>{MESSAGE_LABEL[item.messageKind] ?? item.messageKind}</strong> <span className="muted">— {item.author ?? "Sistema"}</span>
                  {item.emailStatus && <span className="badge">{EMAIL_STATUS_LABEL[item.emailStatus] ?? item.emailStatus}</span>}
                  <div style={{ whiteSpace: "pre-wrap" }}>{item.body}</div>
                </div>
              )}
            </li>
          ))}
        </ol>
        {replyable && (
          <form action={publicReplyAction.bind(null, slug, ticket.id, ticket.number)}>
            <label htmlFor="reply">Resposta pública (enviada por e-mail ao contato)</label>
            <textarea id="reply" name="body" required maxLength={20000} rows={4} style={{ width: "100%" }} />
            <button type="submit">Enviar resposta</button>
          </form>
        )}
        <form action={addNoteAction.bind(null, slug, ticket.id, ticket.number)}>
          <label htmlFor="body">Nova nota interna (nunca visível ao cliente)</label>
          <textarea id="body" name="body" required maxLength={20000} rows={4} style={{ width: "100%" }} />
          <button type="submit">Adicionar nota</button>
        </form>
      </div>
    </>
  );
}
