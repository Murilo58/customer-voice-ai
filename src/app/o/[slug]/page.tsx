import Link from "next/link";
import { Icon, type IconName } from "@/app/ui/icons";
import { ROLE_LABEL } from "@/server/organizations/permissions";
import { requireActor } from "@/server/identity/session";
import { getChecklist } from "@/server/organizations/onboarding";
import { can } from "@/server/organizations/permissions";
import { listMyOrganizations } from "@/server/organizations/service";
import { countPendingQuarantine } from "@/server/email/quarantine";
import { unreadCount } from "@/server/notifications/service";
import { getHomeSummary } from "@/server/servicedesk/home";

// Home operacional da organização. Todos os números vêm do banco (getHomeSummary, mesmas definições das
// visões da lista); cada bloco só aparece para quem tem a permissão correspondente.

function Kpi({ label, value, hint, href, tone }: { label: string; value: number; hint: string; href?: string; tone?: "warn" | "danger" }) {
  const body = (
    <>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value.toLocaleString("pt-BR")}</span>
      <span className="kpi-hint">{hint}</span>
    </>
  );
  const cls = `kpi${tone && value > 0 ? ` kpi-${tone}` : ""}`;
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Shortcut({ href, icon, title, text, count }: { href: string; icon: IconName; title: string; text: string; count?: number }) {
  return (
    <Link href={href} className="shortcut">
      <span className="shortcut-icon"><Icon name={icon} /></span>
      <span className="shortcut-text">
        <strong>{title}</strong>
        <span>{text}</span>
      </span>
      {count !== undefined && <span className="shortcut-count" aria-label={`${count} chamado(s)`}>{count}</span>}
    </Link>
  );
}

