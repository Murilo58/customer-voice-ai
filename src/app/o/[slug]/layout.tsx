import { signOutAction } from "@/app/actions/auth";
import { AppShell, type NavGroup } from "@/app/ui/app-shell";
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
  const service = can(actor.role, "service.access", actor.executiveRead);
  const base = `/o/${slug}`;

  // Os itens visíveis seguem exatamente as mesmas permissões do menu anterior.
  const groups: NavGroup[] = [
    {
      title: "Atendimento",
      items: [
        { href: base, label: "Início", icon: "home", exact: true },
        ...(service ? [{ href: `${base}/chamados`, label: "Chamados", icon: "inbox" as const }] : []),
        ...(service ? [{ href: `${base}/contatos`, label: "Contatos", icon: "users" as const }] : []),
        ...(canQuarantine ? [{ href: `${base}/quarentena`, label: "Quarentena", icon: "shield" as const, count: quarantined }] : []),
        { href: `${base}/alertas`, label: "Alertas", icon: "bell", count: unread },
      ],
    },
    {
      title: "Análise",
      items: can(actor.role, "dashboard.read", actor.executiveRead) ? [{ href: `${base}/dashboard`, label: "Dashboard", icon: "chart" }] : [],
    },
    {
      title: "Administração",
      items: [
        ...(can(actor.role, "members.manage") ? [{ href: `${base}/membros`, label: "Membros", icon: "team" as const }] : []),
        ...(can(actor.role, "settings.manage") ? [{ href: `${base}/equipes`, label: "Equipes", icon: "layers" as const }] : []),
        ...(can(actor.role, "audit.read") ? [{ href: `${base}/auditoria`, label: "Auditoria", icon: "log" as const }] : []),
        ...(can(actor.role, "settings.manage") ? [{ href: `${base}/configuracoes`, label: "Configurações", icon: "settings" as const }] : []),
      ],
    },
  ];

  return (
    <AppShell
      orgName={current?.organization.name ?? slug}
      groups={groups}
      switchHref={memberships.length > 1 ? "/app" : undefined}
      userName={user.name}
      roleLabel={ROLE_LABEL[actor.role]}
      signOut={
        <form action={signOutAction}>
          <button className="link" type="submit">Sair</button>
        </form>
      }
    >
      {children}
    </AppShell>
  );
}
