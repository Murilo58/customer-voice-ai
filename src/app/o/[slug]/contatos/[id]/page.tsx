import Link from "next/link";
import { notFound } from "next/navigation";
import { updateContactAction } from "@/app/actions/servicedesk";
import { ErrorAlert, param, Success, type SearchParams } from "@/app/components";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/labels";
import { requireServiceActor } from "@/server/identity/session";
import { getContactProfile, listCompanies } from "@/server/servicedesk/contacts";
import { ContactFields } from "../contact-fields";

const UUID_RE = /^[0-9a-f-]{36}$/i;

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
      <p><Link href={`/o/${slug}/contatos`}>← Contatos</Link></p>
      <h1>{contact.anonymizedAt ? contact.pseudonymCode ?? "Contato anonimizado" : contact.name}</h1>
      <ErrorAlert code={param(sp, "erro")} />
      <Success show={param(sp, "ok") === "1"}>Contato atualizado.</Success>
      {contact.company && <p>Empresa: <Link href={`/o/${slug}/empresas/${contact.company.id}`}>{contact.company.name}</Link></p>}
      <div className="card">
        <h2>Histórico de chamados</h2>
        <p><Link href={`/o/${slug}/chamados/novo?contato=${contact.id}`}>+ Novo chamado para este contato</Link></p>
        {tickets.length === 0 ? <p className="muted">Nenhum chamado.</p> : (
          <table>
            <thead><tr><th>Número</th><th>Assunto</th><th>Prioridade</th><th>Status</th><th>Criado em</th></tr></thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td><Link href={`/o/${slug}/chamados/${t.number}`}>#{t.number}</Link></td>
                  <td>{t.subject}</td>
                  <td>{PRIORITY_LABEL[t.priority]}</td>
                  <td>{STATUS_LABEL[t.status]}</td>
                  <td>{t.createdAt.toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {!contact.anonymizedAt && (
        <form className="card" action={updateContactAction.bind(null, slug, contact.id)}>
          <h2>Dados do contato</h2>
          <ContactFields companies={companies} values={contact} />
          <button type="submit">Salvar alterações</button>
        </form>
      )}
    </>
  );
}
