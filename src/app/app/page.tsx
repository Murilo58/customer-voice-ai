import Link from "next/link";
import { signOutAction } from "@/app/actions/auth";
import { ROLE_LABEL } from "@/server/organizations/permissions";
import { listMyOrganizations } from "@/server/organizations/service";
import { requireUser } from "@/server/identity/session";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  const user = await requireUser();
  const memberships = await listMyOrganizations(user.id);
  return (
    <main>
      <h1>Suas organizações</h1>
      <p className="muted">Conectado como {user.email}. <Link href="/conta/seguranca">Segurança da conta</Link></p>
      <div className="card">
        {memberships.length === 0 ? (
          <p>Você ainda não pertence a nenhuma organização. O acesso é feito por convite.</p>
        ) : (
          <ul>
            {memberships.map((m) => (
              <li key={m.id}>
                <Link href={`/o/${m.organization.slug}`}>{m.organization.name}</Link> <span className="muted">— {ROLE_LABEL[m.role]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form action={signOutAction}><button className="link" type="submit">Sair</button></form>
    </main>
  );
}
