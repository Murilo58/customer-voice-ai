import { notFound } from "next/navigation";
import { EmptyState, PageHeader, TableCard } from "@/app/ui/primitives";
import { ForbiddenError } from "@/server/errors";
import { requireActor } from "@/server/identity/session";
import { listAudit } from "@/server/organizations/service";

const ACTOR_LABEL: Record<string, string> = { user: "Usuário", contact: "Contato", system: "Sistema" };
const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" });

export default async function AuditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { actor } = await requireActor(slug);
  let rows: Awaited<ReturnType<typeof listAudit>>;
  try {
    rows = await listAudit(actor);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  return (
    <>
      <PageHeader title="Auditoria" meta="Últimos 100 eventos. Os filtros completos chegam com o RF-AUD-02." />
      <TableCard label="Eventos de auditoria (rolável)" empty={rows.length === 0 ? <EmptyState icon="log" title="Nenhum evento registrado" /> : undefined}>
        <thead>
          <tr><th scope="col">Data</th><th scope="col">Ação</th><th scope="col">Ator</th><th scope="col">Alvo</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="t-nowrap">{when.format(r.createdAt)}</td>
              <td><code>{r.action}</code></td>
              <td>{ACTOR_LABEL[r.actorType] ?? r.actorType}</td>
              <td>{r.targetType ?? <span className="muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </>
  );
}
