import Link from "next/link";
import { signOutAction } from "@/app/actions/auth";
import { Brand } from "./brand";
import { Icon } from "./icons";
import { initials } from "./initials";
import "../marketing.css";

/** Cabeçalho das telas da conta (seleção de organização, segurança). Só apresentação. */
export function AccountHeader({ user }: { user: { name: string; email: string } }) {
  return (
    <header className="account-header">
      <div className="account-container account-header-inner">
        <Brand href="/app" />
        <div className="account-user">
          <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
          <span className="account-user-text">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </span>
        </div>
        <nav className="account-actions" aria-label="Conta">
          <Link href="/conta/seguranca" className="btn btn-ghost btn-sm"><Icon name="lock" /><span className="btn-label">Segurança da conta</span></Link>
          <form action={signOutAction}>
            <button type="submit" className="secondary btn-sm">Sair</button>
          </form>
        </nav>
      </div>
    </header>
  );
}
