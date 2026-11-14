import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader, TableCard } from "@/app/ui/primitives";
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
      <PageHeader
        back={{ href: `/o/${slug}/empresas`, label: "Empresas-cliente" }}
        title={company.name}
        meta={company.emailDomain ? `Domínio: ${company.emailDomain}` : undefined}
      />
      <TableCard
        title={`Contatos (${company.contacts.length})`}
        label="Contatos da empresa (rolável)"
        empty={company.contacts.length === 0 ? <EmptyState icon="users" title="Nenhum contato vinculado" /> : undefined}
      >
        <thead><tr><th scope="col">Nome</th><th scope="col">E-mail</th></tr></thead>
        <tbody>
          {company.contacts.map((c) => (
            <tr key={c.id}>
              <td><Link href={`/o/${slug}/contatos/${c.id}`} className="t-strong">{c.name}</Link></td>
              <td>{c.email}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </>
  );
}
