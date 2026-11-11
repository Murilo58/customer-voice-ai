import Link from "next/link";
import { param, type SearchParams } from "@/app/components";
import { requireServiceActor } from "@/server/identity/session";
import { listContacts } from "@/server/servicedesk/contacts";

export default async function ContactsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { actor } = await requireServiceActor(slug);
  const q = param(sp, "q") ?? "";
  const contacts = await listContacts(actor, q);
  return (
    <>
      <h1>Contatos</h1>
      <p><Link href={`/o/${slug}/contatos/novo`}>+ Novo contato</Link> · <Link href={`/o/${slug}/empresas`}>Empresas-cliente</Link></p>
      <form className="card" method="get">
        <label htmlFor="q">Buscar por nome ou e-mail</label>
        <input id="q" name="q" defaultValue={q} maxLength={100} />
        <button type="submit">Buscar</button>
      </form>
      <div className="card">
        {contacts.length === 0 ? <p className="muted">Nenhum contato encontrado.</p> : (
          <table>
            <thead><tr><th>Nome</th><th>E-mail</th><th>Telefone</th><th>Empresa</th></tr></thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/o/${slug}/contatos/${c.id}`}>{c.name}</Link></td>
                  <td>{c.email}</td>
                  <td>{c.phone ?? "—"}</td>
                  <td>{c.company ? <Link href={`/o/${slug}/empresas/${c.company.id}`}>{c.company.name}</Link> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
