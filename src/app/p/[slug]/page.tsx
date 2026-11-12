import Link from "next/link";
import { submitPortalTicketAction } from "@/app/actions/portal";
import { AttachmentInput } from "@/app/attachments";
import { ErrorAlert, param, Success, type SearchParams } from "@/app/components";
import { Icon } from "@/app/ui/icons";
import { Card, Field } from "@/app/ui/primitives";
import { Turnstile } from "../turnstile";

// Formulário público (RF-POR-01; CA-05.1 a CA-05.4). A confirmação aparece sem esperar a triagem (CA-05.2).
export default async function PortalHome({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const protocol = param(sp, "protocolo");
  return (
    <>
      <div className="portal-hero">
        <h1>Fale com a gente</h1>
        <p>Conte o que aconteceu. Você recebe o protocolo na hora e as respostas chegam pelo e-mail informado.</p>
      </div>
      <ErrorAlert code={param(sp, "erro")} />
      <Success show={!!protocol && /^[A-Z0-9]{2,10}-\d{6,}$/.test(protocol)}>
        Recebemos sua manifestação. Protocolo: <strong>{protocol}</strong>. Enviamos a confirmação para o seu e-mail.
      </Success>
      <div className="portal-grid">
        <Card title="Nova manifestação">
          <form action={submitPortalTicketAction.bind(null, slug)}>
            <div className="form-2col">
              <Field id="name" label="Nome">
                <input id="name" name="name" required minLength={2} maxLength={120} autoComplete="name" />
              </Field>
              <Field id="email" label="E-mail">
                <input id="email" name="email" type="email" required maxLength={254} autoComplete="email" />
              </Field>
            </div>
            <Field id="subject" label="Assunto">
              <input id="subject" name="subject" required minLength={3} maxLength={200} />
            </Field>
            <Field id="description" label="Descrição" hint="Não inclua senhas, números de cartão ou outros dados sensíveis.">
              <textarea id="description" name="description" required minLength={10} maxLength={20000} rows={6} aria-describedby="description-hint" />
            </Field>
            <AttachmentInput />
            <Turnstile />
            <div className="portal-actions"><button type="submit" className="btn btn-primary">Enviar manifestação</button></div>
          </form>
        </Card>
        <aside className="portal-aside" aria-label="Acompanhamento">
          <Card title="Já abriu um chamado?">
            <p className="muted">Receba um link de acesso no seu e-mail para ver a situação, o histórico e responder.</p>
            <Link href={`/p/${slug}/entrar`} className="btn btn-secondary">Acompanhar meus chamados</Link>
          </Card>
          <ul className="portal-steps">
            <li><Icon name="mail" /><span><strong>Confirmação por e-mail</strong> com o número do protocolo.</span></li>
            <li><Icon name="inbox" /><span><strong>Respostas da equipe</strong> chegam no mesmo e-mail e ficam no portal.</span></li>
            <li><Icon name="check" /><span><strong>Avaliação</strong> do atendimento ao final.</span></li>
          </ul>
        </aside>
      </div>
    </>
  );
}
