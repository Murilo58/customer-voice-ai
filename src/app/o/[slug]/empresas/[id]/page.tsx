import Link from "next/link";
import { notFound } from "next/navigation";
import { requireServiceActor } from "@/server/identity/session";
import { getCompany } from "@/server/servicedesk/contacts";

export default async function CompanyPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { actor } = await requireServiceActor(slug);
  const company = await getCompany(actor, id);
  if (!company) notFound();
  return (
    <>
      <p><Link href={`/o/${slug}/empresas`}>← Empresas-cliente</Link></p>
      <h1>{company.name}</h1>
      {company.emailDomain && <p className="muted">Domínio: {company.emailDomain}</p>}
      <div className="card">
        <h2>Contatos</h2>
        {company.contacts.length === 0 ? <p className="muted">Nenhum contato vinculado.</p> : (
          <ul>
            {company.contacts.map((c) => <li key={c.id}><Link href={`/o/${slug}/contatos/${c.id}`}>{c.name}</Link> <span className="muted">({c.email})</span></li>)}
          </ul>
        )}
      </div>
    </>
  );
}
