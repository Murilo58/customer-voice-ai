import { notFound } from "next/navigation";
import { ForbiddenError } from "@/server/errors";
import { requireActor } from "@/server/identity/session";
import { listAudit } from "@/server/organizations/service";

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
      <h1>Auditoria</h1>
      <p className="muted">Últimos 100 eventos. Os filtros completos chegam com o RF-AUD-02.</p>
      <div className="card">
        <table>
          <thead>
            <tr><th>Data</th><th>Ação</th><th>Ator</th><th>Alvo</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.createdAt.toLocaleString("pt-BR")}</td>
                <td><code>{r.action}</code></td>
                <td>{r.actorType}</td>
                <td>{r.targetType ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
