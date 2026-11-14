import { createContactAction } from "@/app/actions/servicedesk";
import { ErrorAlert, param, type SearchParams } from "@/app/components";
import { Card, PageHeader } from "@/app/ui/primitives";
import { requireServiceActor } from "@/server/identity/session";
import { listCompanies } from "@/server/servicedesk/contacts";
import { ContactFields } from "../contact-fields";

export default async function NewContactPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { actor } = await requireServiceActor(slug);
  const companies = await listCompanies(actor);
  const fromTicket = param(sp, "next") === "ticket";
  return (
    <>
      <PageHeader
        back={fromTicket ? { href: `/o/${slug}/chamados/novo`, label: "Novo chamado" } : { href: `/o/${slug}/contatos`, label: "Contatos" }}
        title="Novo contato"
      />
      <ErrorAlert code={param(sp, "erro")} />
      <Card className="form-card">
        <form action={createContactAction.bind(null, slug)}>
          <input type="hidden" name="next" value={fromTicket ? "ticket" : ""} />
          <ContactFields companies={companies} />
          <div className="form-actions"><button type="submit" className="btn btn-primary">Salvar contato</button></div>
        </form>
      </Card>
    </>
  );
}
