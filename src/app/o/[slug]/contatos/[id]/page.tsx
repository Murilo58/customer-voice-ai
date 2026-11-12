import Link from "next/link";
import { notFound } from "next/navigation";
import { updateContactAction } from "@/app/actions/servicedesk";
import { ErrorAlert, param, Success, type SearchParams } from "@/app/components";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, PriorityBadge, StatusBadge, TableCard } from "@/app/ui/primitives";
import { requireServiceActor } from "@/server/identity/session";
import { getContactProfile, listCompanies } from "@/server/servicedesk/contacts";
import { ContactFields } from "../contact-fields";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default async function ContactPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: SearchParams }) {
  const { slug, id } = await params;
  const sp = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  const { actor } = await requireServiceActor(slug);
  const [profile, companies] = await Promise.all([getContactProfile(actor, id), listCompanies(actor)]);
  if (!profile) notFound();
  const { contact, tickets } = profile;
  return (
    <>
      <PageHeader
        back={{ href: `/o/${slug}/contatos`, label: "Contatos" }}
        title={contact.anonymizedAt ? contact.pseudonymCode ?? "Contato anonimizado" : contact.name}
        meta={<>
          {contact.anonymizedAt && <Badge tone="neutral">Anonimizado</Badge>}
          {!contact.anonymizedAt && <span>{contact.email}</span>}
          {contact.company && <span>Empresa: <Link href={`/o/${slug}/empresas/${contact.company.id}`}>{contact.company.name}</Link></span>}
        </>}
        actions={<ButtonLink href={`/o/${slug}/chamados/novo?contato=${contact.id}`} icon="plus">Novo chamado para este contato</ButtonLink>}
      />
      <ErrorAlert code={param(sp, "erro")} />
      <Success show={param(sp, "ok") === "1"}>Contato atualizado.</Success>
      <div className="detail-grid">
        <div className="detail-main">
          <TableCard
            title={`Histórico de chamados (${tickets.length})`}
            label="Histórico de chamados (rolável)"
            empty={tickets.length === 0 ? <EmptyState title="Nenhum chamado">Este contato ainda não abriu chamados.</EmptyState> : undefined}
          >
            <thead><tr><th scope="col">Número</th><th scope="col">Assunto</th><th scope="col">Prioridade</th><th scope="col">Status</th><th scope="col">Criado em</th></tr></thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td><Link href={`/o/${slug}/chamados/${t.number}`}>#{t.number}</Link></td>
                  <td className="t-subject"><Link href={`/o/${slug}/chamados/${t.number}`}>{t.subject}</Link></td>
                  <td><PriorityBadge priority={t.priority} /></td>
                  <td><StatusBadge status={t.status} /></td>
                  <td className="t-nowrap">{when.format(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        </div>
        {!contact.anonymizedAt && (
          <aside className="detail-side" aria-label="Dados do contato">
            <Card title="Dados do contato">
              <form action={updateContactAction.bind(null, slug, contact.id)} className="form-stack">
                <ContactFields companies={companies} values={contact} />
                <button type="submit" className="btn btn-primary btn-block">Salvar alterações</button>
              </form>
            </Card>
          </aside>
        )}
      </div>
    </>
  );
}
