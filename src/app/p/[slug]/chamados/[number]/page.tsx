import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { portalCsatAction, portalReplyAction } from "@/app/actions/portal";
import { AttachmentInput, AttachmentList } from "@/app/attachments";
import { ErrorAlert, param, Success, type SearchParams } from "@/app/components";
import { STATUS_LABEL } from "@/lib/labels";
import { getPortalSession, getPortalTicket, PORTAL_COOKIE } from "@/server/portal/service";
import { CsatForm } from "../../csat-form";

// Chamado no portal (RF-POR-04, RF-POR-05; CA-07.2): status, histórico público, resposta, anexos e avaliação.
// Nunca exibe notas internas, triagem, eventos internos nem mensagens em quarentena.
export default async function PortalTicket({ params, searchParams }: { params: Promise<{ slug: string; number: string }>; searchParams: SearchParams }) {
  const { slug, number: raw } = await params;
  const sp = await searchParams;
  const session = await getPortalSession(slug, (await cookies()).get(PORTAL_COOKIE)?.value);
  if (!session) redirect(`/p/${slug}/entrar`);
  const t = await getPortalTicket(session, Number(raw));
  if (!t) notFound();
  const files = `/p/${slug}/anexos`;
  return (
    <>
      <p><Link href={`/p/${slug}/chamados`}>← Meus chamados</Link></p>
      <h1>{t.protocol} · {t.subject}</h1>
      <ErrorAlert code={param(sp, "erro")} />
      <Success show={param(sp, "avaliado") === "1"}>Obrigado pela avaliação!</Success>
      <Success show={param(sp, "continuacao") === "1"}>Seu chamado anterior já estava encerrado: abrimos este novo chamado com a sua mensagem.</Success>
      <div className="card">
        <p>Situação: <strong>{STATUS_LABEL[t.status]}</strong> · Aberto em {t.createdAt.toLocaleString("pt-BR")}</p>
        <h2>Sua manifestação</h2>
        <p style={{ whiteSpace: "pre-wrap" }}>{t.description}</p>
        <AttachmentList items={t.openingAttachments} hrefBase={files} />
      </div>
      <div className="card">
        <h2>Histórico</h2>
        {t.messages.length === 0 ? <p className="muted">Ainda não há respostas.</p> : t.messages.map((m) => (
          <div key={m.id} className={`portal-msg${m.fromCustomer ? " customer" : ""}`}>
            <strong>{m.fromCustomer ? "Você" : "Atendimento"}</strong> <span className="muted">· {m.createdAt.toLocaleString("pt-BR")}</span>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
            <AttachmentList items={m.attachments} hrefBase={files} />
          </div>
        ))}
        {t.canReply && (
          <form action={portalReplyAction.bind(null, slug, t.number)}>
            <label htmlFor="body">{t.status === "resolved" || t.status === "closed" ? "Escreva para reabrir ou continuar o atendimento" : "Responder"}</label>
            <textarea id="body" name="body" required maxLength={20000} rows={4} />
            <AttachmentInput />
            <button type="submit">Enviar</button>
          </form>
        )}
      </div>
      {t.canRate && (
        <div className="card">
          <h2>Avalie o atendimento</h2>
          <CsatForm action={portalCsatAction.bind(null, slug, t.number, t.ticketId, t.resolutionSeq)} />
        </div>
      )}
      {t.rated && <p className="muted">Sua avaliação deste atendimento: {t.rated} de 5.</p>}
    </>
  );
}
