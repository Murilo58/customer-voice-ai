import Link from "next/link";
import { markNotificationsReadAction } from "@/app/actions/sla";
import { Badge, btn, Card, EmptyState, PageHeader, type Tone } from "@/app/ui/primitives";
import { formatProtocol, METRIC_LABEL } from "@/lib/labels";
import { requireActor } from "@/server/identity/session";
import { listNotifications } from "@/server/notifications/service";

const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function describe(type: string, data: Record<string, unknown>): string {
  const metric = METRIC_LABEL[String(data.metric)] ?? "";
  if (type === "sla.risk") return `SLA em risco (${metric}): 80% do prazo consumido`;
  if (type === "sla.breach") return `SLA violado (${metric})`;
  if (type.startsWith("ai.quota_")) return `Cota de IA de ${data.period}: ${data.used} de ${data.limit} operações (${type.endsWith("100") ? "100%" : "80%"})`;
  return type;
}

function kind(type: string): { tone: Tone; label: string } {
  if (type === "sla.breach") return { tone: "danger", label: "SLA" };
  if (type === "sla.risk") return { tone: "warn", label: "SLA" };
  if (type.startsWith("ai.quota_")) return { tone: "ai", label: "IA" };
  return { tone: "neutral", label: "Aviso" };
}

// Alertas in-app (RF-SLA-04, RF-CON-03): cada pessoa vê só os próprios.
export default async function AlertsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { actor } = await requireActor(slug);
  const { prefix, rows } = await listNotifications(actor);
  const unread = rows.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader
        title="Alertas"
        meta={rows.length > 0 ? `${unread} não lido(s) de ${rows.length}` : undefined}
        actions={unread > 0 ? (
          <form action={markNotificationsReadAction.bind(null, slug)}>
            <button type="submit" className={btn("secondary", "sm")}>Marcar todos como lidos</button>
          </form>
        ) : undefined}
      />
      <Card className="table-card">
        {rows.length === 0 ? <EmptyState icon="bell" title="Nenhum alerta">Avisos de SLA e de cota de IA aparecem aqui.</EmptyState> : (
          <ul className="notice-list">
            {rows.map((n) => {
              const k = kind(n.type);
              return (
                <li key={n.id} className={`notice${n.readAt ? "" : " notice-unread"}`}>
                  <span className="notice-dot" aria-hidden="true" />
                  <div className="notice-body">
                    <p className="notice-text">
                      <Badge tone={k.tone}>{k.label}</Badge> {describe(n.type, n.data as Record<string, unknown>)}
                      {!n.readAt && <span className="sr-only"> (não lido)</span>}
                    </p>
                    {n.ticket && (
                      <p className="notice-ticket">
                        <Link href={`/o/${slug}/chamados/${n.ticket.number}`}>{formatProtocol(prefix, n.ticket.number)}</Link> · {n.ticket.subject}
                      </p>
                    )}
                  </div>
                  <time dateTime={n.createdAt.toISOString()}>{when.format(n.createdAt)}</time>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
