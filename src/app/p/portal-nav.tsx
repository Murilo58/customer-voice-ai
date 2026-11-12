"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Navegação do portal com indicação da página atual (aria-current). */
export function PortalNav({ slug }: { slug: string }) {
  const path = usePathname();
  const home = `/p/${slug}`;
  const items = [
    { href: home, label: "Nova manifestação", active: path === home },
    { href: `${home}/chamados`, label: "Meus chamados", active: path.startsWith(`${home}/chamados`) || path.startsWith(`${home}/entrar`) || path.startsWith(`${home}/acesso`) },
  ];
  return (
    <nav aria-label="Portal" className="portal-nav">
      {items.map((i) => <Link key={i.href} href={i.href} aria-current={i.active ? "page" : undefined}>{i.label}</Link>)}
    </nav>
  );
}
