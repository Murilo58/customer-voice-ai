import Link from "next/link";
import { Brand } from "./brand";
import { Icon } from "./icons";
import "../marketing.css";

const HIGHLIGHTS = [
  "Chamados por portal e e-mail em uma só central",
  "Triagem por IA com revisão da equipe",
  "SLA, histórico completo e indicadores",
];

/** Telas de acesso (login, recuperação, 2FA, convites): painel institucional + formulário. Só apresentação. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-panel" aria-label="Sobre o VoxDesk AI">
        <Brand className="brand-inverse" />
        <div className="auth-panel-body">
          <h2>Atendimento que aprende com cada cliente</h2>
          <ul>
            {HIGHLIGHTS.map((h) => (
              <li key={h}><Icon name="check" />{h}</li>
            ))}
          </ul>
        </div>
        <Link href="/" className="auth-back"><Icon name="arrowLeft" />Voltar ao site</Link>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <Brand className="auth-mobile-brand" />
          <h1>{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          {children}
        </div>
      </main>
    </div>
  );
}
