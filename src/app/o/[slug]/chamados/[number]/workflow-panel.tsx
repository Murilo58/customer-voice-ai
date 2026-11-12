import { assignTicketAction, assumeTicketAction, changeStatusAction, setTicketTeamAction } from "@/app/actions/servicedesk";
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
  const transitions = allowedTransitions(ticket.status);
  const active = !["resolved", "closed", "cancelled"].includes(ticket.status);
  const candidates = ticket.team ? assignable.filter((m) => m.teamLinks.some((l) => l.teamId === ticket.team!.id)) : assignable;
  return (
    <div className="card">
      <h2>Atendimento</h2>
      <p>
        Status: <strong>{STATUS_LABEL[ticket.status]}</strong>
        {ticket.status === "cancelled" && ticket.cancelReason && <span className="muted"> · motivo: {ticket.cancelReason}</span>}
      </p>
      <div className="row-actions">
        {transitions.filter((t) => t !== "cancelled").map((t) => (
          <form key={t} action={changeStatusAction.bind(null, slug, ticket.id, ticket.number)} className="inline">
            <input type="hidden" name="status" value={t} />
            <button type="submit">{ACTION_LABEL[t] ?? STATUS_LABEL[t]}</button>
          </form>
        ))}
      </div>
      {transitions.includes("cancelled") && (
        <details>
          <summary>Cancelar chamado</summary>
          <form action={changeStatusAction.bind(null, slug, ticket.id, ticket.number)}>
            <input type="hidden" name="status" value="cancelled" />
            <label htmlFor="reason">Motivo (obrigatório)</label>
            <input id="reason" name="reason" required minLength={5} maxLength={500} />
            <button type="submit">Confirmar cancelamento</button>
          </form>
        </details>
      )}
      <p>
        Equipe: {ticket.team ? <>{ticket.team.name}{ticket.team.archivedAt && " (arquivada)"}</> : "—"} {teamSuggested && <span className="badge">sugestão da IA</span>}
        {" · "}Responsável: {ticket.assignee?.user.name ?? "—"}
      </p>
      {active && ticket.assignee?.id !== me && (
        <form action={assumeTicketAction.bind(null, slug, ticket.id, ticket.number)} className="inline">
          <button type="submit">Assumir</button>
        </form>
      )}
      {canAssign && active && (
        <>
          <form action={setTicketTeamAction.bind(null, slug, ticket.id, ticket.number)}>
            <label htmlFor="team_id">Equipe</label>
            <select id="team_id" name="team_id" defaultValue={ticket.team && !ticket.team.archivedAt ? ticket.team.id : ""}>
              <option value="">Sem equipe</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>{" "}
            <button type="submit">{teamSuggested ? "Confirmar equipe" : "Alterar equipe"}</button>
          </form>
          <form action={assignTicketAction.bind(null, slug, ticket.id, ticket.number)}>
            <label htmlFor="membership_id">Responsável</label>
            <select id="membership_id" name="membership_id" defaultValue={ticket.assignee?.id ?? ""}>
              <option value="">Sem responsável</option>
              {candidates.map((m) => <option key={m.id} value={m.id}>{m.user.name}</option>)}
            </select>{" "}
            <button type="submit">Atribuir</button>
          </form>
        </>
      )}
    </div>
  );
}
