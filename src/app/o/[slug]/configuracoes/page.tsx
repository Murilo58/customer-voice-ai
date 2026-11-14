import { notFound } from "next/navigation";
import {
  applySuggestedTaxonomyAction,
  createTaxonomyAction,
  setTaxonomyActiveAction,
  toggleAiAction,
  updateTaxonomyAction,
} from "@/app/actions/triage";
import { confirmInboundEmailAction, updateOrganizationAction } from "@/app/actions/teams";
import { appUrl, inboundDomain } from "@/server/email/sender";
import { addHolidayAction, removeHolidayAction, updateBusinessHoursAction, updateSlaPoliciesAction } from "@/app/actions/sla";
import { getSlaSettings } from "@/server/sla/settings";
import { ErrorAlert, param, Success, type SearchParams } from "@/app/components";
import { Badge, btn, Card, Field, PageHeader } from "@/app/ui/primitives";
import { PRIORITY_LABEL } from "@/lib/labels";
import { ForbiddenError } from "@/server/errors";
import { requireActor } from "@/server/identity/session";
import { getOrganizationSettings } from "@/server/organizations/service";
import { getAiSettings, listTaxonomy, type TaxonomyKind } from "@/server/servicedesk/taxonomy";

type Item = { id: string; name: string; defaultPriority: string | null; active: boolean };

const SECTIONS = [
  ["organizacao", "Organização"],
  ["email", "Portal e e-mail"],
  ["calendario", "Horário comercial"],
  ["sla", "Metas de SLA"],
  ["ia", "Triagem por IA"],
  ["categorias", "Categorias"],
  ["motivos", "Motivos"],
] as const;

