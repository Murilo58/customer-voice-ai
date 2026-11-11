import Link from "next/link";
import { requireActor } from "@/server/identity/session";
import { getChecklist } from "@/server/organizations/onboarding";
import { can } from "@/server/organizations/permissions";

export default async function OrganizationHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { actor } = await requireActor(slug);
  const checklist = can(actor.role, "settings.manage") ? await getChecklist(actor) : null;
  return (
    <>
      <div className="card">
        <h1>Central de atendimento</h1>
        {can(actor.role, "service.access", actor.executiveRead) ? (
          <p>
            <Link href={`/o/${slug}/chamados?view=mine`}>Meus chamados</Link> · <Link href={`/o/${slug}/chamados?view=team_unassigned`}>Minha equipe sem responsável</Link> ·{" "}
            <Link href={`/o/${slug}/chamados?view=triage_review`}>Aguardando revisão da triagem</Link> · <Link href={`/o/${slug}/contatos`}>Contatos</Link> ·{" "}
            <Link href={`/o/${slug}/empresas`}>Empresas-cliente</Link>
          </p>
        ) : (
          <p>Leitura executiva: <Link href={`/o/${slug}/dashboard`}>Dashboard</Link></p>
        )}
      </div>
      {checklist && checklist.completed < checklist.total && (
        <div className="card">
          {/* Checklist de configuração inicial (RF-ORG-11; CA-03.4) */}
          <h2>Configuração inicial · {checklist.completed} de {checklist.total}</h2>
          <ul>
            {checklist.items.map((i) => (
              <li key={i.item}>
                {i.completedAt ? "✔" : "○"}{" "}
                {"path" in i ? <Link href={`/o/${slug}/${i.path}`}>{i.label}</Link> : i.label}
                {i.completedAt ? <span className="muted"> · concluído em {i.completedAt.toLocaleDateString("pt-BR")}</span> : "availableIn" in i ? <span className="muted"> · disponível no {i.availableIn}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
