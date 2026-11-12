import Link from "next/link";
import { notFound } from "next/navigation";
import { addNoteAction, publicReplyAction } from "@/app/actions/servicedesk";
import { AttachmentInput, AttachmentList } from "@/app/attachments";
import { ErrorAlert, param, type SearchParams } from "@/app/components";
import { Card, PageHeader, PriorityBadge, SlaBadge, StatusBadge } from "@/app/ui/primitives";
import { CHANNEL_LABEL, EMAIL_STATUS_LABEL, formatDuration, METRIC_LABEL, PRIORITY_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/lib/labels";
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
    const AUTO: Record<string, string> = {
      assumed: " (ao ser assumido)", replied: " (ao ser respondido)", customer_reply: " (resposta do cliente)", reopened_by_customer: " (reaberto pelo cliente)",
    };
    const why = d.auto ? (AUTO[d.auto] ?? " (automático)") : d.reason ? ` — motivo: ${d.reason}` : "";
    return `Status alterado de ${st(d.from ?? null)} para ${st(d.to ?? null)}${why}`;
  }
  if (item.type === "ticket.assigned") return d.to ? `Responsável: ${who(d.to)}${d.from ? ` (antes: ${who(d.from)})` : ""}` : `Responsável removido (antes: ${who(d.from)})`;
  if (item.type === "sla.risk") return `SLA em risco: ${METRIC_LABEL[d.metric ?? ""] ?? d.metric} (80% do prazo)`;
  if (item.type === "sla.breach") return `SLA violado: ${METRIC_LABEL[d.metric ?? ""] ?? d.metric}`;
  if (item.type === "ticket.team_changed") return `Equipe alterada de ${d.from ? who(d.from) : "nenhuma"} para ${d.to ? who(d.to) : "nenhuma"}`;
  if (item.type === "ticket.created") return `Chamado criado (canal ${CHANNEL_LABEL[d.channel as keyof typeof CHANNEL_LABEL] ?? d.channel})${d.parentTicketId ? " como continuação de um chamado encerrado" : ""}`;
  if (item.type === "ticket.follow_up_created") return `O cliente respondeu após o encerramento: novo chamado vinculado nº ${d.childNumber}`;
  if (item.type === "ticket.csat_received") return `Avaliação do cliente: ${d.score} de 5`;
  if (item.type === "ticket.quarantine_associated") return "Mensagem da quarentena associada (remetente não verificado)";
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
    <Card title="SLA">
      {metrics.length === 0 ? <p className="panel-note">Sem meta de SLA para a prioridade deste chamado.</p> : metrics.map((m) => (
        <div key={m.metric} className="sla-metric">
          <div className="sla-metric-head">
            <span>{METRIC_LABEL[m.metric]}</span>
            <SlaBadge state={m.state} />
          </div>
          {m.state === "met" || m.state === "met_late"
            ? <p>Usado {formatDuration(m.consumedSeconds)} de {formatDuration(m.targetSeconds)}</p>
            : LIVE_STATES.includes(m.state)
              ? <p>{(m.remainingSeconds ?? 0) < 0 ? <>Vencido há {formatDuration(-(m.remainingSeconds ?? 0))}</> : <>Restam {formatDuration(m.remainingSeconds)}</>} de {formatDuration(m.targetSeconds)}{m.dueAt && <> · prazo {m.dueAt.toLocaleString("pt-BR")}</>}</p>
              : null}
        </div>
      ))}
    </Card>
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
  const { ticket, timeline, names, openingAttachments, csat } = data;
  const files = `/o/${slug}/anexos`;
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
      <PageHeader
        back={{ href: `/o/${slug}/chamados`, label: "Chamados" }}
        title={<>{ticket.protocol} · {ticket.subject}</>}
        meta={
          <>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            <span>{CHANNEL_LABEL[ticket.channel]} · criado em {ticket.createdAt.toLocaleString("pt-BR")}</span>
          </>
        }
      />
      <ErrorAlert code={param(sp, "erro")} />
      <div className="detail-grid">
        <div className="detail-main">
          <div className="card">
            <h2>Descrição</h2>
            <p className="prewrap">{ticket.description}</p>
            <AttachmentList items={openingAttachments} hrefBase={files} />
            {ticket.parentTicketId && <p className="muted">Continuação de um chamado encerrado (CA-13.2).</p>}
          </div>
          <div className="card">
            <h2>Linha do tempo</h2>
            <ol className="timeline">
              {timeline.map((item) => (
                <li key={item.id}>
                  <span className="when">{item.at.toLocaleString("pt-BR")}</span>
                  {item.kind === "event" ? (
                    <div>{describeEvent(item, names)} <span className="muted">— {item.actorName ?? "Sistema"}</span></div>
                  ) : (
                    <div className={item.messageKind === "internal_note" ? "message-internal" : "message-public"}>
                      <strong>{MESSAGE_LABEL[item.messageKind] ?? item.messageKind}</strong> <span className="muted">— {item.author ?? (item.unverifiedSender ? "Remetente externo" : "Sistema")}{item.source === "email" ? " · por e-mail" : item.source === "portal" ? " · pelo portal" : ""}</span>
                      {item.unverifiedSender && <span className="badge">Remetente não verificado</span>}
                      {item.emailStatus && <span className="badge">{EMAIL_STATUS_LABEL[item.emailStatus] ?? item.emailStatus}</span>}
                      <div className="prewrap">{item.body}</div>
                      {item.html && (
                        <details>
                          <summary>Ver e-mail original (HTML sanitizado; imagens remotas não são carregadas)</summary>
                          {/* HTML sanitizado no recebimento (RN-19): sem scripts, formulários, iframes, estilos ou imagens remotas. */}
                          <div className="email-html" dangerouslySetInnerHTML={{ __html: item.html }} />
                        </details>
                      )}
                      <AttachmentList items={item.attachments} hrefBase={files} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
            {replyable && (
              <form className="composer" action={publicReplyAction.bind(null, slug, ticket.id, ticket.number)}>
                <label htmlFor="reply">Resposta pública (enviada por e-mail ao contato)</label>
                <textarea id="reply" name="body" required maxLength={20000} rows={4} />
                <AttachmentInput id="reply-attachments" />
                <button type="submit">Enviar resposta</button>
              </form>
            )}
            <form className="composer" action={addNoteAction.bind(null, slug, ticket.id, ticket.number)}>
              <label htmlFor="body">Nova nota interna (nunca visível ao cliente)</label>
              <textarea id="body" name="body" required maxLength={20000} rows={4} />
              <AttachmentInput id="note-attachments" />
              <button type="submit" className="secondary">Adicionar nota</button>
            </form>
          </div>
        </div>
        <aside className="detail-side" aria-label="Dados e ações do chamado">
          <div className="card">
            <h2>Contato</h2>
            <dl className="facts">
              <dt>Nome</dt>
              <dd><Link href={`/o/${slug}/contatos/${ticket.contact.id}`}>{ticket.contact.name}</Link></dd>
              <dt>E-mail</dt>
              <dd>{ticket.contact.email}</dd>
              {ticket.contact.company && (
                <>
                  <dt>Empresa</dt>
                  <dd><Link href={`/o/${slug}/empresas/${ticket.contact.company.id}`}>{ticket.contact.company.name}</Link></dd>
                </>
              )}
              <dt>Canal</dt>
              <dd>{CHANNEL_LABEL[ticket.channel]}</dd>
              <dt>Criado</dt>
              <dd>{ticket.createdAt.toLocaleString("pt-BR")}</dd>
              <dt>Atualizado</dt>
              <dd>{ticket.updatedAt.toLocaleString("pt-BR")}</dd>
            </dl>
          </div>
          <WorkflowPanel slug={slug} ticket={ticket} me={actor.membershipId} canAssign={canAssign} teamSuggested={teamSuggested} teams={teams} assignable={assignable} />
          {sla && <SlaPanel sla={sla} />}
          <TriagePanel
            slug={slug}
            ticket={ticket}
            view={view}
            categories={activeOr(taxonomy.categories, ticket.categoryId)}
            reasons={activeOr(taxonomy.reasons, ticket.reasonId)}
            canReprocess={can(actor.role, "triage.reprocess", actor.executiveRead)}
          />
          {csat.length > 0 && (
            <div className="card">
              <h2>Avaliação do cliente (CSAT)</h2>
              <ul>
                {csat.map((c) => (
                  <li key={c.resolutionSeq}>Resolução {c.resolutionSeq}: <strong>{c.score} de 5</strong>{c.comment && <> — “{c.comment}”</>} <span className="muted">({c.createdAt.toLocaleString("pt-BR")})</span></li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
