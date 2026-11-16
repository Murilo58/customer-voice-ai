import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/app/ui/brand";
import { Icon, type IconName } from "@/app/ui/icons";
import "./marketing.css";

// Página pública do produto. Conteúdo restrito ao que está implementado (I-0 a I-5); o roadmap do PRD
// aparece separado e marcado como planejado. Sem números, depoimentos, clientes ou certificações.
// Indexação continua desativada (metadata raiz) enquanto o deploy for de teste, não comercial.

export const metadata: Metadata = {
  title: "VoxDesk AI — atendimento com IA para PMEs",
  description: "Central de atendimento multiempresa com triagem por IA revisada pela equipe, SLA, portal do cliente e indicadores.",
};

const FEATURES: { icon: IconName; title: string; text: string; note?: string }[] = [
  {
    icon: "inbox",
    title: "Gestão de chamados",
    text: "Protocolo por organização, situações do atendimento, responsável, equipes, categorias e motivos. Visões prontas como “Meus chamados” e “SLA em risco”.",
  },
  {
    icon: "mail",
    title: "Atendimento por e-mail",
    text: "E-mails recebidos viram chamados, e as respostas do cliente voltam para o chamado certo. Remetentes suspeitos vão para quarentena antes de chegar à equipe.",
  },
  {
    icon: "sparkles",
    title: "Triagem por IA com revisão humana",
    text: "A IA sugere tipo, categoria, motivo, prioridade com justificativa, sentimento e risco de escalada. A equipe aceita ou corrige cada sugestão.",
    note: "Modelo de IA em homologação",
  },
  {
    icon: "clock",
    title: "SLA e alertas",
    text: "Metas de primeira resposta e resolução por prioridade, em horário comercial com feriados. Pausa enquanto aguarda o cliente e alerta quando o prazo entra em risco.",
  },
  {
    icon: "history",
    title: "Histórico e auditoria",
    text: "Linha do tempo completa de cada chamado, com mensagens, notas internas e eventos. Registro de auditoria que não pode ser alterado nem apagado.",
  },
  {
    icon: "chart",
    title: "Indicadores",
    text: "Volume, backlog, tempos de resposta e resolução, cumprimento do SLA, taxa de aceitação da triagem e satisfação do cliente (CSAT), com filtros por período e equipe.",
  },
];

const ALSO: { icon: IconName; text: string }[] = [
  { icon: "globe", text: "Portal do cliente com acesso por link enviado por e-mail" },
  { icon: "paperclip", text: "Anexos verificados e sanitizados antes de ficarem disponíveis" },
  { icon: "lock", text: "Dados de cada organização isolados no banco de dados" },
  { icon: "gauge", text: "Consumo de IA visível e limitado por organização" },
  { icon: "team", text: "Papéis de Administrador, Gestor e Atendente, além de leitura executiva" },
];

const STEPS = [
  { title: "O cliente entra em contato", text: "Pelo portal da sua empresa ou por e-mail. Cada manifestação recebe um protocolo." },
  { title: "A IA organiza", text: "Sugere classificação e prioridade, com a justificativa visível para a equipe." },
  { title: "A equipe resolve", text: "Revisa as sugestões, responde ao cliente e acompanha os prazos do SLA." },
  { title: "Você enxerga onde melhorar", text: "Indicadores e avaliações dos clientes mostram o que está funcionando e o que não está." },
];

const SECURITY = [
  "Isolamento por organização aplicado no próprio banco de dados",
  "Acesso somente por convite, com papéis e permissões",
  "Auditoria das ações administrativas, somente inserção",
  "Anexos verificados por tipo e reprocessados antes do download",
  "Verificação anti-bot no portal público e limite de tentativas",
  "Verificação em duas etapas para a administração da plataforma",
];

const ROADMAP = [
  { version: "v1.1", title: "Assistente de atendimento", text: "Base de conhecimento, respostas sugeridas com aprovação da equipe e respostas prontas." },
  { version: "v1.2", title: "Inteligência de CX", text: "Recorrência, tendências e temas emergentes com evidência, planos de ação e importação de histórico por CSV." },
  { version: "v1.3", title: "Qualidade e automações", text: "Apoio à avaliação de qualidade, distribuição e escalonamento automáticos." },
  { version: "v2.0", title: "Novos canais e integrações", text: "WhatsApp, chat, API pública e integrações com outras plataformas." },
];

function Cta({ children = "Acessar plataforma" }: { children?: React.ReactNode }) {
  return (
    <Link href="/app" className="btn btn-primary">
      {children}
      <Icon name="arrowRight" />
    </Link>
  );
}