function PrioritySelect({ value, id, label }: { value?: string | null; id?: string; label: string }) {
  return (
    <select id={id} name="default_priority" defaultValue={value ?? ""} aria-label={id ? undefined : label}>
      <option value="">Sem regra de prioridade</option>
      {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

function TaxonomyTable({ slug, kind, items }: { slug: string; kind: TaxonomyKind; items: Item[] }) {
  return (
    <>
      {items.length > 0 && (
        <div className="table-scroll" tabIndex={0} role="region" aria-label={`${kind === "category" ? "Categorias" : "Motivos"} (rolável)`}>
          <table className="data-table">
            <thead><tr><th scope="col">Nome e regra de prioridade (RN-10)</th><th scope="col">Situação</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <form action={updateTaxonomyAction.bind(null, slug, kind, i.id)} className="inline-form">
                      <input name="name" defaultValue={i.name} minLength={2} maxLength={80} aria-label={`Nome: ${i.name}`} />
                      <PrioritySelect value={i.defaultPriority} label={`Prioridade padrão de ${i.name}`} />
                      <button type="submit" className={btn("ghost", "sm")}>Salvar<span className="sr-only"> {i.name}</span></button>
                    </form>
                  </td>
                  <td>
                    <form action={setTaxonomyActiveAction.bind(null, slug, kind, i.id, !i.active)} className="inline-form">
                      {i.active ? <Badge tone="ok">Ativo</Badge> : <Badge tone="neutral">Desativado</Badge>}
                      <button type="submit" className={btn("ghost", "sm")}>{i.active ? "Desativar" : "Reativar"}<span className="sr-only"> {i.name}</span></button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form action={createTaxonomyAction.bind(null, slug, kind)} className="panel-section">
        <label htmlFor={`new_${kind}`}>{kind === "category" ? "Nova categoria" : "Novo motivo"}</label>
        <div className="inline-form">
          <input id={`new_${kind}`} name="name" required minLength={2} maxLength={80} />
          <PrioritySelect label={kind === "category" ? "Prioridade padrão da nova categoria" : "Prioridade padrão do novo motivo"} />
          <button type="submit" className={btn("secondary", "sm")}>Adicionar</button>
        </div>
      </form>
    </>
  );
}

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { actor } = await requireActor(slug);
  let ai: Awaited<ReturnType<typeof getAiSettings>>;
  try {
    ai = await getAiSettings(actor);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  const [taxonomy, org, sla] = await Promise.all([listTaxonomy(actor, { includeInactive: true }), getOrganizationSettings(actor), getSlaSettings(actor)]);
  const inbound = inboundDomain();
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const policy = (p: string) => sla.policies.find((x) => x.priority === p);
  const hours = (m: number | null | undefined) => (m ? String(Math.round((m / 60) * 100) / 100) : "");
  const portal = appUrl(`/p/${org.slug}`);
  return (
    <>
      <PageHeader title="Configurações" meta={<>Identificador {org.slug} · prefixo do protocolo {org.ticketPrefix}</>} />
      <nav className="view-tabs" aria-label="Seções das configurações">
        {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>
      <ErrorAlert code={param(sp, "erro")} />
      <Success show={param(sp, "ok") === "organizacao"}>Dados da organização salvos.</Success>
      <Success show={param(sp, "ok") === "calendario"}>Horário comercial salvo. Vale para chamados criados a partir de agora.</Success>
      <Success show={param(sp, "ok") === "email"}>E-mail de entrada marcado como configurado.</Success>
      <Success show={param(sp, "ok") === "sla"}>Metas de SLA salvas. Valem para chamados criados a partir de agora.</Success>

      <div className="settings-grid">
        <Card id="organizacao" title="Organização" actions={<span className="muted">RF-ORG-07</span>}>
          <form action={updateOrganizationAction.bind(null, slug)} className="form-stack">
            <Field id="org_name" label="Nome">
              <input id="org_name" name="name" defaultValue={org.name} required minLength={2} maxLength={120} />
            </Field>
            <Field id="timezone" label="Fuso horário">
              <select id="timezone" name="timezone" defaultValue={org.timezone}>
                {Intl.supportedValuesOf("timeZone").filter((z) => z.startsWith("America/") || z === org.timezone).map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </Field>
            <div className="form-actions"><button type="submit" className="btn btn-primary">Salvar</button></div>
          </form>
        </Card>

        <Card id="email" title="Portal e e-mail de entrada" actions={<span className="muted">RF-POR-01, RF-EML-02</span>}>
          <dl className="kv">
            <dt>Portal público</dt><dd><a href={portal}>{portal}</a></dd>
            <dt>E-mail de entrada</dt><dd>{inbound ? <code>{org.slug}@{inbound}</code> : <span className="muted">Não configurado neste ambiente (INBOUND_EMAIL_DOMAIN)</span>}</dd>
          </dl>
          {inbound && (
            <p className="panel-note">
              Divulgue o endereço ou encaminhe para ele o e-mail de atendimento do seu domínio. Mensagens novas viram chamados; respostas são associadas
              só com o token do chamado, o remetente do contato e a autenticação aprovada (RN-15). As demais vão para a quarentena.
            </p>
          )}
          <form action={confirmInboundEmailAction.bind(null, slug)} className="panel-section">
            <button type="submit" className={btn("secondary", "sm")}>Marcar e-mail de entrada como configurado</button>
          </form>
        </Card>
      </div>

      <div className="settings-grid">
        <Card id="calendario" title="Horário comercial e feriados" actions={<span className="muted">RN-23</span>}>
          <p className="panel-note">Fuso {sla.timezone}. O horário vale para chamados criados depois da alteração (CA-03.3); feriados valem para todos os chamados em aberto.</p>
          <form action={updateBusinessHoursAction.bind(null, slug)}>
            <table className="data-table week-table">
              <tbody>
                {["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"].map((label, d) => {
                  const h = sla.week[String(d) as keyof typeof sla.week];
                  return (
                    <tr key={d}>
                      <th scope="row"><label className="check-row"><input type="checkbox" name={`on_${d}`} value="1" defaultChecked={!!h} /> {label}</label></th>
                      <td>
                        <span className="time-range">
                          <input type="time" name={`start_${d}`} defaultValue={h ? hhmm(h[0]) : "09:00"} aria-label={`Início ${label}`} />
                          <span aria-hidden="true">às</span>
                          <input type="time" name={`end_${d}`} defaultValue={h ? hhmm(h[1]) : "18:00"} aria-label={`Fim ${label}`} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="form-actions"><button type="submit" className="btn btn-primary">Salvar horário</button></div>
          </form>
          <h3 className="sub-title">Feriados</h3>
          <ul className="simple-list">
            {sla.holidays.map((h) => (
              <li key={h.id}>
                <span><strong>{h.date.toISOString().slice(0, 10).split("-").reverse().join("/")}</strong> · {h.name}</span>
                <form action={removeHolidayAction.bind(null, slug, h.id)}>
                  <button type="submit" className={btn("ghost", "sm")}>Remover<span className="sr-only"> feriado {h.name}</span></button>
                </form>
              </li>
            ))}
            {sla.holidays.length === 0 && <li className="muted">Nenhum feriado cadastrado.</li>}
          </ul>
          <form action={addHolidayAction.bind(null, slug)} className="inline-form panel-gap">
            <input type="date" name="date" required aria-label="Data do feriado" />
            <input name="name" required minLength={2} maxLength={80} placeholder="Nome do feriado" aria-label="Nome do feriado" />
            <button type="submit" className={btn("secondary", "sm")}>Adicionar feriado</button>
          </form>
        </Card>

        <Card id="sla" title="Metas de SLA por prioridade" actions={<span className="muted">RF-SLA-01</span>}>
          <p className="panel-note">Em horas (aceita decimais). Vazio = sem meta. Em risco ao consumir 80% do prazo; a contagem pausa em Aguardando cliente ou terceiro.</p>
          <form action={updateSlaPoliciesAction.bind(null, slug)}>
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Metas de SLA (rolável)">
              <table className="data-table">
                <thead><tr><th scope="col">Prioridade</th><th scope="col">1ª resposta (h)</th><th scope="col">Resolução (h)</th><th scope="col">Horas úteis</th></tr></thead>
                <tbody>
                  {Object.entries(PRIORITY_LABEL).map(([p, label]) => (
                    <tr key={p}>
                      <th scope="row">{label}</th>
                      <td><input name={`frt_${p}`} inputMode="decimal" defaultValue={hours(policy(p)?.firstResponseMinutes)} aria-label={`Primeira resposta ${label}`} className="input-xs" /></td>
                      <td><input name={`res_${p}`} inputMode="decimal" defaultValue={hours(policy(p)?.resolutionMinutes)} aria-label={`Resolução ${label}`} className="input-xs" /></td>
                      <td><input type="checkbox" name={`biz_${p}`} value="1" defaultChecked={policy(p)?.businessHours ?? true} aria-label={`Horas úteis ${label}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-actions"><button type="submit" className="btn btn-primary">Salvar metas</button></div>
          </form>
        </Card>
      </div>

      <Card id="ia" title="Triagem por IA" actions={<span className="muted">RF-TRI-09</span>}>
        <div className="panel-row">
          <span>Situação</span>
          <form action={toggleAiAction.bind(null, slug, !ai.aiEnabled)} className="inline-form">
            {ai.aiEnabled ? <Badge tone="ok">Ativada</Badge> : <Badge tone="neutral">Desativada</Badge>}
            <button type="submit" className={btn(ai.aiEnabled ? "ghost" : "secondary", "sm")}>{ai.aiEnabled ? "Desativar" : "Ativar"}<span className="sr-only"> triagem por IA</span></button>
          </form>
        </div>
        <div className="panel-row"><span>Cota de {ai.period}</span><strong>{ai.quota.used} de {ai.quota.limit} operações</strong></div>
        <div className="panel-row"><span>Chamadas · tokens</span><span>{ai.usage.calls} · {ai.usage.inputTokens + ai.usage.outputTokens + ai.usage.thoughtTokens}</span></div>
        <div className="panel-row"><span>Custo estimado</span><span>US$ {ai.usage.costUsd.toFixed(4)}</span></div>
        <p className="panel-note">Até a decisão DP-01, a triagem recebe somente dados sintéticos (RIA-17). Provedor atual: {process.env.AI_PROVIDER ?? "simulated"}.</p>
      </Card>

      <div className="settings-grid">
        <Card id="categorias" title="Categorias" actions={<span className="muted">RF-ATD-13</span>}>
          {taxonomy.categories.length === 0 && (
            <form action={applySuggestedTaxonomyAction.bind(null, slug)} className="panel-gap">
              <button type="submit" className={btn("secondary", "sm")}>Aplicar modelo sugerido de categorias e motivos</button>
            </form>
          )}
          <TaxonomyTable slug={slug} kind="category" items={taxonomy.categories} />
        </Card>
        <Card id="motivos" title="Motivos">
          <TaxonomyTable slug={slug} kind="reason" items={taxonomy.reasons} />
        </Card>
      </div>
    </>
  );
}
