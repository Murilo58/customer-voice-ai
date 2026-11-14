import Link from "next/link";
import { createCompanyAction } from "@/app/actions/servicedesk";
import { ErrorAlert, param, type SearchParams } from "@/app/components";
import { Card, EmptyState, Field, PageHeader, TableCard } from "@/app/ui/primitives";
import { requireServiceActor } from "@/server/identity/session";
import { listCompanies } from "@/server/servicedesk/contacts";

export default async function CompaniesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { actor } = await requireServiceActor(slug);
  const companies = await listCompanies(actor);
  return (
    <>
      <PageHeader back={{ href: `/o/${slug}/contatos`, label: "Contatos" }} title="Empresas-cliente" meta={`${companies.length} empresa(s)`} />
      <ErrorAlert code={param(sp, "erro")} />
      <div className="detail-grid">
        <div className="detail-main">
          <TableCard
            label="Empresas-cliente (rolável)"
            empty={companies.length === 0 ? <EmptyState icon="layers" title="Nenhuma empresa cadastrada">Cadastre empresas para agrupar contatos.</EmptyState> : undefined}
          >
            <thead><tr><th scope="col">Nome</th><th scope="col">Domínio</th><th scope="col" className="num">Contatos</th></tr></thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/o/${slug}/empresas/${c.id}`} className="t-strong">{c.name}</Link></td>
                  <td>{c.emailDomain ?? <span className="muted">—</span>}</td>
                  <td className="num">{c._count.contacts}</td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        </div>
        <aside className="detail-side" aria-label="Nova empresa">
          <Card title="Nova empresa">
            <form action={createCompanyAction.bind(null, slug)} className="form-stack">
              <Field id="name" label="Nome">
                <input id="name" name="name" required minLength={2} maxLength={120} />
              </Field>
              <Field id="email_domain" label="Domínio de e-mail (opcional)" hint="Ex.: empresa.com.br">
                <input id="email_domain" name="email_domain" placeholder="empresa.com.br" maxLength={253} aria-describedby="email_domain-hint" />
              </Field>
              <button type="submit" className="btn btn-primary btn-block">Criar empresa</button>
            </form>
          </Card>
        </aside>
      </div>
    </>
  );
}
