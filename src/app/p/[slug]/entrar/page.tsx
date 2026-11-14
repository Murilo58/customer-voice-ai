import Link from "next/link";
import { requestMagicLinkAction } from "@/app/actions/portal";
import { ErrorAlert, param, Success, type SearchParams } from "@/app/components";
import { Field } from "@/app/ui/primitives";
import { Turnstile } from "../../turnstile";

// Solicitação do link mágico (RF-POR-03). A resposta é a mesma com ou sem cadastro (sem enumeração).
export default async function PortalSignIn({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  return (
    <section className="card portal-narrow">
      <h1>Acompanhar meus chamados</h1>
      <p className="muted">Informe o e-mail usado ao abrir o chamado. Enviaremos um link de acesso, sem senha.</p>
      <ErrorAlert code={param(sp, "erro")} />
      <Success show={param(sp, "enviado") === "1"}>
        Se houver chamados para este e-mail, enviamos um link de acesso. Ele funciona uma única vez e expira em 15 minutos.
      </Success>
      <form action={requestMagicLinkAction.bind(null, slug)}>
        <Field id="email" label="E-mail usado nos chamados">
          <input id="email" name="email" type="email" required maxLength={254} autoComplete="email" />
        </Field>
        <Turnstile />
        <button type="submit" className="btn btn-primary btn-block">Receber link de acesso</button>
      </form>
      <p className="portal-foot-note">Ainda não abriu um chamado? <Link href={`/p/${slug}`}>Enviar uma manifestação</Link>.</p>
    </section>
  );
}
