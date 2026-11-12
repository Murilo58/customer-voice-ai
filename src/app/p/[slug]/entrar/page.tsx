import { requestMagicLinkAction } from "@/app/actions/portal";
import { ErrorAlert, param, Success, type SearchParams } from "@/app/components";
import { Turnstile } from "../../turnstile";

// Solicitação do link mágico (RF-POR-03). A resposta é a mesma com ou sem cadastro (sem enumeração).
export default async function PortalSignIn({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  return (
    <>
      <h1>Acompanhar meus chamados</h1>
      <ErrorAlert code={param(sp, "erro")} />
      <Success show={param(sp, "enviado") === "1"}>
        Se houver chamados para este e-mail, enviamos um link de acesso. Ele funciona uma única vez e expira em 15 minutos.
      </Success>
      <form className="card" action={requestMagicLinkAction.bind(null, slug)}>
        <label htmlFor="email">E-mail usado nos chamados</label>
        <input id="email" name="email" type="email" required maxLength={254} autoComplete="email" />
        <Turnstile />
        <button type="submit">Receber link de acesso</button>
      </form>
    </>
  );
}
