import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { portalCsatAction, portalReplyAction } from "@/app/actions/portal";
import { AttachmentInput, AttachmentList } from "@/app/attachments";
import { ErrorAlert, param, Success, type SearchParams } from "@/app/components";
import { initials } from "@/app/ui/initials";
import { Card, PageHeader, StatusBadge } from "@/app/ui/primitives";
import { getPortalSession, getPortalTicket, PORTAL_COOKIE } from "@/server/portal/service";
import { CsatForm } from "../../csat-form";

const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function Message({ mine, author, at, children }: { mine: boolean; author: string; at: Date; children: React.ReactNode }) {
  return (
    <li className={`conv-msg ${mine ? "conv-customer_message" : "conv-public_reply"}`}>
      <span className={`avatar conv-avatar${mine ? " conv-avatar-customer" : ""}`} aria-hidden="true">{initials(author)}</span>
      <article className="conv-bubble">
        <header className="conv-head"><strong>{author}</strong><time dateTime={at.toISOString()}>{when.format(at)}</time></header>
        {children}
      </article>
    </li>
  );
}

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
  const closed = t.status === "resolved" || t.status === "closed";
  return (
    <>
      <PageHeader
        back={{ href: `/p/${slug}/chamados`, label: "Meus chamados" }}
        title={t.subject}
        meta={<><span>Protocolo {t.protocol}</span><StatusBadge status={t.status} /><span>Aberto em {when.format(t.createdAt)}</span></>}
      />
      <ErrorAlert code={param(sp, "erro")} />
      <Success show={param(sp, "avaliado") === "1"}>Obrigado pela avaliação!</Success>
      <Success show={param(sp, "continuacao") === "1"}>Seu chamado anterior já estava encerrado: abrimos este novo chamado com a sua mensagem.</Success>

      {t.canRate && (
        <Card title="Avalie o atendimento">
          <CsatForm action={portalCsatAction.bind(null, slug, t.number, t.ticketId, t.resolutionSeq)} />
        </Card>
      )}

      <Card title="Histórico">
        <ol className="conversation">
          <Message mine author="Você" at={t.createdAt}>
            <div className="prewrap conv-body">{t.description}</div>
            <AttachmentList items={t.openingAttachments} hrefBase={files} />
          </Message>
          {t.messages.map((m) => (
            <Message key={m.id} mine={m.fromCustomer} author={m.fromCustomer ? "Você" : "Atendimento"} at={m.createdAt}>
              <div className="prewrap conv-body">{m.body}</div>
              <AttachmentList items={m.attachments} hrefBase={files} />
            </Message>
          ))}
        </ol>
        {t.messages.length === 0 && <p className="muted portal-wait">Ainda não há respostas. Avisaremos por e-mail quando a equipe responder.</p>}
      </Card>

      {t.canReply && (
        <Card title={closed ? "Reabrir ou continuar o atendimento" : "Responder"}>
          <form action={portalReplyAction.bind(null, slug, t.number)}>
            <label htmlFor="body" className="sr-only">{closed ? "Escreva para reabrir ou continuar o atendimento" : "Responder"}</label>
            <textarea id="body" name="body" required maxLength={20000} rows={4} placeholder="Escreva sua mensagem…" />
            <AttachmentInput />
            <div className="portal-actions"><button type="submit" className="btn btn-primary">Enviar</button></div>
          </form>
        </Card>
      )}
      {t.rated && <p className="muted">Sua avaliação deste atendimento: {t.rated} de 5.</p>}
    </>
  );
}
