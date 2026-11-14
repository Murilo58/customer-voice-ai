import Link from "next/link";
import type { TicketPriority, TicketStatus } from "@/generated/prisma/client";
import { PRIORITY_LABEL, SLA_STATE_LABEL, STATUS_LABEL } from "@/lib/labels";
import { Icon, type IconName } from "./icons";

// Componentes visuais reutilizáveis da área interna. Só apresentação: nenhum acesso a dados ou permissão.

export type Tone = "neutral" | "info" | "ok" | "warn" | "danger" | "ai";

/** Etiqueta curta com cor por significado. O texto sempre carrega a informação; a cor só reforça. */
export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return <span className={`tag tag-${tone}`} title={title}>{children}</span>;
}

const STATUS_TONE: Record<TicketStatus, Tone> = {
  new: "info",
  open: "info",
  waiting_customer: "warn",
  waiting_third_party: "warn",
  resolved: "ok",
  closed: "neutral",
  cancelled: "neutral",
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

const PRIORITY_TONE: Record<TicketPriority, Tone> = { low: "neutral", medium: "info", high: "warn", urgent: "danger" };

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return <Badge tone={PRIORITY_TONE[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
}

/** Situação de SLA da lista (on_time/at_risk/breached) ou de uma meta do detalhe (ok/risk/breached/met...). */
const SLA_TONE: Record<string, Tone> = {
  on_time: "ok", ok: "ok", met: "ok",
  at_risk: "warn", risk: "warn", met_late: "warn", paused: "neutral",
  breached: "danger",
  none: "neutral", cancelled: "neutral",
};

export function SlaBadge({ state }: { state: string }) {
  const label = SLA_STATE_LABEL[state] ?? state;
  return <Badge tone={SLA_TONE[state] ?? "neutral"}>{label.charAt(0).toUpperCase() + label.slice(1)}</Badge>;
}

/** Cabeçalho de página: voltar, título, linha de contexto e ações à direita. */
export function PageHeader({ title, meta, back, actions }: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        {back && <Link className="back-link" href={back.href}><Icon name="arrowLeft" />{back.label}</Link>}
        <h1>{title}</h1>
        {meta && <div className="meta">{meta}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

/** Card com título e ações opcionais no topo. */
export function Card({ title, actions, children, className, id }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`card${className ? ` ${className}` : ""}`}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

/** Classes de botão para usar em <button> nativo (inclusive com server actions). */
export function btn(variant: ButtonVariant = "primary", size?: "sm") {
  return `btn btn-${variant}${size ? ` btn-${size}` : ""}`;
}

/** Link com aparência de botão. */
export function ButtonLink({ href, icon, variant = "primary", size, children }: {
  href: string; icon?: IconName; variant?: ButtonVariant; size?: "sm"; children: React.ReactNode;
}) {
  return <Link href={href} className={btn(variant, size)}>{icon && <Icon name={icon} />}{children}</Link>;
}

/** Campo com rótulo, dica e erro. O controle filho deve apontar aria-describedby para `${id}-hint` / `${id}-error`. */
export function Field({ id, label, hint, error, children }: { id: string; label: React.ReactNode; hint?: React.ReactNode; error?: string; children: React.ReactNode }) {
  return (
    <div className={`field${error ? " field-invalid" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="field-hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="field-error" id={`${id}-error`} role="alert">{error}</p>}
    </div>
  );
}

/** Lista vazia com explicação e ação opcional. */
export function EmptyState({ icon = "inbox", title, children, action }: { icon?: IconName; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} /></span>
      <p className="empty-title">{title}</p>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

/**
 * Card com tabela: cabeçalho fixo e rolagem própria (nunca rola a página na horizontal). A região rolável recebe
 * foco de teclado e rótulo. Sem linhas, mostra o estado vazio no lugar da tabela.
 */
export function TableCard({ title, label, actions, empty, children }: {
  title?: React.ReactNode; label: string; actions?: React.ReactNode; empty?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <Card title={title} actions={actions} className="table-card">
      {empty ?? (
        <div className="table-scroll" tabIndex={0} role="region" aria-label={label}>
          <table className="data-table">{children}</table>
        </div>
      )}
    </Card>
  );
}
