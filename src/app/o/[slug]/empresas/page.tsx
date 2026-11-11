import Link from "next/link";
import { createCompanyAction } from "@/app/actions/servicedesk";
import { ErrorAlert, param, type SearchParams } from "@/app/components";
import { requireServiceActor } from "@/server/identity/session";
import { listCompanies } from "@/server/servicedesk/contacts";

export default async function CompaniesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { actor } = await requireServiceActor(slug);
  const companies = await listCompanies(actor);
  return (
    <>
      <h1>Empresas-cliente</h1>
      <ErrorAlert code={param(sp, "erro")} />
      <form className="card" action={createCompanyAction.bind(null, slug)}>
        <h2>Nova empresa</h2>
        <label htmlFor="name">Nome</label>
        <input id="name" name="name" required minLength={2} maxLength={120} />
        <label htmlFor="email_domain">Domínio de e-mail (opcional)</label>
        <input id="email_domain" name="email_domain" placeholder="empresa.com.br" maxLength={253} />
        <button type="submit">Criar empresa</button>
      </form>
      <div className="card">
        {companies.length === 0 ? <p className="muted">Nenhuma empresa cadastrada.</p> : (
          <table>
            <thead><tr><th>Nome</th><th>Domínio</th><th>Contatos</th></tr></thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/o/${slug}/empresas/${c.id}`}>{c.name}</Link></td>
                  <td>{c.emailDomain ?? "—"}</td>
                  <td>{c._count.contacts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
