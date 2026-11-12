import Link from "next/link";
import { notFound } from "next/navigation";
import { param, Success, type SearchParams } from "@/app/components";
import { QUARANTINE_REASON_LABEL } from "@/lib/labels";
import { listQuarantine } from "@/server/email/quarantine";
import { ForbiddenError } from "@/server/errors";
import { requireActor } from "@/server/identity/session";

const STATUS_FILTER = { pendentes: "pending", associadas: "associated", "novos-chamados": "new_ticket", descartadas: "discarded" } as const;

// Fila de quarentena (RF-EML-08): só Gestores e Administradores.
export default async function QuarantinePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { actor } = await requireActor(slug);
  const filter = (param(sp, "situacao") ?? "pendentes") as keyof typeof STATUS_FILTER;
  const items = await listQuarantine(actor, STATUS_FILTER[filter] ?? "pending").catch((e) => {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  });
  return (
    <>
      <h1>Quarentena de e-mails</h1>
      <Success show={param(sp, "ok") === "1"}>Decisão registrada.</Success>
      <p className="muted">
        Mensagens recebidas que não passaram na validação (RN-17). Não aparecem no chamado nem no portal e não geram notificações até uma decisão.
      </p>
      <p>
        {Object.keys(STATUS_FILTER).map((k) => (
          <Link key={k} href={`/o/${slug}/quarentena?situacao=${k}`} style={{ marginRight: 12, fontWeight: k === filter ? 700 : 400 }}>{k}</Link>
        ))}
      </p>
      <div className="card">
        {items.length === 0 ? <p className="muted">Nenhuma mensagem.</p> : (
          <table>
            <thead><tr><th scope="col">Recebida</th><th scope="col">Remetente</th><th scope="col">Assunto</th><th scope="col">Motivo</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>{i.inbound.createdAt.toLocaleString("pt-BR")}</td>
                  <td>{i.inbound.fromAddress}</td>
                  <td><Link href={`/o/${slug}/quarentena/${i.id}`}>{i.inbound.subject || "(sem assunto)"}</Link></td>
                  <td>{QUARANTINE_REASON_LABEL[i.reason] ?? i.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
