import { notFound } from "next/navigation";
import { changeRoleAction, inviteMemberAction, revokeInvitationAction, setMemberStatusAction } from "@/app/actions/organizations";
import { setExecutiveReadAction } from "@/app/actions/sla";
import { ErrorAlert, param, Success, type SearchParams } from "@/app/components";
import { ForbiddenError } from "@/server/errors";
import { requireActor } from "@/server/identity/session";
import { ROLE_LABEL } from "@/server/organizations/permissions";
import { listMembers } from "@/server/organizations/service";
import { listTeams } from "@/server/organizations/teams";

const ROLES = ["admin", "manager", "agent"] as const;

export default async function MembersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { actor } = await requireActor(slug);
  let data: Awaited<ReturnType<typeof listMembers>>;
  try {
    data = await listMembers(actor);
  } catch (e) {
    // A negação já foi auditada em requirePermission (CA-02.1)
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  const teams = await listTeams(actor);
  return (
    <>
      <h1>Membros</h1>
      <ErrorAlert code={param(sp, "erro")} />
      <Success show={param(sp, "ok") === "convite"}>Convite criado e enviado.</Success>
      <div className="card">
        <h2>Convidar colaborador</h2>
        <form action={inviteMemberAction.bind(null, slug)}>
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" required />
          <label htmlFor="role">Perfil</label>
          <select id="role" name="role" defaultValue="agent">
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
          {teams.length > 0 && (
            <fieldset>
              <legend>Equipes</legend>
              {teams.map((t) => (
                <label key={t.id} style={{ display: "block" }}>
                  <input type="checkbox" name="team_ids" value={t.id} /> {t.name}
                </label>
              ))}
            </fieldset>
          )}
          <button type="submit">Enviar convite</button>
        </form>
      </div>
      <div className="card">
        <h2>Equipe</h2>
        <table>
          <thead>
            <tr><th>Nome</th><th>Perfil</th><th>Status</th><th>Ações</th></tr>
          </thead>
          <tbody>
            {data.members.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.user.name}
                  <br />
                  <span className="muted">{m.user.email}</span>
                </td>
                <td>
                  <form action={changeRoleAction.bind(null, slug, m.id)}>
                    <select name="role" defaultValue={m.role} aria-label="Perfil">
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                      ))}
                    </select>{" "}
                    <button type="submit" className="link">salvar</button>
                  </form>
                  {m.role === "manager" && (
                    // RF-ORG-10: Gestor com leitura executiva vê só o dashboard
                    <form action={setExecutiveReadAction.bind(null, slug, m.id, !m.executiveRead)}>
                      <span className="muted">{m.executiveRead ? "Leitura executiva" : "Gestor operacional"}</span>{" "}
                      <button type="submit" className="link">{m.executiveRead ? "remover leitura executiva" : "ativar leitura executiva"}</button>
                    </form>
                  )}
                </td>
                <td>{m.status === "active" ? "Ativo" : "Desativado"}</td>
                <td className="row-actions">
                  {m.id !== actor.membershipId && (
                    <form action={setMemberStatusAction.bind(null, slug, m.id, m.status === "active" ? "inactive" : "active")}>
                      <button type="submit" className="link">{m.status === "active" ? "Desativar" : "Reativar"}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>Convites pendentes</h2>
        {data.invitations.length === 0 ? (
          <p className="muted">Nenhum convite pendente.</p>
        ) : (
          <table>
            <thead>
              <tr><th>E-mail</th><th>Perfil</th><th>Expira em</th><th></th></tr>
            </thead>
            <tbody>
              {data.invitations.map((i) => (
                <tr key={i.id}>
                  <td>{i.email}</td>
                  <td>{ROLE_LABEL[i.role]}</td>
                  <td>{i.expiresAt.toLocaleString("pt-BR")}</td>
                  <td>
                    <form action={revokeInvitationAction.bind(null, slug, i.id)}>
                      <button type="submit" className="link">Cancelar</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
