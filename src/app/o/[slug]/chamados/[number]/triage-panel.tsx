import { confirmAllAction, reprocessAction, setFieldAction } from "@/app/actions/triage";
import { Badge, btn, Card, Field } from "@/app/ui/primitives";
import { PRIORITY_LABEL, RISK_SIGNAL_LABEL, SENTIMENT_LABEL, TRIAGE_STATE_LABEL, TYPE_LABEL, URGENCY_LABEL } from "@/lib/labels";
import { TriageRefresh } from "./triage-refresh";
import type { ReviewableField } from "@/server/ai/triage";
import type { getTriageView } from "@/server/servicedesk/triage-review";
import type { Tone } from "@/app/ui/primitives";

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
const UNAVAILABLE_REASON: Record<string, string> = {
  ai_disabled: "A triagem por IA está desativada nesta organização (um Administrador ativa em Configurações → Triagem por IA).",
  quota_exhausted: "A cota mensal de IA da organização foi atingida.",
  global_budget: "O teto mensal de gastos com IA da plataforma foi atingido.",
};
const TRIAGE_TONE: Record<keyof typeof TRIAGE_STATE_LABEL, Tone> = { pending: "neutral", suggested: "ai", reviewed: "ok", unavailable: "warn" };

export function TriagePanel({ slug, ticket, view, categories, reasons, canReprocess }: Props) {
  const pending = new Map((view.run?.reviews ?? []).filter((r) => r.outcome === "pending").map((r) => [r.field, r]));
  const result = (view.run?.result ?? null) as { rationale?: string; risk_signals?: string[]; priority_rules?: string[]; urgency?: string } | null;
  const options: Record<ReviewableField, { value: string; label: string }[]> = {
    type: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
    category: categories.map((c) => ({ value: c.id, label: c.name })),
    reason: reasons.map((r) => ({ value: r.id, label: r.name })),
    priority: Object.entries(PRIORITY_LABEL).map(([value, label]) => ({ value, label })),
  };
  const current: Record<ReviewableField, string | null> = { type: ticket.type, category: ticket.categoryId, reason: ticket.reasonId, priority: ticket.priority };
  return (
    <Card title="Classificação">
      <div className="panel-row">
        <span>Triagem</span>
        <Badge tone={TRIAGE_TONE[ticket.triageState]}>{TRIAGE_STATE_LABEL[ticket.triageState]}</Badge>
      </div>
      {view.run && <p className="panel-note">Modelo {view.run.model}, prompt {view.run.promptVersion}</p>}
      {ticket.triageState === "pending" && <TriageRefresh />}
      {ticket.triageState === "unavailable" && (
        <p className="panel-note">
          {UNAVAILABLE_REASON[view.unavailableReason ?? ""] ?? "A IA não conseguiu classificar este chamado."} Classifique manualmente; o atendimento segue normalmente.
          {view.run && " Abaixo, a última classificação feita pela IA."}
        </p>
      )}
      {result?.urgency && (
        <div className="panel-row">
          <span>Urgência</span>
          <span>{URGENCY_LABEL[result.urgency] ?? result.urgency}</span>
        </div>
      )}
      {ticket.sentiment && (
        <div className="panel-row">
          <span>Sentimento</span>
          <span>{SENTIMENT_LABEL[ticket.sentiment as keyof typeof SENTIMENT_LABEL]}</span>
        </div>
      )}
      {(ticket.sentiment || ticket.escalationRisk) && (
        <div className="panel-row">
          <span>Risco de escalada</span>
          {ticket.escalationRisk ? <Badge tone="danger">Sim</Badge> : <span>Não</span>}
        </div>
      )}
      {ticket.escalationRisk && result?.risk_signals?.length ? <p className="panel-note">Sinais: {result.risk_signals.map((s) => RISK_SIGNAL_LABEL[s] ?? s).join(", ")}</p> : null}
      {/* Justificativa da IA exibida como texto puro (CA-08.4) */}
      {result?.rationale && <p className="panel-note"><strong>Justificativa da IA:</strong> {result.rationale}</p>}

      <div className="panel-section">
        {(Object.keys(FIELD_LABEL) as ReviewableField[]).map((f) => (
          <form key={f} className="triage-field" action={setFieldAction.bind(null, slug, ticket.id, ticket.number, f)}>
            <label className="triage-field-label" htmlFor={`triage-${f}`}>
              {FIELD_LABEL[f]} {pending.has(f) && <Badge tone="ai">Sugestão da IA</Badge>}
            </label>
            <div className="inline-form">
              {/* key: recria o select quando o valor muda (ex.: sugestão chegando na atualização automática), pois defaultValue só vale na montagem */}
              <select key={current[f] ?? ""} id={`triage-${f}`} name="value" defaultValue={current[f] ?? ""}>
                <option value="" disabled>Sem valor</option>
                {options[f].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button type="submit" className={btn(pending.has(f) ? "secondary" : "ghost", "sm")} aria-label={`${pending.has(f) ? "Confirmar ou alterar" : "Salvar"} ${FIELD_LABEL[f].toLowerCase()}`}>
                {pending.has(f) ? "Confirmar" : "Salvar"}
              </button>
            </div>
          </form>
        ))}
        {pending.size > 0 && (
          <form action={confirmAllAction.bind(null, slug, ticket.id, ticket.number)} className="panel-gap">
            <button type="submit" className={btn("primary", "sm")}>Confirmar todas as sugestões</button>
          </form>
        )}
      </div>

      {canReprocess && (
        <details className="panel-details">
          <summary>Reprocessar triagem</summary>
          <form action={reprocessAction.bind(null, slug, ticket.id, ticket.number)}>
            <label className="check-row"><input type="checkbox" name="force" value="1" /> Forçar (consome cota e é auditado)</label>
            <Field id="reprocess_reason" label="Justificativa" hint="Obrigatória para forçar.">
              <input id="reprocess_reason" name="reason" maxLength={500} aria-describedby="reprocess_reason-hint" />
            </Field>
            <button type="submit" className={`${btn("secondary", "sm")} mt-2`}>Solicitar reprocessamento</button>
          </form>
        </details>
      )}
    </Card>
  );
}
