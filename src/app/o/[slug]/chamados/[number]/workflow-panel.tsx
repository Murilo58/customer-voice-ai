import { assignTicketAction, assumeTicketAction, changeStatusAction, setTicketTeamAction } from "@/app/actions/servicedesk";
import { Badge, btn, Card, Field, StatusBadge } from "@/app/ui/primitives";
import { STATUS_LABEL } from "@/lib/labels";
import type { TicketStatus } from "@/generated/prisma/client";
import { allowedTransitions } from "@/server/servicedesk/status";

interface Props {
  slug: string;
  ticket: {
    id: string; number: number; status: TicketStatus; cancelReason: string | null;
    team: { id: string; name: string; archivedAt: Date | null } | null;
    assignee: { id: string; user: { name: string } } | null;
  };
  me: string;
  canAssign: boolean;
  teamSuggested: boolean;
  teams: { id: string; name: string }[];
  /** Vínculos que podem receber o chamado (vazio sem permissão de atribuir) */
  assignable: { id: string; user: { name: string }; teamLinks: { teamId: string }[] }[];
}

const ACTION_LABEL: Partial<Record<TicketStatus, string>> = {
  open: "Abrir / reabrir",
  waiting_customer: "Aguardar cliente",
  waiting_third_party: "Aguardar terceiro",
  resolved: "Resolver",
};

// Ações de status (RN-05), atribuição e equipe (RF-ATD-06).
export function WorkflowPanel({ slug, ticket, me, canAssign, teamSuggested, teams, assignable }: Props) {
  const transitions = allowedTransitions(ticket.status).filter((t) => t !== "cancelled");
  const canCancel = allowedTransitions(ticket.status).includes("cancelled");
  const active = !["resolved", "closed", "cancelled"].includes(ticket.status);
  const candidates = ticket.team ? assignable.filter((m) => m.teamLinks.some((l) => l.teamId === ticket.team!.id)) : assignable;
  const statusAction = changeStatusAction.bind(null, slug, ticket.id, ticket.number);
  return (
    <Card title="Atendimento">
      <div className="panel-row">
        <span>Status</span>
        <StatusBadge status={ticket.status} />
      </div>
      {ticket.status === "cancelled" && ticket.cancelReason && <p className="panel-note">Motivo do cancelamento: {ticket.cancelReason}</p>}
      <div className="panel-row">
        <span>Equipe</span>
        <span className="tags">
          {ticket.team ? <>{ticket.team.name}{ticket.team.archivedAt && " (arquivada)"}</> : <span className="muted">Sem equipe</span>}
          {teamSuggested && <Badge tone="ai">Sugestão da IA</Badge>}
        </span>
      </div>
      <div className="panel-row">
        <span>Responsável</span>
        <span>{ticket.assignee?.user.name ?? <span className="muted">Sem responsável</span>}</span>
      </div>

      {(transitions.length > 0 || (active && ticket.assignee?.id !== me)) && (
        <div className="panel-section">
          <div className="btn-row">
            {active && ticket.assignee?.id !== me && (
              <form action={assumeTicketAction.bind(null, slug, ticket.id, ticket.number)}>
                <button type="submit" className={btn("primary", "sm")}>Assumir</button>
              </form>
            )}
            {transitions.map((t) => (
              <form key={t} action={statusAction}>
                <input type="hidden" name="status" value={t} />
                <button type="submit" className={btn(t === "resolved" && ticket.assignee?.id === me ? "primary" : "secondary", "sm")}>{ACTION_LABEL[t] ?? STATUS_LABEL[t]}</button>
              </form>
            ))}
          </div>
        </div>
      )}

      {canAssign && active && (
        <div className="panel-section">
          <form action={setTicketTeamAction.bind(null, slug, ticket.id, ticket.number)}>
            <Field id="team_id" label="Equipe">
              <div className="inline-form">
                <select id="team_id" name="team_id" defaultValue={ticket.team && !ticket.team.archivedAt ? ticket.team.id : ""}>
                  <option value="">Sem equipe</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button type="submit" className={btn("secondary", "sm")}>{teamSuggested ? "Confirmar" : "Alterar"}</button>
              </div>
            </Field>
          </form>
          <form action={assignTicketAction.bind(null, slug, ticket.id, ticket.number)} className="panel-gap">
            <Field id="membership_id" label="Responsável">
              <div className="inline-form">
                <select id="membership_id" name="membership_id" defaultValue={ticket.assignee?.id ?? ""}>
                  <option value="">Sem responsável</option>
                  {candidates.map((m) => <option key={m.id} value={m.id}>{m.user.name}</option>)}
                </select>
                <button type="submit" className={btn("secondary", "sm")}>Atribuir</button>
              </div>
            </Field>
          </form>
        </div>
      )}

      {canCancel && (
        <details className="panel-details">
          <summary>Cancelar chamado</summary>
          <form action={statusAction}>
            <input type="hidden" name="status" value="cancelled" />
            <Field id="reason" label="Motivo (obrigatório)" hint="Mínimo de 5 caracteres. Fica registrado na linha do tempo.">
              <input id="reason" name="reason" required minLength={5} maxLength={500} aria-describedby="reason-hint" />
            </Field>
            <button type="submit" className={`${btn("danger", "sm")} mt-2`}>Confirmar cancelamento</button>
          </form>
        </details>
      )}
    </Card>
  );
}
