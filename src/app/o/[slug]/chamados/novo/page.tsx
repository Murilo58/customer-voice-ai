import Link from "next/link";
import { createTicketAction } from "@/app/actions/servicedesk";
import { ErrorAlert, param, type SearchParams } from "@/app/components";
import { ButtonLink, Card, EmptyState, Field, PageHeader } from "@/app/ui/primitives";
import { PRIORITY_LABEL, TYPE_LABEL } from "@/lib/labels";
import { requireServiceActor } from "@/server/identity/session";
import { listTeams } from "@/server/organizations/teams";
import { listContacts } from "@/server/servicedesk/contacts";

export default async function NewTicketPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { actor } = await requireServiceActor(slug);
  const [contacts, teams] = await Promise.all([listContacts(actor), listTeams(actor)]);
  const newContact = `/o/${slug}/contatos/novo?next=ticket`;
  return (
    <>
      <PageHeader back={{ href: `/o/${slug}/chamados`, label: "Chamados" }} title="Novo chamado manual" />
      <ErrorAlert code={param(sp, "erro")} />
      <Card className="form-card">
        {contacts.length === 0 ? (
          <EmptyState icon="users" title="Cadastre um contato antes" action={<ButtonLink href={newContact} icon="plus">Novo contato</ButtonLink>}>
            Todo chamado pertence a um contato.
          </EmptyState>
        ) : (
          <form action={createTicketAction.bind(null, slug)} className="form-stack">
            <Field id="contact_id" label="Contato" hint={<Link href={newContact}>Contato novo?</Link>}>
              <select id="contact_id" name="contact_id" required defaultValue={param(sp, "contato") ?? ""} aria-describedby="contact_id-hint">
                <option value="" disabled>Selecione</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
              </select>
            </Field>
            <Field id="subject" label="Assunto">
              <input id="subject" name="subject" required maxLength={200} />
            </Field>
            <Field id="description" label="Descrição">
              <textarea id="description" name="description" required maxLength={20000} rows={8} />
            </Field>
            <div className="form-grid form-grid-3">
              <Field id="type" label="Tipo" hint="Opcional. Se vazio, a triagem sugere.">
                <select id="type" name="type" defaultValue="" aria-describedby="type-hint">
                  <option value="">Não classificado</option>
                  {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field id="priority" label="Prioridade">
                <select id="priority" name="priority" defaultValue="">
                  <option value="">Automática (sugerida pela triagem)</option>
                  {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field id="team_id" label="Equipe (fila)">
                <select id="team_id" name="team_id" defaultValue="">
                  <option value="">Sem equipe (a triagem pode sugerir)</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="form-actions"><button type="submit" className="btn btn-primary">Criar chamado</button></div>
          </form>
        )}
      </Card>
    </>
  );
}
