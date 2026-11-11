import { createContactAction } from "@/app/actions/servicedesk";
import { ErrorAlert, param, type SearchParams } from "@/app/components";
import { requireServiceActor } from "@/server/identity/session";
import { listCompanies } from "@/server/servicedesk/contacts";
import { ContactFields } from "../contact-fields";

export default async function NewContactPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { actor } = await requireServiceActor(slug);
  const companies = await listCompanies(actor);
  return (
    <>
      <h1>Novo contato</h1>
      <ErrorAlert code={param(sp, "erro")} />
      <form className="card" action={createContactAction.bind(null, slug)}>
        <input type="hidden" name="next" value={param(sp, "next") === "ticket" ? "ticket" : ""} />
        <ContactFields companies={companies} />
        <button type="submit">Salvar contato</button>
      </form>
    </>
  );
}
