import { notFound } from "next/navigation";
import { decideQuarantineAction } from "@/app/actions/quarantine";
import { ErrorAlert, param, type SearchParams } from "@/app/components";
import { Badge, Card, Field, PageHeader, type Tone } from "@/app/ui/primitives";
import { QUARANTINE_REASON_LABEL } from "@/lib/labels";
import { getQuarantineItem } from "@/server/email/quarantine";
import { ForbiddenError } from "@/server/errors";
import { requireActor } from "@/server/identity/session";

const DECISION: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pendente", tone: "warn" },
  associated: { label: "Associada a um chamado", tone: "info" },
  new_ticket: { label: "Novo chamado criado", tone: "ok" },
  discarded: { label: "Descartada", tone: "neutral" },
};
const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

// Detalhe e decisão (RF-EML-08; CA-06.9). O conteúdo é exibido sanitizado (RN-19).
export default async function QuarantineItemPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: SearchParams }) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const { actor } = await requireActor(slug);
  const item = await getQuarantineItem(actor, id).catch((e) => {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  });
  if (!item) notFound();
  const m = item.inbound;
  const meta = (m.attachmentsMeta as { name: string; size: number }[]) ?? [];
  const decision = DECISION[item.status] ?? { label: item.status, tone: "neutral" as Tone };
  return (
    <>
      <PageHeader
        back={{ href: `/o/${slug}/quarentena`, label: "Quarentena" }}
        title={m.subject || "(sem assunto)"}
        meta={<><Badge tone={decision.tone}>{decision.label}</Badge><span>Recebida em {when.format(m.createdAt)}</span></>}
      />
      <ErrorAlert code={param(sp, "erro")} />
      <div className="detail-grid">
        <div className="detail-main">
          <Card title="Mensagem">
            <dl className="kv">
              <dt>De</dt><dd>{m.fromName ? `${m.fromName} ` : ""}&lt;{m.fromAddress}&gt;</dd>
              <dt>Motivo</dt><dd><strong>{QUARANTINE_REASON_LABEL[item.reason] ?? item.reason}</strong></dd>
              <dt>Autenticação</dt><dd>SPF {m.authSpf ?? "—"} · DKIM {m.authDkim ?? "—"} · DMARC {m.authDmarc ?? "—"}</dd>
              {item.linkedProtocol && <><dt>Chamado indicado</dt><dd>{item.linkedProtocol} <span className="muted">(pelo token do e-mail)</span></dd></>}
            </dl>
            <div className="prewrap quarantine-body">{m.bodyText}</div>
            {m.bodyHtmlSanitized && (
              <details className="panel-details">
                <summary>Ver HTML sanitizado (imagens remotas não são carregadas)</summary>
                <div className="email-html" dangerouslySetInnerHTML={{ __html: m.bodyHtmlSanitized }} />
              </details>
            )}
            {meta.length > 0 && <p className="panel-note">Anexos não processados: {meta.map((a) => a.name).join(", ")}</p>}
          </Card>
        </div>
        <aside className="detail-side" aria-label="Decisão">
          {item.status === "pending" ? (
            <Card title="Decisão">
              <form action={decideQuarantineAction.bind(null, slug, item.id)}>
                <fieldset className="choice-list">
                  <legend>Ação</legend>
                  <label className="check-row"><input type="radio" name="action" value="associate" required /> Associar a um chamado (como mensagem interna “remetente não verificado”)</label>
                  <label className="check-row"><input type="radio" name="action" value="new_ticket" /> Criar novo chamado para o remetente</label>
                  <label className="check-row"><input type="radio" name="action" value="discard" /> Descartar</label>
                </fieldset>
                <Field id="ticket_number" label="Número do chamado" hint="Só para associar.">
                  <input id="ticket_number" name="ticket_number" inputMode="numeric" pattern="[0-9]*" aria-describedby="ticket_number-hint" />
                </Field>
                <Field id="justification" label="Justificativa (obrigatória)" hint="Mínimo de 10 caracteres. Fica registrada na auditoria.">
                  <textarea id="justification" name="justification" required minLength={10} maxLength={1000} rows={3} aria-describedby="justification-hint" />
                </Field>
                <button type="submit" className="btn btn-primary btn-block">Registrar decisão</button>
              </form>
            </Card>
          ) : (
            <Card title="Decisão">
              <div className="panel-row"><span>Resultado</span><Badge tone={decision.tone}>{decision.label}</Badge></div>
              {item.decidedAt && <div className="panel-row"><span>Em</span><span>{when.format(item.decidedAt)}</span></div>}
              <p className="panel-note"><strong>Justificativa:</strong> {item.justification}</p>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
