import Link from "next/link";
import { createTicketAction } from "@/app/actions/servicedesk";
import { ErrorAlert, param, type SearchParams } from "@/app/components";
import { PRIORITY_LABEL, TYPE_LABEL } from "@/lib/labels";
import { requireServiceActor } from "@/server/identity/session";
import { listTeams } from "@/server/organizations/teams";
import { listContacts } from "@/server/servicedesk/contacts";

export default async function NewTicketPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { actor } = await requireServiceActor(slug);
  const [contacts, teams] = await Promise.all([listContacts(actor), listTeams(actor)]);
  return (
    <>
      <h1>Novo chamado manual</h1>
      <ErrorAlert code={param(sp, "erro")} />
      <div className="card">
        {contacts.length === 0 ? (
          <p>Cadastre um contato antes. <Link href={`/o/${slug}/contatos/novo?next=ticket`}>Novo contato</Link></p>
        ) : (
          <form action={createTicketAction.bind(null, slug)}>
            <label htmlFor="contact_id">Contato</label>
            <select id="contact_id" name="contact_id" required defaultValue={param(sp, "contato") ?? ""}>
              <option value="" disabled>Selecione</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
            </select>
            <p className="muted"><Link href={`/o/${slug}/contatos/novo?next=ticket`}>Contato novo?</Link></p>
            <label htmlFor="subject">Assunto</label>
            <input id="subject" name="subject" required maxLength={200} />
            <label htmlFor="description">Descrição</label>
            <textarea id="description" name="description" required maxLength={20000} rows={8} />
            <label htmlFor="type">Tipo (opcional; se vazio, a triagem sugere)</label>
            <select id="type" name="type" defaultValue="">
              <option value="">Não classificado</option>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label htmlFor="priority">Prioridade</label>
            <select id="priority" name="priority" defaultValue="">
              <option value="">Automática (sugerida pela triagem)</option>
              {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label htmlFor="team_id">Equipe (fila)</label>
            <select id="team_id" name="team_id" defaultValue="">
              <option value="">Sem equipe (a triagem pode sugerir)</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button type="submit">Criar chamado</button>
          </form>
        )}
      </div>
    </>
  );
}
