import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolvePortalOrg } from "@/server/portal/service";

export const metadata: Metadata = { title: "Portal de atendimento", robots: { index: false }, referrer: "no-referrer" };

// Portal público do cliente (RF-POR-01, RF-POR-06): identidade própria, sem navegação da equipe.
export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await resolvePortalOrg(slug);
  if (!org) notFound();
  return (
    <>
      <header className="top">
        <strong><Link href={`/p/${slug}`}>{org.name}</Link> · Atendimento</strong>
        <nav aria-label="Portal">
          <Link href={`/p/${slug}`}>Nova manifestação</Link>
          <Link href={`/p/${slug}/chamados`}>Meus chamados</Link>
        </nav>
      </header>
      <main>{children}</main>
    </>
  );
}
