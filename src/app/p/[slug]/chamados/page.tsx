import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logoutPortalAction } from "@/app/actions/portal";
import { btn, ButtonLink, EmptyState, PageHeader, StatusBadge } from "@/app/ui/primitives";
import { getPortalSession, listPortalTickets, PORTAL_COOKIE } from "@/server/portal/service";

const day = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

// Chamados do contato (RF-POR-04; CA-07.2).
export default async function PortalTickets({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getPortalSession(slug, (await cookies()).get(PORTAL_COOKIE)?.value);
  if (!session) redirect(`/p/${slug}/entrar`);
  const tickets = await listPortalTickets(session);
  return (
    <>
      <PageHeader
        title="Meus chamados"
        meta={<>{session.contact.name} · {session.contact.email}</>}
        actions={
          <form action={logoutPortalAction.bind(null, slug)}>
            <button type="submit" className={btn("secondary", "sm")}>Sair</button>
          </form>
        }
      />
      {tickets.length === 0 ? (
        <section className="card">
          <EmptyState title="Nenhum chamado encontrado" action={<ButtonLink href={`/p/${slug}`} icon="plus">Nova manifestação</ButtonLink>}>
            Os chamados abertos com este e-mail aparecem aqui.
          </EmptyState>
        </section>
      ) : (
        <section className="card table-card" aria-label="Lista de chamados">
          <ul className="portal-tickets">
            {tickets.map((t) => (
              <li key={t.number}>
                <Link href={`/p/${slug}/chamados/${t.number}`} className="ticket-card">
                  <span className="ticket-card-top"><span>{t.protocol}</span><span>Aberto em {day.format(t.createdAt)}</span></span>
                  <strong>{t.subject}</strong>
                  <StatusBadge status={t.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
