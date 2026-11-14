import { notFound } from "next/navigation";
import { addTeamMemberAction, createTeamAction, removeTeamMemberAction, renameTeamAction, setTeamArchivedAction } from "@/app/actions/teams";
import { ErrorAlert, param, type SearchParams } from "@/app/components";
import { initials } from "@/app/ui/initials";
import { Badge, btn, Card, EmptyState, PageHeader } from "@/app/ui/primitives";
import { ForbiddenError } from "@/server/errors";
import { requireActor } from "@/server/identity/session";
import { ROLE_LABEL } from "@/server/organizations/permissions";
import { listMembers } from "@/server/organizations/service";
import { listTeams } from "@/server/organizations/teams";

export default async function TeamsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { actor } = await requireActor(slug);
  let members: Awaited<ReturnType<typeof listMembers>>["members"];
  try {
    members = (await listMembers(actor)).members.filter((m) => m.status === "active");
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  const teams = await listTeams(actor, { includeArchived: true });
  return (
    <>
      <PageHeader
        title="Equipes"
        meta="Equipes funcionam como filas: atendentes assumem chamados das suas equipes. Equipes arquivadas saem das opções de atribuição e da triagem, mas continuam nos chamados antigos."
      />
      <ErrorAlert code={param(sp, "erro")} />
      <Card>
        <form action={createTeamAction.bind(null, slug)} className="inline-create">
          <label htmlFor="name">Nova equipe</label>
          <div className="inline-form">
            <input id="name" name="name" required minLength={2} maxLength={80} placeholder="Ex.: Financeiro" />
            <button type="submit" className="btn btn-primary">Criar equipe</button>
          </div>
        </form>
      </Card>
      {teams.length === 0 && <Card><EmptyState icon="team" title="Nenhuma equipe criada">Crie a primeira equipe para organizar a fila de atendimento.</EmptyState></Card>}
      <div className="team-grid">
        {teams.map((t) => {
          const inTeam = new Set(t.members.map((m) => m.membershipId));
          const candidates = members.filter((m) => !inTeam.has(m.id));
          return (
            <section className={`card team-card${t.archivedAt ? " team-archived" : ""}`} key={t.id} aria-label={`Equipe ${t.name}`}>
              <div className="team-head">
                <form action={renameTeamAction.bind(null, slug, t.id)} className="inline-form">
                  <input name="name" defaultValue={t.name} minLength={2} maxLength={80} aria-label={`Nome da equipe ${t.name}`} className="team-name" />
                  <button type="submit" className={btn("ghost", "sm")}>Renomear<span className="sr-only"> equipe {t.name}</span></button>
                </form>
                <span className="tags">
                  <Badge tone="neutral">{t.members.length} membro(s)</Badge>
                  {t.archivedAt && <Badge tone="warn">Arquivada</Badge>}
                </span>
              </div>
              <ul className="member-list">
                {t.members.map((m) => (
                  <li key={m.membershipId}>
                    <span className="avatar" aria-hidden="true">{initials(m.membership.user.name)}</span>
                    <span className="member-info">
                      <strong>{m.membership.user.name}</strong>
                      <span className="muted">{ROLE_LABEL[m.membership.role]}{m.membership.status !== "active" ? " · desativado" : ""}</span>
                    </span>
                    <form action={removeTeamMemberAction.bind(null, slug, t.id, m.membershipId)}>
                      <button type="submit" className={btn("ghost", "sm")}>Remover<span className="sr-only"> {m.membership.user.name} da equipe {t.name}</span></button>
                    </form>
                  </li>
                ))}
                {t.members.length === 0 && <li className="muted">Sem membros.</li>}
              </ul>
              <div className="team-foot">
                {!t.archivedAt && candidates.length > 0 && (
                  <form action={addTeamMemberAction.bind(null, slug, t.id)} className="inline-form">
                    <select name="membership_id" aria-label={`Adicionar membro à equipe ${t.name}`} required defaultValue="">
                      <option value="" disabled>Adicionar membro…</option>
                      {candidates.map((m) => <option key={m.id} value={m.id}>{m.user.name}</option>)}
                    </select>
                    <button type="submit" className={btn("secondary", "sm")}>Adicionar</button>
                  </form>
                )}
                <form action={setTeamArchivedAction.bind(null, slug, t.id, !t.archivedAt)}>
                  <button type="submit" className={btn("ghost", "sm")}>{t.archivedAt ? "Desarquivar" : "Arquivar"}<span className="sr-only"> equipe {t.name}</span></button>
                </form>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
