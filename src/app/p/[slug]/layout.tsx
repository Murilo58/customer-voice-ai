import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { initials } from "@/app/ui/initials";
import { resolvePortalOrg } from "@/server/portal/service";
import { PortalNav } from "../portal-nav";

export const metadata: Metadata = { title: "Portal de atendimento", robots: { index: false }, referrer: "no-referrer" };

// Portal público do cliente (RF-POR-01, RF-POR-06): identidade própria, sem navegação da equipe.
export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await resolvePortalOrg(slug);
  if (!org) notFound();
  return (
    <div className="portal">
      <header className="portal-top">
        <Link href={`/p/${slug}`} className="portal-brand">
          <span className="portal-logo" aria-hidden="true">{initials(org.name)}</span>
          <span className="portal-brand-text"><strong>{org.name}</strong><span>Central de atendimento</span></span>
        </Link>
        <PortalNav slug={slug} />
      </header>
      <main className="portal-main">{children}</main>
    </div>
  );
}
