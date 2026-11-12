import Link from "next/link";
import { notFound } from "next/navigation";
import { decideQuarantineAction } from "@/app/actions/quarantine";
import { ErrorAlert, param, type SearchParams } from "@/app/components";
import { QUARANTINE_REASON_LABEL } from "@/lib/labels";
import { getQuarantineItem } from "@/server/email/quarantine";
import { ForbiddenError } from "@/server/errors";
import { requireActor } from "@/server/identity/session";

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
  return (
    <>
      <p><Link href={`/o/${slug}/quarentena`}>← Quarentena</Link></p>
      <h1>{m.subject || "(sem assunto)"}</h1>
      <ErrorAlert code={param(sp, "erro")} />
      <div className="card">
        <p>De: {m.fromName ? `${m.fromName} ` : ""}&lt;{m.fromAddress}&gt; · Recebida em {m.createdAt.toLocaleString("pt-BR")}</p>
        <p>Motivo: <strong>{QUARANTINE_REASON_LABEL[item.reason] ?? item.reason}</strong></p>
        <p className="muted">Autenticação do remetente: SPF {m.authSpf ?? "—"} · DKIM {m.authDkim ?? "—"} · DMARC {m.authDmarc ?? "—"}</p>
        {item.linkedProtocol && <p>Chamado indicado pelo token: {item.linkedProtocol}</p>}
        <div style={{ whiteSpace: "pre-wrap" }}>{m.bodyText}</div>
        {m.bodyHtmlSanitized && (
          <details>
            <summary>Ver HTML sanitizado (imagens remotas não são carregadas)</summary>
            <div className="email-html" dangerouslySetInnerHTML={{ __html: m.bodyHtmlSanitized }} />
          </details>
        )}
        {meta.length > 0 && <p className="muted">Anexos não processados: {meta.map((a) => a.name).join(", ")}</p>}
      </div>
      {item.status === "pending" ? (
        <form className="card" action={decideQuarantineAction.bind(null, slug, item.id)}>
          <h2>Decisão</h2>
          <fieldset className="scale">
            <legend>Ação</legend>
            <label><input type="radio" name="action" value="associate" required /> Associar a um chamado (como mensagem interna “remetente não verificado”)</label>
            <label><input type="radio" name="action" value="new_ticket" /> Criar novo chamado para o remetente</label>
            <label><input type="radio" name="action" value="discard" /> Descartar</label>
          </fieldset>
          <label htmlFor="ticket_number">Número do chamado (só para associar)</label>
          <input id="ticket_number" name="ticket_number" inputMode="numeric" pattern="[0-9]*" />
          <label htmlFor="justification">Justificativa (obrigatória)</label>
          <textarea id="justification" name="justification" required minLength={10} maxLength={1000} rows={3} />
          <button type="submit">Registrar decisão</button>
        </form>
      ) : (
        <div className="card"><p>Decisão: {item.status} em {item.decidedAt?.toLocaleString("pt-BR")}. Justificativa: {item.justification}</p></div>
      )}
    </>
  );
}
