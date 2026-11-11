import { notFound } from "next/navigation";
import { addTeamMemberAction, createTeamAction, removeTeamMemberAction, renameTeamAction, setTeamArchivedAction } from "@/app/actions/teams";
import { ErrorAlert, param, type SearchParams } from "@/app/components";
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
      <h1>Equipes</h1>
      <p className="muted">Equipes funcionam como filas: atendentes assumem chamados das suas equipes. Equipes arquivadas saem das opções de atribuição e da triagem, mas continuam nos chamados antigos.</p>
      <ErrorAlert code={param(sp, "erro")} />
      <div className="card">
        <form action={createTeamAction.bind(null, slug)}>
          <label htmlFor="name">Nova equipe</label>
          <input id="name" name="name" required minLength={2} maxLength={80} />
          <button type="submit">Criar equipe</button>
        </form>
      </div>
      {teams.map((t) => {
        const inTeam = new Set(t.members.map((m) => m.membershipId));
        const candidates = members.filter((m) => !inTeam.has(m.id));
        return (
          <div className="card" key={t.id}>
            <form action={renameTeamAction.bind(null, slug, t.id)}>
              <input name="name" defaultValue={t.name} minLength={2} maxLength={80} aria-label="Nome da equipe" />{" "}
              <button type="submit" className="link">renomear</button>
              {t.archivedAt && <span className="badge">arquivada</span>}
            </form>
            <ul>
              {t.members.map((m) => (
                <li key={m.membershipId}>
                  {m.membership.user.name} <span className="muted">({ROLE_LABEL[m.membership.role]}{m.membership.status !== "active" ? ", desativado" : ""})</span>{" "}
                  <form action={removeTeamMemberAction.bind(null, slug, t.id, m.membershipId)} style={{ display: "inline" }}>
                    <button type="submit" className="link">remover</button>
                  </form>
                </li>
              ))}
              {t.members.length === 0 && <li className="muted">Sem membros.</li>}
            </ul>
            {!t.archivedAt && candidates.length > 0 && (
              <form action={addTeamMemberAction.bind(null, slug, t.id)}>
                <select name="membership_id" aria-label="Membro" required defaultValue="">
                  <option value="" disabled>Adicionar membro…</option>
                  {candidates.map((m) => <option key={m.id} value={m.id}>{m.user.name}</option>)}
                </select>{" "}
                <button type="submit">Adicionar</button>
              </form>
            )}
            <form action={setTeamArchivedAction.bind(null, slug, t.id, !t.archivedAt)}>
              <button type="submit" className="link">{t.archivedAt ? "desarquivar" : "arquivar"}</button>
            </form>
          </div>
        );
      })}
    </>
  );
}