export default async function OrganizationHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, actor } = await requireActor(slug);
  const base = `/o/${slug}`;
  const service = can(actor.role, "service.access", actor.executiveRead);
  const canQuarantine = can(actor.role, "quarantine.manage", actor.executiveRead);
  const [orgs, summary, checklist, quarantined, unread] = await Promise.all([
    listMyOrganizations(user.id),
    service ? getHomeSummary(actor) : Promise.resolve(null),
    can(actor.role, "settings.manage") ? getChecklist(actor) : Promise.resolve(null),
    canQuarantine ? countPendingQuarantine(actor) : Promise.resolve(0),
    unreadCount(actor),
  ]);
  const orgName = orgs.find((m) => m.organization.slug === slug)?.organization.name ?? slug;
  const firstName = user.name.split(/\s+/)[0] ?? user.name;

  const attention: { tone: "danger" | "warn" | "info"; text: string; href: string; action: string }[] = [];
  if (summary) {
    const riskOnly = summary.slaRisk - summary.slaBreached;
    if (summary.slaBreached > 0) attention.push({ tone: "danger", text: `${summary.slaBreached} chamado(s) com SLA violado`, href: `${base}/chamados?sla=breached`, action: "Ver chamados" });
    if (riskOnly > 0) attention.push({ tone: "warn", text: `${riskOnly} chamado(s) com SLA em risco (80% do prazo ou mais)`, href: `${base}/chamados?sla=at_risk`, action: "Ver chamados" });
    if (summary.triageReview > 0) attention.push({ tone: "info", text: `${summary.triageReview} chamado(s) aguardando revisão da triagem`, href: `${base}/chamados?view=triage_review`, action: "Revisar" });
    if (summary.teamUnassigned > 0) attention.push({ tone: "info", text: `${summary.teamUnassigned} chamado(s) da sua equipe sem responsável`, href: `${base}/chamados?view=team_unassigned`, action: "Atribuir" });
  }
  if (quarantined > 0) attention.push({ tone: "warn", text: `${quarantined} e-mail(s) na quarentena aguardando decisão`, href: `${base}/quarentena`, action: "Analisar" });
  if (unread > 0) attention.push({ tone: "info", text: `${unread} alerta(s) não lido(s)`, href: `${base}/alertas`, action: "Ver alertas" });

  const pct = checklist ? Math.round((checklist.completed / checklist.total) * 100) : 0;

  return (
    <>
      <div className="page-header home-header">
        <div>
          <p className="eyebrow-sm">{orgName}</p>
          <h1>Olá, {firstName}</h1>
          <p className="meta">Perfil: {ROLE_LABEL[actor.role]}{actor.executiveRead ? " · leitura executiva" : ""}</p>
        </div>
        {service && (
          <Link href={`${base}/chamados/novo`} className="button-link">
            <Icon name="inbox" />Novo chamado
          </Link>
        )}
      </div>

      {summary && (
        <section aria-labelledby="kpi-title">
          <h2 id="kpi-title" className="section-title">Atendimento agora</h2>
          <div className="kpi-grid">
            <Kpi label="Chamados ativos" value={summary.active} hint="Novos, abertos e aguardando" href={`${base}/chamados`} />
            <Kpi label="Novos" value={summary.new} hint="Ainda sem atendimento" href={`${base}/chamados?status=new`} />
            <Kpi label="Sem responsável" value={summary.unassigned} hint="Chamados ativos" />
            <Kpi label="Aguardando" value={summary.waiting} hint="Cliente ou terceiro" />
            <Kpi label="SLA em risco" value={summary.slaRisk} hint={`Inclui ${summary.slaBreached} violado(s)`} href={`${base}/chamados?view=sla_risk`} tone={summary.slaBreached > 0 ? "danger" : "warn"} />
            <Kpi label="Hoje" value={summary.createdToday} hint={`Recebidos · ${summary.resolvedToday} resolvido(s)`} />
          </div>
        </section>
      )}

      <div className={`home-grid${summary ? "" : " home-grid-single"}`}>
        <section className="card" aria-labelledby="atalhos-title">
          <h2 id="atalhos-title">Atalhos</h2>
          {service && summary ? (
            <div className="shortcut-grid">
              <Shortcut href={`${base}/chamados?view=mine`} icon="inbox" title="Meus chamados" text="Ativos atribuídos a você" count={summary.mine} />
              <Shortcut href={`${base}/chamados?view=team_unassigned`} icon="team" title="Minha equipe sem responsável" text="Ativos das suas equipes" count={summary.teamUnassigned} />
              <Shortcut href={`${base}/chamados?view=triage_review`} icon="sparkles" title="Revisão da triagem" text="Sugestões da IA pendentes" count={summary.triageReview} />
              <Shortcut href={`${base}/contatos`} icon="users" title="Contatos" text="Clientes atendidos" />
              <Shortcut href={`${base}/empresas`} icon="layers" title="Empresas-cliente" text="Contatos por empresa" />
              {can(actor.role, "dashboard.read", actor.executiveRead) && <Shortcut href={`${base}/dashboard`} icon="chart" title="Dashboard" text="Indicadores do período" />}
            </div>
          ) : (
            <div className="shortcut-grid">
              <Shortcut href={`${base}/dashboard`} icon="chart" title="Dashboard" text="Indicadores do período (leitura executiva)" />
              <Shortcut href={`${base}/alertas`} icon="bell" title="Alertas" text="Avisos para você" />
            </div>
          )}
        </section>

        {(summary || attention.length > 0) && (
          <section className="card" aria-labelledby="pend-title">
            <h2 id="pend-title">Precisa de atenção</h2>
            {attention.length === 0 ? (
              <p className="all-clear"><Icon name="check" />Nada pendente no momento.</p>
            ) : (
              <ul className="attention-list">
                {attention.map((a) => (
                  <li key={a.text} className={`attention attention-${a.tone}`}>
                    <span className="attention-dot" aria-hidden="true" />
                    <span className="attention-text">{a.text}</span>
                    <Link href={a.href}>{a.action}<span className="sr-only">: {a.text}</span></Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {checklist && checklist.completed < checklist.total && (
        <section className="card" aria-labelledby="onb-title">
          {/* Checklist de configuração inicial (RF-ORG-11; CA-03.4) */}
          <div className="onb-head">
            <div>
              <h2 id="onb-title">Configuração inicial</h2>
              <p className="muted">{checklist.completed} de {checklist.total} etapas concluídas. Podem ser feitas em qualquer ordem.</p>
            </div>
            <strong className="onb-pct">{pct}%</strong>
          </div>
          <div className="progress" role="progressbar" aria-label="Progresso da configuração inicial" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <ol className="onb-list">
            {checklist.items.map((i) => (
              <li key={i.item} className={i.completedAt ? "done" : ""}>
                <span className="onb-mark" aria-hidden="true">{i.completedAt && <Icon name="check" />}</span>
                <span className="onb-text">
                  <span>{i.label}</span>
                  <span className="muted">{i.completedAt ? `Concluído em ${i.completedAt.toLocaleDateString("pt-BR")}` : "Pendente"}</span>
                </span>
                <Link href={`${base}/${i.path}`} className={i.completedAt ? "onb-link-done" : "onb-link"}>
                  {i.completedAt ? "Revisar" : "Configurar"}<span className="sr-only">: {i.label}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
