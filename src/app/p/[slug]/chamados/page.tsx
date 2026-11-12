import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logoutPortalAction } from "@/app/actions/portal";
import { STATUS_LABEL } from "@/lib/labels";
import { getPortalSession, listPortalTickets, PORTAL_COOKIE } from "@/server/portal/service";

// Chamados do contato (RF-POR-04; CA-07.2).
export default async function PortalTickets({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getPortalSession(slug, (await cookies()).get(PORTAL_COOKIE)?.value);
  if (!session) redirect(`/p/${slug}/entrar`);
  const tickets = await listPortalTickets(session);
  return (
    <>
      <h1>Meus chamados</h1>
      <div className="muted">
        {session.contact.name} ({session.contact.email}){" "}
        <form action={logoutPortalAction.bind(null, slug)} style={{ display: "inline" }}><button type="submit" className="link">Sair</button></form>
      </div>
      <div className="card">
        {tickets.length === 0 ? <p className="muted">Nenhum chamado encontrado.</p> : (
          <table>
            <thead><tr><th scope="col">Protocolo</th><th scope="col">Assunto</th><th scope="col">Situação</th><th scope="col">Aberto em</th></tr></thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.number}>
                  <td><Link href={`/p/${slug}/chamados/${t.number}`}>{t.protocol}</Link></td>
                  <td>{t.subject}</td>
                  <td>{STATUS_LABEL[t.status]}</td>
                  <td>{t.createdAt.toLocaleDateString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
