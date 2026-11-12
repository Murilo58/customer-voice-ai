import Link from "next/link";
import { param, type SearchParams } from "@/app/components";
import { Icon } from "@/app/ui/icons";
import { ButtonLink, EmptyState, PageHeader, TableCard } from "@/app/ui/primitives";
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
      <PageHeader
        title="Contatos"
        meta={`${contacts.length} contato(s)${q ? ` para “${q}”` : ""}`}
        actions={<>
          <ButtonLink href={`/o/${slug}/empresas`} variant="secondary" icon="layers">Empresas-cliente</ButtonLink>
          <ButtonLink href={`/o/${slug}/contatos/novo`} icon="plus">Novo contato</ButtonLink>
        </>}
      />
      <form className="card toolbar" method="get" role="search" aria-label="Buscar contatos">
        <div className="search-row">
          <div className="search">
            <label htmlFor="q">Buscar por nome ou e-mail</label>
            <Icon name="search" />
            <input id="q" name="q" type="search" defaultValue={q} maxLength={100} />
          </div>
          <button type="submit" className="btn btn-primary">Buscar</button>
        </div>
      </form>
      <TableCard
        label="Contatos (rolável)"
        empty={contacts.length === 0 ? (
          <EmptyState icon="users" title="Nenhum contato encontrado" action={q ? <Link href={`/o/${slug}/contatos`}>Limpar busca</Link> : undefined}>
            {q ? "Tente outro nome ou e-mail." : "Os contatos são criados ao abrir chamados ou manualmente."}
          </EmptyState>
        ) : undefined}
      >
        <thead><tr><th scope="col">Nome</th><th scope="col">E-mail</th><th scope="col">Telefone</th><th scope="col">Empresa</th></tr></thead>
        <tbody>
          {contacts.map((c) => (
            <tr key={c.id}>
              <td><Link href={`/o/${slug}/contatos/${c.id}`} className="t-strong">{c.name}</Link></td>
              <td>{c.email}</td>
              <td className="t-nowrap">{c.phone ?? <span className="muted">—</span>}</td>
              <td>{c.company ? <Link href={`/o/${slug}/empresas/${c.company.id}`}>{c.company.name}</Link> : <span className="muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </>
  );
}
