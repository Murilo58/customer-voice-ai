import Link from "next/link";
import { signOutAction } from "@/app/actions/auth";
import { requireActor } from "@/server/identity/session";
import { can, ROLE_LABEL } from "@/server/organizations/permissions";
import { unreadCount } from "@/server/notifications/service";
import { countPendingQuarantine } from "@/server/email/quarantine";
import { listMyOrganizations } from "@/server/organizations/service";

export const dynamic = "force-dynamic";

export default async function OrganizationLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, actor } = await requireActor(slug);
  const memberships = await listMyOrganizations(user.id);
  const current = memberships.find((m) => m.organization.slug === slug);
  const unread = await unreadCount(actor);
  const canQuarantine = can(actor.role, "quarantine.manage", actor.executiveRead);
  const quarantined = canQuarantine ? await countPendingQuarantine(actor) : 0;
  return (
    <>
      <header className="top">
        {/* Contexto ativo sempre visível (RF-ORG-08) */}
        <strong>{current?.organization.name}</strong>
        <nav>
          <Link href={`/o/${slug}`}>Início</Link>
          {can(actor.role, "dashboard.read", actor.executiveRead) && <Link href={`/o/${slug}/dashboard`}>Dashboard</Link>}
          {can(actor.role, "service.access", actor.executiveRead) && <Link href={`/o/${slug}/chamados`}>Chamados</Link>}
          {can(actor.role, "service.access", actor.executiveRead) && <Link href={`/o/${slug}/contatos`}>Contatos</Link>}
          {canQuarantine && <Link href={`/o/${slug}/quarentena`}>Quarentena{quarantined > 0 && <span className="badge">{quarantined}</span>}</Link>}
          {can(actor.role, "members.manage") && <Link href={`/o/${slug}/membros`}>Membros</Link>}
          {can(actor.role, "settings.manage") && <Link href={`/o/${slug}/equipes`}>Equipes</Link>}
          {can(actor.role, "audit.read") && <Link href={`/o/${slug}/auditoria`}>Auditoria</Link>}
          {can(actor.role, "settings.manage") && <Link href={`/o/${slug}/configuracoes`}>Configurações</Link>}
          <Link href={`/o/${slug}/alertas`}>Alertas{unread > 0 && <span className="badge">{unread}</span>}</Link>
          {memberships.length > 1 && <Link href="/app">Trocar organização</Link>}
        </nav>
        <span className="muted">
          {user.name} · {ROLE_LABEL[actor.role]}{" "}
          <form action={signOutAction} style={{ display: "inline" }}>
            <button className="link" type="submit">Sair</button>
          </form>
        </span>
      </header>
      <main>{children}</main>
    </>
  );
}
