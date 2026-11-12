"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "./icons";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  count?: number;
  /** Ativo só na rota exata (ex.: Início). */
  exact?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

/**
 * Estrutura da área interna: menu lateral agrupado, barra superior com o contexto ativo (RF-ORG-08) e
 * gaveta no celular. Os itens chegam já filtrados pelas permissões no servidor; aqui só há apresentação.
 */
export function AppShell(props: {
  orgName: string;
  groups: NavGroup[];
  switchHref?: string;
  userName: string;
  roleLabel: string;
  signOut: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/"));
  const current = props.groups.flatMap((g) => g.items).find(isActive);

  return (
    <div className="shell" data-open={open}>
      <aside className="sidebar" id="app-sidebar" aria-label="Menu principal">
        <Link href="/app" className="sidebar-brand">
          <span className="logo" aria-hidden="true">CV</span>
          Customer Voice AI
        </Link>
        <div className="sidebar-org">
          <span className="label">Organização</span>
          <strong>{props.orgName}</strong>
          {props.switchHref && <Link href={props.switchHref}>Trocar organização</Link>}
        </div>
        <nav aria-label="Seções">
          {props.groups.filter((g) => g.items.length > 0).map((g) => (
            <div className="nav-group" key={g.title}>
              <div className="nav-group-title">{g.title}</div>
              <ul>
                {g.items.map((item) => (
                  <li key={item.href}>
                    <Link className="nav-link" href={item.href} aria-current={isActive(item) ? "page" : undefined}>
                      <Icon name={item.icon} />
                      <span>{item.label}</span>
                      {!!item.count && item.count > 0 && (
                        <span className="count" aria-label={`${item.count} pendente(s)`}>{item.count > 99 ? "99+" : item.count}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="who">{props.userName}</div>
          <div className="role">{props.roleLabel}</div>
          {props.signOut}
        </div>
      </aside>
      <div className="sidebar-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
      <div className="shell-body">
        <header className="topbar">
          <button
            type="button"
            className="menu-toggle"
            aria-controls="app-sidebar"
            aria-expanded={open}
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
          {/* Contexto ativo sempre visível (RF-ORG-08) */}
          <div className="context">
            {props.orgName}
            {current && <><span className="sep" aria-hidden="true">/</span><span className="muted">{current.label}</span></>}
          </div>
          <div className="spacer" />
          <div className="user">
            <span className="name">{props.userName} · {props.roleLabel}</span>
            <span className="avatar" aria-hidden="true">{initials(props.userName)}</span>
          </div>
        </header>
        <main className="app-main">{props.children}</main>
      </div>
    </div>
  );
}
