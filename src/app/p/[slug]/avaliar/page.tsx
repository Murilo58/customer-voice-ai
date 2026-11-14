import { linkCsatAction } from "@/app/actions/portal";
import { ErrorAlert, param, Success, type SearchParams } from "@/app/components";
import { csatLinkInfo } from "@/server/portal/service";
import { CsatForm } from "../csat-form";

// Avaliação pelo link do e-mail de resolução (RF-POR-05; CA-13.1): link assinado por chamado e resolução.
export default async function CsatByLink({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ticketId = param(sp, "t") ?? "";
  const seq = Number(param(sp, "r"));
  const signature = param(sp, "s") ?? "";
  const info = await csatLinkInfo(slug, ticketId, seq, signature);
  return (
    <section className="card portal-narrow">
      <h1>Avaliação do atendimento</h1>
      {info && <p className="muted">Chamado {info.protocol}</p>}
      <ErrorAlert code={param(sp, "erro") ?? (info ? undefined : "csat_invalid")} />
      <Success show={param(sp, "avaliado") === "1"}>Obrigado pela avaliação!</Success>
      {info && (info.available ? <CsatForm action={linkCsatAction.bind(null, slug, ticketId, seq, signature)} />
        : info.rated ? <p>Avaliação registrada: {info.rated} de 5.</p>
        : <p className="muted">A avaliação não está disponível para este chamado no momento.</p>)}
    </section>
  );
}
