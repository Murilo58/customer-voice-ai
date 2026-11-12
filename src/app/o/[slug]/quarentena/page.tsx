import Link from "next/link";
import { notFound } from "next/navigation";
import { param, Success, type SearchParams } from "@/app/components";
import { EmptyState, PageHeader, TableCard } from "@/app/ui/primitives";
import { QUARANTINE_REASON_LABEL } from "@/lib/labels";
import { listQuarantine } from "@/server/email/quarantine";
import { ForbiddenError } from "@/server/errors";
import { requireActor } from "@/server/identity/session";

const STATUS_FILTER = { pendentes: "pending", associadas: "associated", "novos-chamados": "new_ticket", descartadas: "discarded" } as const;
const FILTER_LABEL: Record<keyof typeof STATUS_FILTER, string> = { pendentes: "Pendentes", associadas: "Associadas", "novos-chamados": "Novos chamados", descartadas: "Descartadas" };
const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

// Fila de quarentena (RF-EML-08): só Gestores e Administradores.
export default async function QuarantinePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { actor } = await requireActor(slug);
  const raw = param(sp, "situacao") ?? "pendentes";
  const filter = (raw in STATUS_FILTER ? raw : "pendentes") as keyof typeof STATUS_FILTER;
  const items = await listQuarantine(actor, STATUS_FILTER[filter]).catch((e) => {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  });
  return (
    <>
      <PageHeader
        title="Quarentena de e-mails"
        meta="Mensagens que não passaram na validação (RN-17). Não aparecem no chamado nem no portal e não geram notificações até uma decisão."
      />
      <Success show={param(sp, "ok") === "1"}>Decisão registrada.</Success>
      <nav className="view-tabs" aria-label="Situação">
        {(Object.keys(STATUS_FILTER) as (keyof typeof STATUS_FILTER)[]).map((k) => (
          <Link key={k} href={`/o/${slug}/quarentena?situacao=${k}`} aria-current={k === filter ? "page" : undefined}>{FILTER_LABEL[k]}</Link>
        ))}
      </nav>
      <TableCard
        label="Mensagens em quarentena (rolável)"
        empty={items.length === 0 ? <EmptyState icon="shield" title="Nenhuma mensagem">Não há mensagens nesta situação.</EmptyState> : undefined}
      >
        <thead><tr><th scope="col">Recebida</th><th scope="col">Remetente</th><th scope="col">Assunto</th><th scope="col">Motivo</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td className="t-nowrap">{when.format(i.inbound.createdAt)}</td>
              <td>{i.inbound.fromAddress}</td>
              <td className="t-subject"><Link href={`/o/${slug}/quarentena/${i.id}`}>{i.inbound.subject || "(sem assunto)"}</Link></td>
              <td>{QUARANTINE_REASON_LABEL[i.reason] ?? i.reason}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </>
  );
}
