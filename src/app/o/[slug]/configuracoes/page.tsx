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
import { PRIORITY_LABEL } from "@/lib/labels";
import { ForbiddenError } from "@/server/errors";
import { requireActor } from "@/server/identity/session";
import { getOrganizationSettings } from "@/server/organizations/service";
import { getAiSettings, listTaxonomy, type TaxonomyKind } from "@/server/servicedesk/taxonomy";

type Item = { id: string; name: string; defaultPriority: string | null; active: boolean };

function PrioritySelect({ value }: { value?: string | null }) {
  return (
    <select name="default_priority" defaultValue={value ?? ""} aria-label="Prioridade padrão">
      <option value="">Sem regra de prioridade</option>
      {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

function TaxonomyTable({ slug, kind, items }: { slug: string; kind: TaxonomyKind; items: Item[] }) {
  return (
    <>
      <table>
        <thead><tr><th>Nome e regra de prioridade (RN-10)</th><th>Situação</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>
                <form action={updateTaxonomyAction.bind(null, slug, kind, i.id)}>
                  <input name="name" defaultValue={i.name} minLength={2} maxLength={80} aria-label="Nome" /> <PrioritySelect value={i.defaultPriority} />{" "}
                  <button type="submit" className="link">salvar</button>
                </form>
              </td>
              <td>
                <form action={setTaxonomyActiveAction.bind(null, slug, kind, i.id, !i.active)}>
                  {i.active ? "Ativo" : "Desativado"} · <button type="submit" className="link">{i.active ? "desativar" : "reativar"}</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form action={createTaxonomyAction.bind(null, slug, kind)}>
        <label>Novo {kind === "category" ? "categoria" : "motivo"}</label>
        <input name="name" required minLength={2} maxLength={80} /> <PrioritySelect />
        <button type="submit">Adicionar</button>
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
  return (
    <>
      <h1>Configurações</h1>
      <ErrorAlert code={param(sp, "erro")} />
      <Success show={param(sp, "ok") === "organizacao"}>Dados da organização salvos.</Success>
      <Success show={param(sp, "ok") === "calendario"}>Horário comercial salvo. Vale para chamados criados a partir de agora.</Success>
      <Success show={param(sp, "ok") === "email"}>E-mail de entrada marcado como configurado.</Success>
      <Success show={param(sp, "ok") === "sla"}>Metas de SLA salvas. Valem para chamados criados a partir de agora.</Success>
      <div className="card" id="organizacao">
        <h2>Organização (RF-ORG-07)</h2>
        <form action={updateOrganizationAction.bind(null, slug)}>
          <label htmlFor="org_name">Nome</label>
          <input id="org_name" name="name" defaultValue={org.name} required minLength={2} maxLength={120} />
          <label htmlFor="timezone">Fuso horário</label>
          <select id="timezone" name="timezone" defaultValue={org.timezone}>
            {Intl.supportedValuesOf("timeZone").filter((z) => z.startsWith("America/") || z === org.timezone).map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
          <p className="muted">Identificador: {org.slug} · Prefixo do protocolo: {org.ticketPrefix}.</p>
          <button type="submit">Salvar</button>
        </form>
      </div>
      <div className="card" id="email">
        <h2>Portal e e-mail de entrada (RF-POR-01, RF-EML-02)</h2>
        <p>Portal público: <a href={appUrl(`/p/${org.slug}`)}>{appUrl(`/p/${org.slug}`)}</a></p>
        {inbound ? (
          <>
            <p>Endereço de entrada exclusivo: <code>{org.slug}@{inbound}</code></p>
            <p className="muted">
              Divulgue o endereço ou encaminhe para ele o e-mail de atendimento do seu domínio. Mensagens novas viram chamados; respostas são associadas
              só com o token do chamado, o remetente do contato e a autenticação aprovada (RN-15). As demais vão para a quarentena.
            </p>
          </>
        ) : <p className="muted">O recebimento de e-mail não está configurado neste ambiente (INBOUND_EMAIL_DOMAIN).</p>}
        <form action={confirmInboundEmailAction.bind(null, slug)}>
          <button type="submit">Marcar e-mail de entrada como configurado</button>
        </form>
      </div>
      <div className="card" id="calendario">
        <h2>Horário comercial e feriados (RN-23)</h2>
        <p className="muted">Fuso {sla.timezone}. O horário vale para chamados criados depois da alteração (CA-03.3); feriados valem para todos os chamados em aberto.</p>
        <form action={updateBusinessHoursAction.bind(null, slug)}>
          <table>
            <tbody>
              {["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"].map((label, d) => {
                const h = sla.week[String(d) as keyof typeof sla.week];
                return (
                  <tr key={d}>
                    <th><label><input type="checkbox" name={`on_${d}`} value="1" defaultChecked={!!h} /> {label}</label></th>
                    <td>
                      <input type="time" name={`start_${d}`} defaultValue={h ? hhmm(h[0]) : "09:00"} aria-label={`Início ${label}`} /> às{" "}
                      <input type="time" name={`end_${d}`} defaultValue={h ? hhmm(h[1]) : "18:00"} aria-label={`Fim ${label}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button type="submit">Salvar horário</button>
        </form>
        <h3>Feriados</h3>
        <ul>
          {sla.holidays.map((h) => (
            <li key={h.id}>
              {h.date.toISOString().slice(0, 10)} · {h.name}{" "}
              <form action={removeHolidayAction.bind(null, slug, h.id)} className="inline"><button type="submit" className="link">remover</button></form>
            </li>
          ))}
          {sla.holidays.length === 0 && <li className="muted">Nenhum feriado cadastrado.</li>}
        </ul>
        <form action={addHolidayAction.bind(null, slug)}>
          <input type="date" name="date" required aria-label="Data" /> <input name="name" required minLength={2} maxLength={80} placeholder="Nome do feriado" aria-label="Nome" />{" "}
          <button type="submit">Adicionar feriado</button>
        </form>
      </div>
      <div className="card" id="sla">
        <h2>Metas de SLA por prioridade (RF-SLA-01)</h2>
        <p className="muted">Em horas (aceita decimais). Vazio = sem meta. Em risco ao consumir 80% do prazo; a contagem pausa em Aguardando cliente ou terceiro.</p>
        <form action={updateSlaPoliciesAction.bind(null, slug)}>
          <table>
            <thead><tr><th>Prioridade</th><th>Primeira resposta (h)</th><th>Resolução (h)</th><th>Horas úteis</th></tr></thead>
            <tbody>
              {Object.entries(PRIORITY_LABEL).map(([p, label]) => (
                <tr key={p}>
                  <th>{label}</th>
                  <td><input name={`frt_${p}`} inputMode="decimal" defaultValue={hours(policy(p)?.firstResponseMinutes)} aria-label={`Primeira resposta ${label}`} className="input-xs" /></td>
                  <td><input name={`res_${p}`} inputMode="decimal" defaultValue={hours(policy(p)?.resolutionMinutes)} aria-label={`Resolução ${label}`} className="input-xs" /></td>
                  <td><input type="checkbox" name={`biz_${p}`} value="1" defaultChecked={policy(p)?.businessHours ?? true} aria-label={`Horas úteis ${label}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="submit">Salvar metas</button>
        </form>
      </div>
      <div className="card">
        <h2>Triagem por IA (RF-TRI-09)</h2>
        <p>
          Situação: <strong>{ai.aiEnabled ? "ativada" : "desativada"}</strong>{" "}
          <form action={toggleAiAction.bind(null, slug, !ai.aiEnabled)} className="inline">
            <button type="submit" className="link">{ai.aiEnabled ? "desativar" : "ativar"}</button>
          </form>
        </p>
        <p className="muted">
          Consumo de {ai.period}: {ai.quota.used} de {ai.quota.limit} operações · {ai.usage.calls} chamadas · {ai.usage.inputTokens + ai.usage.outputTokens + ai.usage.thoughtTokens} tokens · custo estimado US$ {ai.usage.costUsd.toFixed(4)}
        </p>
        <p className="muted">Até a decisão DP-01, a triagem recebe somente dados sintéticos (RIA-17). Provedor atual: {process.env.AI_PROVIDER ?? "simulated"}.</p>
      </div>
      <div className="card" id="categorias">
        <h2>Categorias (RF-ATD-13)</h2>
        {taxonomy.categories.length === 0 && (
          <form action={applySuggestedTaxonomyAction.bind(null, slug)}>
            <button type="submit">Aplicar modelo sugerido de categorias e motivos</button>
          </form>
        )}
        <TaxonomyTable slug={slug} kind="category" items={taxonomy.categories} />
      </div>
      <div className="card">
        <h2>Motivos</h2>
        <TaxonomyTable slug={slug} kind="reason" items={taxonomy.reasons} />
      </div>
    </>
  );
}
