import Link from "next/link";
import { AccountHeader } from "@/app/ui/account-header";
import { Icon } from "@/app/ui/icons";
import { initials } from "@/app/ui/initials";
import { ROLE_LABEL } from "@/server/organizations/permissions";
import { listMyOrganizations } from "@/server/organizations/service";
import { requireUser } from "@/server/identity/session";

export const dynamic = "force-dynamic";

// Seleção de organização. A lista vem de listMyOrganizations (vínculos e organizações ativos, com RLS por
// usuário); o acesso a cada organização continua validado em /o/[slug] a cada requisição (ADR-004).
export default async function OrganizationsPage() {
  const user = await requireUser();
  const memberships = await listMyOrganizations(user.id);
  const firstName = user.name.split(/\s+/)[0] ?? user.name;
  const single = memberships.length === 1;
  return (
    <div className="account">
      <AccountHeader user={user} />
      <main className="account-main">
        <div className="account-container">
          <p className="account-welcome">Olá, {firstName}. Conectado como {user.email}.</p>
          <h1>Selecione sua organização</h1>
          {memberships.length === 0 ? (
            <div className="org-empty">
              <span className="feature-icon" aria-hidden="true"><Icon name="team" /></span>
              <h2>Você ainda não pertence a nenhuma organização</h2>
              <p>O acesso é feito por convite. Peça ao administrador da sua organização para enviar um convite para {user.email}.</p>
            </div>
          ) : (
            <>
              <p className="account-sub">
                {single ? "Você tem acesso a uma organização." : `Você tem acesso a ${memberships.length} organizações.`}
              </p>
              <ul className={`org-grid${single ? " org-grid-single" : ""}`}>
                {memberships.map((m) => (
                  <li key={m.id} className="org-card">
                    <div className="org-card-head">
                      <span className="org-avatar" aria-hidden="true">{initials(m.organization.name)}</span>
                      <div className="org-card-title">
                        <h2>{m.organization.name}</h2>
                        <span className="org-slug">/o/{m.organization.slug}</span>
                      </div>
                    </div>
                    <p className="org-role">Perfil de acesso: <span className="tag tag-neutral">{ROLE_LABEL[m.role]}</span></p>
                    <Link href={`/o/${m.organization.slug}`} className="btn btn-primary org-cta" aria-label={`Acessar organização ${m.organization.name}`}>
                      Acessar organização
                      <Icon name="arrowRight" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
