import Link from "next/link";
import { submitPortalTicketAction } from "@/app/actions/portal";
import { AttachmentInput } from "@/app/attachments";
import { ErrorAlert, param, Success, type SearchParams } from "@/app/components";
import { Turnstile } from "../turnstile";

// Formulário público (RF-POR-01; CA-05.1 a CA-05.4). A confirmação aparece sem esperar a triagem (CA-05.2).
export default async function PortalHome({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const protocol = param(sp, "protocolo");
  return (
    <>
      <h1>Fale com a gente</h1>
      <ErrorAlert code={param(sp, "erro")} />
      <Success show={!!protocol && /^[A-Z0-9]{2,10}-\d{6,}$/.test(protocol)}>
        Recebemos sua manifestação. Protocolo: <strong>{protocol}</strong>. Enviamos a confirmação para o seu e-mail.
      </Success>
      <p>Já abriu um chamado? <Link href={`/p/${slug}/entrar`}>Acompanhe seus chamados</Link>.</p>
      <form className="card" action={submitPortalTicketAction.bind(null, slug)}>
        <h2>Nova manifestação</h2>
        <label htmlFor="name">Nome</label>
        <input id="name" name="name" required minLength={2} maxLength={120} autoComplete="name" />
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" required maxLength={254} autoComplete="email" />
        <label htmlFor="subject">Assunto</label>
        <input id="subject" name="subject" required minLength={3} maxLength={200} />
        <label htmlFor="description">Descrição</label>
        <textarea id="description" name="description" required minLength={10} maxLength={20000} rows={6} aria-describedby="description-hint" />
        <p id="description-hint" className="muted">Não inclua senhas, números de cartão ou outros dados sensíveis.</p>
        <AttachmentInput />
        <Turnstile />
        <button type="submit">Enviar</button>
      </form>
    </>
  );
}
