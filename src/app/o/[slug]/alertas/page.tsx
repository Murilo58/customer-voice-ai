import Link from "next/link";
import { markNotificationsReadAction } from "@/app/actions/sla";
import { formatProtocol, METRIC_LABEL } from "@/lib/labels";
import { requireActor } from "@/server/identity/session";
import { listNotifications } from "@/server/notifications/service";

function describe(type: string, data: Record<string, unknown>): string {
  const metric = METRIC_LABEL[String(data.metric)] ?? "";
  if (type === "sla.risk") return `SLA em risco (${metric}): 80% do prazo consumido`;
  if (type === "sla.breach") return `SLA violado (${metric})`;
  if (type.startsWith("ai.quota_")) return `Cota de IA de ${data.period}: ${data.used} de ${data.limit} operações (${type.endsWith("100") ? "100%" : "80%"})`;
  return type;
}

// Alertas in-app (RF-SLA-04, RF-CON-03): cada pessoa vê só os próprios.
export default async function AlertsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { actor } = await requireActor(slug);
  const { prefix, rows } = await listNotifications(actor);
  return (
    <>
      <h1>Alertas</h1>
      <div className="card">
        {rows.length === 0 ? <p className="muted">Nenhum alerta.</p> : (
          <>
            <form action={markNotificationsReadAction.bind(null, slug)}>
              <button type="submit" className="link">Marcar todos como lidos</button>
            </form>
            <ul>
              {rows.map((n) => (
                <li key={n.id} className={n.readAt ? undefined : "unread"}>
                  <span className="muted">{n.createdAt.toLocaleString("pt-BR")} · </span>
                  {describe(n.type, n.data as Record<string, unknown>)}
                  {n.ticket && <> · <Link href={`/o/${slug}/chamados/${n.ticket.number}`}>{formatProtocol(prefix, n.ticket.number)}</Link> {n.ticket.subject}</>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
