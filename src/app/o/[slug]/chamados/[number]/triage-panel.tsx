import { confirmAllAction, reprocessAction, setFieldAction } from "@/app/actions/triage";
import { PRIORITY_LABEL, SENTIMENT_LABEL, TRIAGE_STATE_LABEL, TYPE_LABEL } from "@/lib/labels";
import type { ReviewableField } from "@/server/ai/triage";
import type { getTriageView } from "@/server/servicedesk/triage-review";

type View = Awaited<ReturnType<typeof getTriageView>>;
interface Option { id: string; name: string }

interface Props {
  slug: string;
  ticket: {
    id: string; number: number; triageState: keyof typeof TRIAGE_STATE_LABEL; type: string | null; priority: string;
    categoryId: string | null; reasonId: string | null; sentiment: string | null; escalationRisk: boolean;
  };
  view: View;
  categories: Option[];
  reasons: Option[];
  canReprocess: boolean;
}

const FIELD_LABEL: Record<ReviewableField, string> = { type: "Tipo", category: "Categoria", reason: "Motivo", priority: "Prioridade" };

export function TriagePanel({ slug, ticket, view, categories, reasons, canReprocess }: Props) {
  const pending = new Map((view.run?.reviews ?? []).filter((r) => r.outcome === "pending").map((r) => [r.field, r]));
  const result = (view.run?.result ?? null) as { rationale?: string; risk_signals?: string[]; priority_rules?: string[] } | null;
  const options: Record<ReviewableField, { value: string; label: string }[]> = {
    type: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
    category: categories.map((c) => ({ value: c.id, label: c.name })),
    reason: reasons.map((r) => ({ value: r.id, label: r.name })),
    priority: Object.entries(PRIORITY_LABEL).map(([value, label]) => ({ value, label })),
  };
  const current: Record<ReviewableField, string | null> = { type: ticket.type, category: ticket.categoryId, reason: ticket.reasonId, priority: ticket.priority };
  return (
    <div className="card">
      <h2>Classificação</h2>
      <p>
        Triagem: <strong>{TRIAGE_STATE_LABEL[ticket.triageState]}</strong>
        {view.run && <span className="muted"> · modelo {view.run.model}, prompt {view.run.promptVersion}</span>}
      </p>
      {ticket.triageState === "unavailable" && <p className="muted">Triagem indisponível: classifique manualmente; o atendimento segue normalmente.</p>}
      {(ticket.sentiment || ticket.escalationRisk) && (
        <p>
          {ticket.sentiment && <>Sentimento: {SENTIMENT_LABEL[ticket.sentiment as keyof typeof SENTIMENT_LABEL]} · </>}
          Risco de escalada: {ticket.escalationRisk ? <strong>sim</strong> : "não"}
          {result?.risk_signals?.length ? <> ({result.risk_signals.join(", ")})</> : null}
        </p>
      )}
      {/* Justificativa da IA exibida como texto puro (CA-08.4) */}
      {result?.rationale && <p><span className="muted">Justificativa da IA:</span> {result.rationale}</p>}
      <table>
        <tbody>
          {(Object.keys(FIELD_LABEL) as ReviewableField[]).map((f) => (
            <tr key={f}>
              <th>
                {FIELD_LABEL[f]} {pending.has(f) && <span className="badge">sugestão da IA</span>}
              </th>
              <td>
                <form action={setFieldAction.bind(null, slug, ticket.id, ticket.number, f)}>
                  <select name="value" defaultValue={current[f] ?? ""} aria-label={FIELD_LABEL[f]}>
                    <option value="" disabled>Sem valor</option>
                    {options[f].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>{" "}
                  <button type="submit" className="link">{pending.has(f) ? "confirmar/alterar" : "salvar"}</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {pending.size > 0 && (
        <form action={confirmAllAction.bind(null, slug, ticket.id, ticket.number)}>
          <button type="submit">Confirmar todas as sugestões</button>
        </form>
      )}
      {canReprocess && (
        <details>
          <summary>Reprocessar triagem</summary>
          <form action={reprocessAction.bind(null, slug, ticket.id, ticket.number)}>
            <label><input type="checkbox" name="force" value="1" /> Forçar (consome cota e é auditado)</label>
            <label htmlFor="reason">Justificativa (obrigatória para forçar)</label>
            <input id="reason" name="reason" maxLength={500} />
            <button type="submit">Solicitar reprocessamento</button>
          </form>
        </details>
      )}
    </div>
  );
}