export default function LandingPage() {
  return (
    <div className="mk">
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <header className="mk-header">
        <div className="mk-container mk-header-inner">
          <Brand />
          <nav className="mk-nav" aria-label="Seções da página">
            <a href="#produto">Produto</a>
            <a href="#funcionalidades">Funcionalidades</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#roadmap">Roadmap</a>
          </nav>
          <Link href="/app" className="btn btn-primary btn-sm">Acessar plataforma</Link>
        </div>
      </header>

      <main id="conteudo" className="mk-main">
        <section className="mk-hero" aria-labelledby="hero-title">
          <div className="mk-container mk-hero-grid">
            <div>
              <p className="pill"><span className="pill-dot" aria-hidden="true" />VoxDesk AI v1.0</p>
              <h1 id="hero-title">Transforme cada interação com o cliente em resolução, aprendizado e melhoria contínua</h1>
              <p className="lead">
                Central de atendimento para pequenas e médias empresas, com triagem por IA revisada pela sua equipe, SLA, portal do
                cliente e indicadores em um só lugar.
              </p>
              <div className="mk-actions">
                <Cta />
                <a href="#funcionalidades" className="btn btn-secondary">Ver funcionalidades</a>
              </div>
            </div>
            <figure className="mock" aria-label="Ilustração de um chamado com sugestões da IA e prazo de SLA">
              <div className="mock-bar" aria-hidden="true"><span /><span /><span /></div>
              <div className="mock-body" aria-hidden="true">
                <div className="mock-head">
                  <span className="mock-protocol">LOJA-000128</span>
                  <span className="tag tag-warn">SLA em risco</span>
                </div>
                <p className="mock-subject">Pedido entregue com item faltando</p>
                <p className="mock-msg">“Recebi o pedido ontem, mas faltou um dos itens. Preciso de uma solução ainda esta semana.”</p>
                <div className="mock-ai">
                  <p className="mock-ai-title"><Icon name="sparkles" /> Sugestões da IA</p>
                  <ul>
                    <li><span>Tipo</span><strong>Reclamação</strong></li>
                    <li><span>Categoria</span><strong>Entrega</strong></li>
                    <li><span>Prioridade</span><strong>Alta</strong></li>
                    <li><span>Risco de escalada</span><strong>Médio</strong></li>
                  </ul>
                  <p className="mock-why">Justificativa: item faltante com prazo indicado pelo cliente.</p>
                  <div className="mock-buttons"><span className="mock-btn">Aceitar</span><span className="mock-btn mock-btn-ghost">Alterar</span></div>
                </div>
                <div className="mock-sla">
                  <span>1ª resposta</span>
                  <span className="mock-track"><span className="mock-fill" /></span>
                  <span>82% do prazo</span>
                </div>
              </div>
              <figcaption>Ilustração com dados fictícios</figcaption>
            </figure>
          </div>
        </section>

        <section id="produto" className="mk-section" aria-labelledby="produto-title">
          <div className="mk-container">
            <p className="eyebrow">Para quem é</p>
            <h2 id="produto-title">Feito para equipes de atendimento de PMEs</h2>
            <p className="section-lead">
              Empresas de tecnologia, serviços e comércio eletrônico que precisam atender bem e entender o que os clientes estão dizendo.
            </p>
            <div className="mk-grid-3">
              <article className="mk-card">
                <h3>Histórico que vira diagnóstico</h3>
                <p>Cada chamado é classificado de forma padronizada, para que o histórico de atendimento sirva de base para decisões.</p>
              </article>
              <article className="mk-card">
                <h3>Classificação consistente</h3>
                <p>A IA sugere e a equipe confirma: os mesmos critérios para todos os atendentes, com justificativa visível.</p>
              </article>
              <article className="mk-card">
                <h3>Casos urgentes à vista</h3>
                <p>Prioridade, risco de escalada e prazos de SLA destacados para que nenhum caso crítico passe despercebido.</p>
              </article>
            </div>
          </div>
        </section>

        <section id="funcionalidades" className="mk-section mk-section-alt" aria-labelledby="func-title">
          <div className="mk-container">
            <p className="eyebrow">Funcionalidades</p>
            <h2 id="func-title">Tudo o que a equipe precisa para atender, em uma plataforma</h2>
            <div className="mk-grid-3">
              {FEATURES.map((f) => (
                <article className="mk-card feature" key={f.title}>
                  <span className="feature-icon"><Icon name={f.icon} /></span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                  <p className="status-row">
                    <span className="tag tag-ok">Disponível</span>
                    {f.note && <span className="tag tag-neutral">{f.note}</span>}
                  </p>
                </article>
              ))}
            </div>
            <div className="also">
              <h3>Também incluído</h3>
              <ul>
                {ALSO.map((a) => (
                  <li key={a.text}><Icon name={a.icon} />{a.text}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="como-funciona" className="mk-section" aria-labelledby="como-title">
          <div className="mk-container">
            <p className="eyebrow">Como funciona</p>
            <h2 id="como-title">Do primeiro contato ao indicador</h2>
            <ol className="steps">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <span className="step-n" aria-hidden="true">{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mk-section mk-section-alt" aria-labelledby="seg-title">
          <div className="mk-container mk-split">
            <div>
              <p className="eyebrow">Segurança e governança</p>
              <h2 id="seg-title">Cada organização com seus dados, e cada ação registrada</h2>
              <p className="section-lead">A plataforma atende várias empresas ao mesmo tempo, com controles pensados para isso desde o início.</p>
            </div>
            <ul className="checklist">
              {SECURITY.map((s) => (
                <li key={s}><Icon name="check" />{s}</li>
              ))}
            </ul>
          </div>
        </section>

        <section id="roadmap" className="mk-section" aria-labelledby="roadmap-title">
          <div className="mk-container">
            <p className="eyebrow">Roadmap</p>
            <h2 id="roadmap-title">O que vem a seguir</h2>
            <p className="section-lead">Recursos planejados, sem data definida. Cada versão começa depois que a anterior é validada.</p>
            <div className="mk-grid-4">
              {ROADMAP.map((r) => (
                <article className="mk-card roadmap" key={r.version}>
                  <p className="status-row"><span className="tag tag-neutral">Planejado</span><span className="version">{r.version}</span></p>
                  <h3>{r.title}</h3>
                  <p>{r.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mk-cta" aria-labelledby="cta-title">
          <div className="mk-container mk-cta-inner">
            <div>
              <h2 id="cta-title">Conheça o VoxDesk AI</h2>
              <p>Uma plataforma inteligente para centralizar atendimentos, organizar chamados e melhorar a experiência dos seus clientes.</p>
            </div>
            <Cta />
          </div>
        </section>
      </main>

      <footer className="mk-footer">
        <div className="mk-container mk-footer-inner">
          <Brand />
          <p>VoxDesk AI · Uma solução Orizon</p>
        </div>
      </footer>
    </div>
  );
}
