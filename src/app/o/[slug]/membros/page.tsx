import { notFound } from "next/navigation";
import { changeRoleAction, inviteMemberAction, revokeInvitationAction, setMemberStatusAction } from "@/app/actions/organizations";
import { setExecutiveReadAction } from "@/app/actions/sla";
import { ErrorAlert, param, Success, type SearchParams } from "@/app/components";
import { initials } from "@/app/ui/initials";
import { Badge, btn, Card, EmptyState, Field, PageHeader, TableCard } from "@/app/ui/primitives";
import { ForbiddenError } from "@/server/errors";
import { requireActor } from "@/server/identity/session";
import { ROLE_LABEL } from "@/server/organizations/permissions";
import { listMembers } from "@/server/organizations/service";
import { listTeams } from "@/server/organizations/teams";

const ROLES = ["admin", "manager", "agent"] as const;
const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

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
  const active = data.members.filter((m) => m.status === "active").length;
  return (
    <>
      <PageHeader title="Membros" meta={`${active} ativo(s) · ${data.invitations.length} convite(s) pendente(s)`} />
      <ErrorAlert code={param(sp, "erro")} />
      <Success show={param(sp, "ok") === "convite"}>Convite criado e enviado.</Success>
      <div className="detail-grid">
        <div className="detail-main">
          <TableCard title="Equipe" label="Membros da organização (rolável)">
            <thead>
              <tr><th scope="col">Nome</th><th scope="col">Perfil</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Ações</span></th></tr>
            </thead>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.id}>
                  <td>
                    <span className="person">
                      <span className="avatar" aria-hidden="true">{initials(m.user.name)}</span>
                      <span className="t-person"><strong>{m.user.name}</strong><span className="muted">{m.user.email}</span></span>
                    </span>
                  </td>
                  <td>
                    <form action={changeRoleAction.bind(null, slug, m.id)} className="inline-form">
                      <select name="role" defaultValue={m.role} aria-label={`Perfil de ${m.user.name}`}>
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                      <button type="submit" className={btn("ghost", "sm")}>Salvar<span className="sr-only"> perfil de {m.user.name}</span></button>
                    </form>
                    {m.role === "manager" && (
                      // RF-ORG-10: Gestor com leitura executiva vê só o dashboard
                      <form action={setExecutiveReadAction.bind(null, slug, m.id, !m.executiveRead)} className="exec-row">
                        <Badge tone={m.executiveRead ? "info" : "neutral"}>{m.executiveRead ? "Leitura executiva" : "Gestor operacional"}</Badge>
                        <button type="submit" className="link">{m.executiveRead ? "Remover leitura executiva" : "Ativar leitura executiva"}<span className="sr-only"> de {m.user.name}</span></button>
                      </form>
                    )}
                  </td>
                  <td>{m.status === "active" ? <Badge tone="ok">Ativo</Badge> : <Badge tone="neutral">Desativado</Badge>}</td>
                  <td className="row-actions">
                    {m.id !== actor.membershipId && (
                      <form action={setMemberStatusAction.bind(null, slug, m.id, m.status === "active" ? "inactive" : "active")}>
                        <button type="submit" className={btn(m.status === "active" ? "ghost" : "secondary", "sm")}>
                          {m.status === "active" ? "Desativar" : "Reativar"}<span className="sr-only"> {m.user.name}</span>
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableCard>
          <TableCard
            title="Convites pendentes"
            label="Convites pendentes (rolável)"
            empty={data.invitations.length === 0 ? <EmptyState icon="mail" title="Nenhum convite pendente" /> : undefined}
          >
            <thead>
              <tr><th scope="col">E-mail</th><th scope="col">Perfil</th><th scope="col">Expira em</th><th scope="col"><span className="sr-only">Ações</span></th></tr>
            </thead>
            <tbody>
              {data.invitations.map((i) => (
                <tr key={i.id}>
                  <td>{i.email}</td>
                  <td>{ROLE_LABEL[i.role]}</td>
                  <td className="t-nowrap">{when.format(i.expiresAt)}</td>
                  <td className="row-actions">
                    <form action={revokeInvitationAction.bind(null, slug, i.id)}>
                      <button type="submit" className={btn("ghost", "sm")}>Cancelar<span className="sr-only"> convite de {i.email}</span></button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        </div>
        <aside className="detail-side" aria-label="Convidar colaborador">
          <Card title="Convidar colaborador">
            <form action={inviteMemberAction.bind(null, slug)} className="form-stack">
              <Field id="email" label="E-mail">
                <input id="email" name="email" type="email" required />
              </Field>
              <Field id="role" label="Perfil">
                <select id="role" name="role" defaultValue="agent">
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </Field>
              {teams.length > 0 && (
                <fieldset className="choice-list">
                  <legend>Equipes</legend>
                  {teams.map((t) => (
                    <label key={t.id} className="check-row">
                      <input type="checkbox" name="team_ids" value={t.id} /> {t.name}
                    </label>
                  ))}
                </fieldset>
              )}
              <button type="submit" className="btn btn-primary btn-block">Enviar convite</button>
            </form>
          </Card>
        </aside>
      </div>
    </>
  );
}
