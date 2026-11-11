# PRD — Customer Voice AI

09/11/2026 · Murilo Costa

## Controle do documento

**Versão 0.3 — Homologado (revisão controlada de anexos).** Base: PRD 0.2 (homologado) + ADR-008 revisão 2 (aprovada com condições). Esta versão altera **apenas** os requisitos e restrições de anexos. Visão comercial, escopo geral da v1.0, roadmap, arquitetura de IA e demais requisitos permanecem os do PRD 0.2. A implementação continua bloqueada até autorização expressa.

| Item | Valor |
| --- | --- |
| Produto | Customer Voice AI |
| Tipo | SaaS B2B multi-tenant |
| Versão | 0.3 |
| Status | Homologado — revisão controlada de anexos |
| Base | PRD 0.2 + ADR-008 revisão 2 |
| Fase atual | Fase 3: Arquitetura (aguardando homologação) |
| Próxima fase | Fase 4: Planejamento da implementação (somente após homologação da arquitetura) |
| Idioma | Português brasileiro |

**Histórico de alterações**

| Versão | Data | Resumo |
| --- | --- | --- |
| 0.1 | 09/11/2026 | Primeira versão completa do PRD |
| 0.2 | 09/11/2026 | Revisão direcionada. Principais mudanças: critérios de conclusão separados em Marco A (homologação técnica), Gate de dados reais e Marco B (beta validado); novo marco interno MVP Core; requisitos de anexos detalhados (RSG-12, RSG-17 a RSG-19, DP-12 reescrita); regras de segurança do e-mail de entrada (RN-15 a RN-19, novo RF-EML-08); anonimização, exclusão e retenção legal detalhadas por tipo de dado (RN-30, RN-31, RN-33 a RN-35, RF-CLI-05, novo RF-CLI-06); correção de contradições (RN-06, RN-11, RN-32, RF-TRI-08 com RIA-06); novos RF para onboarding e página pública (RF-ORG-11, RF-PUB-01) e novas histórias HU-19 e HU-20; critérios de aceite para todos os requisitos funcionais, com matriz RF → HU → CA; novas decisões pendentes DP-16 e DP-17 |
| 0.3 | 09/11/2026 | Revisão controlada de anexos, conforme ADR-008 rev. 2. Itens alterados: RSG-12 (formatos PNG, JPEG, WEBP, PDF, TXT e CSV; limite de 4 MB por arquivo no Marco A, substituindo a proposta de DOCX, XLSX, ODT e 10 MB); RSG-17 (demais formatos bloqueados); RSG-18 (Vercel Blob privado; download por rota autenticada); RSG-19 (quarentena, sanitização por CDR, sanitização não substitui antimalware, não homologado para anexos reais, nenhuma aceitação de risco autorizada); RI-04 e introdução da seção 14 (armazenamento decidido); RF-ATD-09 (referências); RN-33 (nova limitação f); tabela 10.5.1 (linha Anexos); CA-10.8 (download autenticado); novo CA-10.9 (sanitização e quarentena) e matriz 19.1; RSK-15; DEP-05; DEP-11; novo DEP-12; DP-08 (decidida); DP-12; DP-15; nova DP-18 (exclusão no Vercel Blob); nova DA-20; CC-13; CC-15; CC-17; resumo executivo (pendências); seção 16.2 (I-4); glossário (CDR). Nenhum requisito funcional novo |

**Novas decisões pendentes da versão 0.2:** DP-16 (questões jurídicas de anonimização, exclusão e retenção) e DP-17 (prazos operacionais de logs, quarentena e exportações). A DP-12 (antimalware) foi reescrita. **Nova pendência da versão 0.3:** DP-18 (comportamento da exclusão no Vercel Blob, antes do I-4). Ver seção 25.2.

**Convenção de status das decisões**

- **Aprovada (DA):** decidida pelo responsável pelo produto. Não é reaberta sem nova decisão formal.
- **Proposta:** recomendação deste PRD, válida após a homologação do documento.
- **Pendente (DP):** sem decisão. Não pode ser tratada como aprovada.
- **A verificar:** depende de confirmação em fonte oficial e atual (documentação, termos de uso, preços).

**Prefixos de identificadores**

| Prefixo | Significado |
| --- | --- |
| OBJ | Objetivo de negócio |
| DA / DP | Decisão aprovada / decisão pendente |
| RF | Requisito funcional (com sufixo do módulo, ex.: RF-ATD-01) |
| RN | Regra de negócio |
| RNF | Requisito não funcional |
| RIA | Requisito de IA e Gemini API |
| RSG | Requisito de segurança e privacidade |
| RI | Requisito de integração |
| HU / CA | História de usuário / critério de aceite |
| KPI | Indicador de sucesso |
| MC / CC | Critério do marco MVP Core / critério de conclusão (Marco A, Gate de dados reais, Marco B) |
| RSK / PRM / RST / DEP | Risco / premissa / restrição / dependência |

**Diferenças entre os conceitos**

- **Requisito funcional:** o que o sistema faz.
- **Regra de negócio:** política ou cálculo que o sistema aplica, independente da tela.
- **Requisito não funcional:** como o sistema se comporta (desempenho, segurança, disponibilidade).
- **Critério de aceite:** condição verificável que torna uma história aceita.
- **Critério de sucesso (KPI):** resultado de negócio medido após o uso.
- **Critério de conclusão:** condição para declarar um marco do projeto encerrado (seção 26).

## 1. Resumo executivo

O Customer Voice AI é uma plataforma SaaS B2B multi-tenant de gestão de atendimento e experiência do cliente. Sua diferença está em transformar cada manifestação em dado estruturado por IA, base para melhoria contínua. O produto terá central de atendimento própria, mas compete pela inteligência aplicada aos dados, não pelo volume de recursos de helpdesk.

A **v1.0 (Atendimento Inteligente)** entrega o ciclo operacional completo:

- Organizações em beta fechado por convite.
- Equipe com perfis de acesso.
- Chamados recebidos por portal e por e-mail.
- Triagem pela Gemini API com revisão humana.
- SLA básico, portal do cliente com avaliação (CSAT) e dashboard operacional.
- Auditoria essencial e medição de consumo de IA por organização.

As versões seguintes acrescentam:

- **v1.1:** Copilot com base de conhecimento e RAG.
- **v1.2:** CX Intelligence com planos de ação básicos. A importação de CSV entra na v1.1 ou na v1.2 (DP-13).
- **v1.3:** análise de qualidade e automações controladas.
- **v2.0:** omnichannel, integrações e expansão comercial.

Planos comerciais e cobrança entram antes do primeiro cliente pagante, em qualquer ponto após a v1.0.

A v1.0 tem três marcos (seção 26):

1. **MVP Core:** demonstração interna de atendimento e triagem, só com dados fictícios.
2. **Marco A:** MVP tecnicamente homologado.
3. **Marco B:** beta comercial validado com organização real. Antes dele, o **Gate de dados reais** exige condições legais, de segurança e de infraestrutura.

**Decisões estruturais aprovadas**

- Google Gemini é o único provedor de LLM, priorizando a Gemini Developer API.
- Infraestrutura base: Vercel, Neon PostgreSQL e GitHub.
- Novas assinaturas pagas só com aprovação prévia.
- A IA sugere e o humano decide. Nenhuma ação crítica é automática.
- Indicadores quantitativos são calculados por código, nunca pela LLM.

**Pendências que bloqueiam a arquitetura**

- Provedor de autenticação (Clerk ou Better Auth).
- Serviço de e-mail de entrada e saída.
- ~~Armazenamento de anexos~~ — decidido na versão 0.3: Vercel Blob privado (DA-20).
- Fila de processamento assíncrono.
- Observabilidade.
- Estratégia antimalware para anexos reais (DP-12, antes do Gate de dados reais; nenhuma aceitação de risco autorizada).
- Plano da Vercel compatível com uso comercial.
- Confirmação dos termos de dados da Gemini Developer API para uso comercial.

A lista completa está na seção 25.

## 2. Visão do produto

Ser a plataforma que permite a pequenas e médias empresas atender bem e aprender sistematicamente com cada manifestação de seus clientes. O produto fecha o ciclo **manifestação → atendimento → análise → diagnóstico → ação corretiva → monitoramento**.

Público inicial: PMEs de tecnologia, serviços e comércio eletrônico, sem restrição de segmento na arquitetura. Operações centradas em dados sensíveis de saúde ou em informações financeiras altamente reguladas não são público-alvo nesta etapa (DA-10).

## 3. Problema de negócio

Os problemas abaixo são hipóteses a validar no beta fechado. Não há pesquisa de mercado formal que os comprove.

- **H1.** PMEs registram atendimentos, mas raramente transformam o histórico em diagnóstico. Os dados ficam presos em chamados individuais.
- **H2.** A classificação manual de chamados é inconsistente entre atendentes, o que torna os relatórios por categoria pouco confiáveis.
- **H3.** Chamados urgentes ou com risco de escalada externa (Procon, Reclame Aqui, ação judicial) não são identificados a tempo.
- **H4.** Gestores não conseguem ligar uma ação corretiva à variação posterior nos indicadores.
- **H5.** Ferramentas com análise avançada de CX têm custo ou complexidade inadequados para PMEs.

## 4. Objetivos

| ID | Objetivo | Versão |
| --- | --- | --- |
| OBJ-01 | Oferecer operação de atendimento completa e segura para múltiplas organizações isoladas | v1.0 |
| OBJ-02 | Classificar automaticamente as manifestações com qualidade mensurável e revisão humana | v1.0 |
| OBJ-03 | Garantir cumprimento e visibilidade de SLAs | v1.0 |
| OBJ-04 | Dar ao cliente final um canal simples de registro, acompanhamento e avaliação | v1.0 |
| OBJ-05 | Fornecer indicadores operacionais calculados de forma determinística | v1.0 |
| OBJ-06 | Manter custo de IA e infraestrutura mensurável e controlável por organização | v1.0 |
| OBJ-07 | Aumentar a produtividade do atendente com assistência de IA baseada em conhecimento da organização | v1.1 |
| OBJ-08 | Identificar padrões, tendências e temas emergentes com evidência rastreável | v1.2 |
| OBJ-09 | Fechar o ciclo de melhoria contínua com planos de ação e medição de resultado | v1.2 |
| OBJ-10 | Apoiar a avaliação de qualidade do atendimento sem decisões disciplinares automáticas | v1.3 |
| OBJ-11 | Ampliar canais e integrações e viabilizar a cobrança comercial | v2.0 |

## 5. Proposta de valor

**Transformar cada interação com o cliente em uma oportunidade de resolução, aprendizado e melhoria contínua.**

O produto combina atendimento, inteligência artificial, Customer Experience e melhoria contínua. Os diferenciais propostos, a validar no beta:

| ID | Diferencial | Versão |
| --- | --- | --- |
| D1 | Triagem estruturada como sensor de CX: cada chamado gera tipo, categoria, motivo, sentimento, urgência e risco padronizados | v1.0 |
| D2 | Prioridade explicável: regras de negócio combinadas com sinais da IA, com justificativa visível | v1.0 |
| D3 | Detecção de risco de escalada externa no contexto brasileiro | v1.0 |
| D4 | Transparência do consumo de IA por organização | v1.0 |
| D5 | Evidência rastreável: todo insight da IA aponta para os chamados que o sustentam | v1.2 |
| D6 | Ciclo fechado: insight, plano de ação e indicador antes e depois | v1.2 |
| D7 | Diagnóstico de histórico importado via CSV | v1.2 |

## 6. Público-alvo e personas

Os cinco perfis da proposta original foram mantidos, com dois ajustes:

- O **Superadmin da plataforma** foi acrescentado.
- O **Gestor executivo** passa a ser, no MVP, uma permissão somente leitura do perfil Gestor.

O cliente final pertence a um domínio de identidade separado: ele não é usuário da organização.

| Persona | Domínio | Responsabilidades principais | Versão |
| --- | --- | --- | --- |
| Superadmin da plataforma | Operador do SaaS | Convidar organizações para o beta, suspender organizações, acompanhar consumo global de IA, suporte de segundo nível. Sem acesso ao conteúdo dos chamados pela aplicação (RN-32) | v1.0 |
| Administrador da organização | Organização | Usuários, equipes, categorias, motivos, SLAs, horário comercial, e-mail de entrada, parâmetros da organização | v1.0 |
| Gestor de atendimento | Organização | Filas, indicadores, distribuição, acompanhamento de SLA e da qualidade da triagem | v1.0 |
| Atendente | Organização | Receber, revisar triagem, responder e resolver chamados | v1.0 |
| Gestor executivo | Organização | Indicadores consolidados (MVP: leitura do dashboard). Tendências e recomendações a partir da v1.2 | v1.0 (leitura) / v1.2 |
| Cliente final (contato) | Externo | Registrar, acompanhar, responder e avaliar | v1.0 |
| Analista de qualidade | Organização | Revisar avaliações de qualidade da IA | v1.3 (pode ser permissão do Gestor) |
| Responsável por melhoria (CX) | Organização | Planos de ação e acompanhamento de resultados | v1.2 (pode ser permissão do Gestor) |

O cliente final é modelado como **Contato**, opcionalmente vinculado a uma **Empresa-cliente**, porque o público de tecnologia e serviços costuma ser B2B.

## 7. Jornadas dos usuários (v1.0)

**J1. Entrada da organização no beta**

1. O Superadmin envia um convite para o e-mail do responsável da organização.
2. O responsável aceita o convite, cria a conta e se torna Administrador.
3. O Administrador segue o checklist de configuração inicial (RF-ORG-11):
   1. Dados da organização.
   2. Horário comercial.
   3. Equipes.
   4. Categorias, com modelo inicial sugerido.
   5. Política de SLA.
   6. Endereço de e-mail de entrada.
4. O Administrador convida atendentes e gestores.

**J2. Manifestação por portal**

1. O cliente acessa o portal público da organização e preenche o formulário.
2. O sistema cria o chamado com protocolo único e confirma por e-mail, com link de acompanhamento.
3. A triagem por IA ocorre de forma assíncrona.
4. O chamado entra na fila sugerida, com os campos marcados como “sugestão da IA”.

**J3. Manifestação por e-mail**

1. O cliente envia e-mail ao endereço de entrada da organização.
2. O sistema identifica ou cria o contato e cria o chamado. Se for resposta a um chamado existente, associa a mensagem a ele somente se a validação de RN-15 for atendida. Caso contrário, a mensagem vai para a quarentena (RN-17).
3. A partir daí, segue como em J2.

**J3b. Registro manual pelo atendente**

1. O atendente cadastra ou localiza o contato (ex.: manifestação recebida por telefone).
2. Cria o chamado com canal “manual”.
3. A partir daí, segue como em J2, a partir da triagem.

**J4. Atendimento**

1. O atendente abre a fila e assume o chamado.
2. Revisa as sugestões da triagem, confirmando ou corrigindo.
3. Responde publicamente ou registra nota interna.
4. Altera o status. Ao resolver, o cliente recebe e-mail com convite para avaliação.

**J5. Acompanhamento pelo cliente**

1. O cliente acessa o chamado pelo link do e-mail ou por link mágico.
2. Vê o histórico público e responde.
3. Após a resolução, avalia (CSAT) ou reabre dentro do prazo permitido.

**J6. Gestão**

1. O gestor acompanha o dashboard: volume, backlog, SLA, CSAT e taxa de aceitação da triagem.
2. Filtra por período, equipe e categoria.
3. Redistribui chamados com SLA em risco.

## 8. Escopo funcional

O produto completo tem 12 módulos. A v1.0 entrega MOD-01 a MOD-05 e MOD-09 de forma parcial, além de dois recursos transversais: e-mail e medição de consumo. Os requisitos detalhados existem apenas para o MVP (seção 9). Os demais módulos serão detalhados em PRDs incrementais antes de cada versão (RST-02).

| Módulo | Incluído na v1.0 | Adiado | Versão alvo do restante |
| --- | --- | --- | --- |
| MOD-01 Autenticação e organizações | Convite de organizações, autenticação, convite de colaboradores, perfis fixos, equipes, configurações, checklist de configuração inicial, isolamento, auditoria essencial, backoffice mínimo do Superadmin, página pública mínima do produto | Cadastro público, perfis customizáveis, SSO/SAML, MFA obrigatório configurável | v2.0 |
| MOD-02 Central de atendimento | Abertura, protocolo, contatos e empresas-cliente, assunto e descrição, categorias, prioridades, responsável, filas, status, histórico, notas internas, respostas públicas, anexos, busca textual e filtros, reabertura, registro de alterações | Respostas prontas (v1.1), mesclagem de chamados, campos customizados, ações em massa | v1.1 / v1.3 |
| MOD-03 Portal do cliente | Formulário público, acesso por link mágico, consulta, histórico, resposta, anexos, CSAT, responsivo | Personalização visual avançada, domínio próprio, base de conhecimento pública | v1.1 / v2.0 |
| MOD-04 Filas e SLAs | Equipes como filas, atribuição manual e “assumir”, um calendário por organização com feriados, SLA por prioridade (primeira resposta e resolução), pausa, alertas in-app, violações | Distribuição automática, escalonamento automático, múltiplos calendários, SLA por cliente ou contrato | v1.3 |
| MOD-05 Triagem inteligente | Tipo, categoria, motivo, sentimento, urgência, prioridade sugerida, equipe sugerida, risco de escalada, justificativa, revisão humana | Detecção de duplicidade (depende de embeddings) | v1.1 |
| MOD-06 AI Support Copilot | — | Módulo inteiro | v1.1 |
| MOD-07 Base de conhecimento | — | Módulo inteiro, incluindo RAG | v1.1 |
| MOD-08 CX Intelligence | — | Módulo inteiro | v1.2 |
| MOD-09 Dashboards | Operacional: recebidos, resolvidos, pendentes, por categoria e prioridade, tempo médio de primeira resposta, tempo médio de resolução, SLA, CSAT, por equipe, aceitação da triagem, consumo de IA | Executivo, recorrência, tendências, relatórios exportáveis | v1.2 |
| MOD-10 Qualidade | — | Módulo inteiro | v1.3 |
| MOD-11 Planos de ação | — | Versão básica (v1.2), comparação avançada de resultados (v1.3) | v1.2 / v1.3 |
| MOD-12 Integrações | E-mail de entrada e saída (DA-03) | Importação de CSV (v1.1 ou v1.2), WhatsApp, chat, API pública, CRM, outras plataformas | v1.2 / v2.0 |
| Transversal: consumo e cotas | Medição de chamadas e tokens Gemini por organização, cotas, alertas | Planos comerciais, assinaturas, pagamentos | Antes da cobrança |

## 9. Requisitos funcionais do MVP (v1.0)

O MVP tem 71 requisitos funcionais, todos obrigatórios para a v1.0. Cada requisito aponta para o objetivo que atende. A versão 0.2 acrescentou quatro: RF-ORG-11, RF-PUB-01, RF-CLI-06 e RF-EML-08. Eles explicitam itens que já constavam das jornadas, dos incrementos ou das regras de segurança e privacidade, sem nova funcionalidade de produto. A cobertura por critérios de aceite está na seção 19.1.

**9.1 Organizações, usuários e acesso (ORG)**

| ID | Requisito | OBJ |
| --- | --- | --- |
| RF-ORG-01 | O Superadmin cria convites de organização com e-mail do responsável e validade definida | OBJ-01 |
| RF-ORG-02 | O convidado aceita o convite, cria a organização (nome, identificador, fuso horário) e torna-se Administrador | OBJ-01 |
| RF-ORG-03 | O sistema autentica usuários da equipe com sessão segura, mecanismo de recuperação de acesso (definido em DP-03) e logout em todos os dispositivos | OBJ-01 |
| RF-ORG-04 | O Administrador convida colaboradores por e-mail, atribuindo perfil (Administrador, Gestor ou Atendente) e equipes | OBJ-01 |
| RF-ORG-05 | O Administrador desativa e reativa usuários. Usuário desativado perde acesso imediatamente e mantém seu histórico | OBJ-01 |
| RF-ORG-06 | O Administrador cria, edita e arquiva equipes e define seus membros | OBJ-01 |
| RF-ORG-07 | O Administrador configura dados da organização, fuso horário, horário comercial, feriados, identidade básica do portal (nome e logotipo) e e-mail de entrada | OBJ-01 |
| RF-ORG-08 | Um usuário pode pertencer a mais de uma organização e alterna entre elas sem novo login. O contexto ativo fica sempre visível | OBJ-01 |
| RF-ORG-09 | O Superadmin lista organizações, suspende ou reativa uma organização e consulta consumo agregado, sem visualizar conteúdo de chamados | OBJ-01, OBJ-06 |
| RF-ORG-10 | O Administrador pode atribuir a um usuário o perfil Gestor com a opção “leitura executiva”. Essa opção restringe o acesso ao dashboard, em modo somente leitura e sem acesso a chamados, contatos ou configurações | OBJ-05 |
| RF-ORG-11 | Após criar a organização, o Administrador vê um checklist de configuração inicial (dados, horário comercial, equipes, categorias e motivos com modelo sugerido, SLA, e-mail de entrada, convite da equipe), com o progresso de cada item. O checklist pode ser concluído em qualquer ordem e retomado depois | OBJ-01 |
| RF-PUB-01 | A plataforma tem uma página pública mínima com a descrição do produto, contato para o beta e links para Termos de Uso, Política de Privacidade e lista de suboperadores (RSG-20, RSG-21) | OBJ-01 |

**9.2 Clientes (CLI)**

| ID | Requisito | OBJ |
| --- | --- | --- |
| RF-CLI-01 | O sistema mantém contatos (nome, e-mail, telefone opcional) por organização, com e-mail único dentro da organização | OBJ-01 |
| RF-CLI-02 | Um contato pode ser vinculado a uma empresa-cliente (nome, domínio de e-mail opcional) | OBJ-01 |
| RF-CLI-03 | O sistema cria contatos automaticamente a partir do portal e do e-mail de entrada | OBJ-01 |
| RF-CLI-04 | Atendentes consultam o perfil do contato com o histórico de chamados | OBJ-01 |
| RF-CLI-05 | O Administrador atende pedidos de titulares. Exporta os dados de um contato e executa a anonimização do contato e de seus chamados, conforme RN-30 e RN-33. A execução exige confirmação explícita, gera registro de auditoria e um comprovante para a organização, e é recusada enquanto houver retenção legal ativa (RF-CLI-06) | OBJ-01 |
| RF-CLI-06 | O Administrador marca um contato ou chamado com retenção legal (motivo obrigatório e data de revisão). Isso impede a anonimização manual e a expiração automática até a remoção da marca, que também é auditada (RN-34) | OBJ-01 |

**9.3 Central de atendimento (ATD)**

| ID | Requisito | OBJ |
| --- | --- | --- |
| RF-ATD-01 | O sistema cria chamados pelo portal, pelo e-mail de entrada e manualmente pelo atendente, registrando o canal de origem | OBJ-01 |
| RF-ATD-02 | Cada chamado recebe protocolo único legível por organização (RN-01) | OBJ-01 |
| RF-ATD-03 | O chamado contém assunto, descrição, contato, tipo, categoria, motivo, prioridade, status, equipe, responsável, canal e datas | OBJ-01 |
| RF-ATD-04 | O atendente envia respostas públicas (visíveis ao cliente e enviadas por e-mail) e notas internas (nunca visíveis ao cliente) | OBJ-01 |
| RF-ATD-05 | O sistema exibe uma linha do tempo única com mensagens, notas, mudanças de campo e eventos de triagem e SLA, com autor e data | OBJ-01 |
| RF-ATD-06 | O atendente assume chamados da fila de suas equipes. O Gestor atribui e reatribui chamados a qualquer membro da equipe | OBJ-01 |
| RF-ATD-07 | O sistema aplica o ciclo de status definido em RN-05 | OBJ-01 |
| RF-ATD-08 | O cliente pode reabrir chamados resolvidos dentro do prazo de RN-07. Após o prazo, uma nova mensagem gera novo chamado vinculado | OBJ-01 |
| RF-ATD-09 | Chamados e mensagens aceitam anexos, conforme RSG-12 e RSG-17 a RSG-19 | OBJ-01 |
| RF-ATD-10 | Listagem com filtros por status, prioridade, equipe, responsável, categoria, tipo, canal, situação de SLA, risco de escalada e período, e ordenação por prazo de SLA | OBJ-01, OBJ-03 |
| RF-ATD-11 | Busca textual por protocolo, assunto, descrição, nome e e-mail do contato, restrita à organização ativa | OBJ-01 |
| RF-ATD-12 | Visões pré-definidas: “Meus chamados”, “Minha equipe sem responsável”, “SLA em risco”, “Aguardando revisão da triagem” | OBJ-01 |
| RF-ATD-13 | O Administrador mantém categorias e motivos da organização (criar, renomear, desativar), sem apagar histórico (RN-12) | OBJ-02 |

**9.4 Portal do cliente (POR)**

| ID | Requisito | OBJ |
| --- | --- | --- |
| RF-POR-01 | Cada organização tem portal público com formulário (nome, e-mail, assunto, descrição, anexos), protegido contra abuso (RSG-11) | OBJ-04 |
| RF-POR-02 | Após o envio, o cliente recebe e-mail com protocolo e link de acompanhamento | OBJ-04 |
| RF-POR-03 | O cliente solicita acesso informando seu e-mail e recebe link mágico de uso único e curta validade para ver seus chamados naquela organização | OBJ-04 |
| RF-POR-04 | O cliente vê status e histórico público, responde e anexa arquivos. Notas internas, triagem e dados de outros contatos nunca são exibidos | OBJ-04 |
| RF-POR-05 | Após a resolução, o cliente avalia o atendimento (CSAT de 1 a 5, comentário opcional) pelo portal ou pelo link do e-mail | OBJ-04, OBJ-05 |
| RF-POR-06 | O portal é responsivo e atende os requisitos de acessibilidade (RNF-09) | OBJ-04 |

**9.5 E-mail (EML)**

| ID | Requisito | OBJ |
| --- | --- | --- |
| RF-EML-01 | O sistema envia e-mails transacionais: confirmação de abertura, resposta pública, mudança para resolvido com convite de CSAT, link mágico, convites de usuário e organização | OBJ-04 |
| RF-EML-02 | Cada organização recebe um endereço de entrada exclusivo, em domínio da plataforma. Encaminhamento a partir do domínio próprio da organização é suportado por configuração do cliente | OBJ-01 |
| RF-EML-03 | Mensagens recebidas geram chamados ou são associadas a um chamado existente somente após a validação de RN-15. Mensagens que não passam na validação seguem RN-17 | OBJ-01 |
| RF-EML-04 | O sistema identifica mensagens automáticas e duplicadas e evita loops de e-mail, conforme RN-16 e RN-18 | OBJ-01 |
| RF-EML-05 | Anexos de e-mail passam pelas mesmas validações de RSG-12, RSG-17, RSG-18 e RSG-19 | OBJ-01 |
| RF-EML-06 | O sistema extrai o texto novo da resposta, removendo o histórico citado, e preserva a mensagem original (sanitizada, conforme RN-19) para auditoria | OBJ-01 |
| RF-EML-08 | Cada organização tem uma fila de quarentena de mensagens recebidas, visível apenas a Gestores e Administradores. Para cada mensagem, eles podem associar a um chamado, criar um novo chamado ou descartar. A ação exige justificativa e é auditada. Mensagens em quarentena não aparecem no chamado nem no portal e não disparam notificações (RN-17) | OBJ-01 |
| RF-EML-07 | O sistema registra o status de entrega dos e-mails de saída quando o provedor oferecer essa informação | OBJ-04 |

**9.6 SLA (SLA)**

| ID | Requisito | OBJ |
| --- | --- | --- |
| RF-SLA-01 | O Administrador define, por prioridade, metas de primeira resposta e de resolução, em horas úteis ou corridas | OBJ-03 |
| RF-SLA-02 | O sistema calcula prazos com o calendário da organização (RN-20 a RN-24) | OBJ-03 |
| RF-SLA-03 | O chamado exibe tempo restante e situação: no prazo, em risco ou violado | OBJ-03 |
| RF-SLA-04 | O sistema gera alerta in-app para o responsável e para o Gestor quando o SLA entra em risco ou é violado | OBJ-03 |
| RF-SLA-05 | Violações são registradas de forma imutável para os indicadores | OBJ-03, OBJ-05 |

**9.7 Triagem inteligente (TRI)**

| ID | Requisito | OBJ |
| --- | --- | --- |
| RF-TRI-01 | Todo chamado novo é enviado de forma assíncrona para triagem pela Gemini API | OBJ-02 |
| RF-TRI-02 | A triagem retorna, em formato estruturado: tipo de manifestação, categoria, motivo, sentimento, urgência, sinais de risco de escalada, equipe sugerida, justificativa curta e confiança por campo | OBJ-02 |
| RF-TRI-03 | A prioridade sugerida é calculada por regras determinísticas que combinam os sinais da IA com regras da organização (RN-10) | OBJ-02, OBJ-03 |
| RF-TRI-04 | O sistema preenche os campos com as sugestões, marcadas visualmente como “sugestão da IA” até a revisão | OBJ-02 |
| RF-TRI-05 | O atendente confirma todas as sugestões com uma ação, ou corrige campo a campo | OBJ-02 |
| RF-TRI-06 | O sistema registra o resultado original da IA, as alterações, o revisor, a data e hora, o modelo e a versão do prompt (RN-11) | OBJ-02 |
| RF-TRI-07 | Se a triagem falhar, expirar ou a cota estiver esgotada, o chamado segue para a fila padrão com indicação “triagem indisponível”, e a operação continua manual | OBJ-02, OBJ-06 |
| RF-TRI-08 | O Gestor solicita reprocessamento de uma triagem. Por padrão, ele só é executado se a chave de idempotência mudou (RIA-06). O Gestor pode forçar o reprocessamento com justificativa obrigatória. Nesse caso, a execução é auditada, consome cota e gera nova revisão (RN-11) | OBJ-02, OBJ-06 |
| RF-TRI-09 | O Administrador ativa ou desativa a triagem por IA para a organização | OBJ-06 |

**9.8 Dashboard operacional (DSH)**

| ID | Requisito | OBJ |
| --- | --- | --- |
| RF-DSH-01 | O dashboard exibe recebidos, resolvidos, pendentes (backlog), distribuição por categoria, tipo e prioridade, tempo médio de primeira resposta, tempo médio de resolução, % de SLA cumprido, CSAT e indicadores por equipe | OBJ-05 |
| RF-DSH-02 | O dashboard exibe a taxa de aceitação da triagem, total e por campo (RN-13) | OBJ-02 |
| RF-DSH-03 | Filtros por período, equipe, categoria e canal | OBJ-05 |
| RF-DSH-04 | Todos os indicadores são calculados por consultas ao banco, com definições documentadas (RN-40 a RN-45). Nenhum valor é produzido pela LLM | OBJ-05 |
| RF-DSH-05 | O Administrador visualiza o consumo de IA da organização (chamadas, tokens, cota usada) | OBJ-06 |

**9.9 Auditoria (AUD)**

| ID | Requisito | OBJ |
| --- | --- | --- |
| RF-AUD-01 | O sistema registra eventos de auditoria: login e falhas de login, convites, mudanças de perfil e equipe, configurações, SLA, categorias, exportações, anonimizações, revisões de triagem, acessos do Superadmin | OBJ-01 |
| RF-AUD-02 | O Administrador consulta e filtra a trilha de auditoria da sua organização | OBJ-01 |
| RF-AUD-03 | Registros de auditoria não podem ser alterados ou excluídos pela interface ou API da aplicação | OBJ-01 |

**9.10 Consumo de IA e cotas (CON)**

| ID | Requisito | OBJ |
| --- | --- | --- |
| RF-CON-01 | Cada chamada à Gemini API registra organização, funcionalidade, modelo, tokens de entrada e de saída, latência, resultado e custo estimado | OBJ-06 |
| RF-CON-02 | Cada organização tem cota mensal de operações de IA, configurável pelo Superadmin | OBJ-06 |
| RF-CON-03 | Alertas ao Administrador e ao Superadmin em 80% e 100% da cota | OBJ-06 |
| RF-CON-04 | O Superadmin define um teto global de gasto de IA da plataforma. Ao atingi-lo, novas chamadas são suspensas e entra o modo degradado (RF-TRI-07) | OBJ-06 |

## 10. Regras de negócio

As regras abaixo valem para a v1.0. Parâmetros marcados como “padrão” são propostas configuráveis por organização, a homologar.

**10.1 Chamados e status**

| ID | Regra |
| --- | --- |
| RN-01 | O protocolo é sequencial por organização, com prefixo configurável (ex.: ACME-000123). Nunca é reutilizado, nem após anonimização |
| RN-02 | Todo chamado pertence a exatamente uma organização e a exatamente um contato. A organização nunca muda após a criação |
| RN-03 | Tipos de manifestação são fixos na plataforma: Reclamação, Solicitação, Dúvida, Sugestão, Elogio. Isso garante comparabilidade histórica entre organizações e períodos |
| RN-04 | Prioridades são fixas: Baixa, Média, Alta, Urgente |
| RN-05 | Status e transições: Novo → Aberto (ao ser assumido ou respondido) → Aguardando cliente / Aguardando terceiro → Aberto (quando chega resposta) → Resolvido → Fechado (automático após o prazo de RN-07). Resolvido → Aberto na reabertura. Cancelado é permitido a partir de Novo ou Aberto, com motivo obrigatório |
| RN-06 | Um chamado só vai para Resolvido se tiver categoria e tipo confirmados por humano: sugestão da IA aceita ou corrigida, ou valor preenchido manualmente quando não houver triagem (IA desativada, falha ou cota esgotada) |
| RN-07 | O cliente pode reabrir o chamado até 7 dias corridos após a resolução (padrão). Depois disso, o chamado passa a Fechado e uma nova mensagem cria um chamado vinculado |
| RN-08 | Resposta do cliente em chamado “Aguardando cliente” retorna o status para Aberto automaticamente |
| RN-09 | Nota interna nunca gera e-mail ao cliente e nunca aparece no portal |

**10.2 Triagem e prioridade**

| ID | Regra |
| --- | --- |
| RN-10 | A prioridade sugerida resulta de regras, nesta ordem. A justificativa registra qual regra prevaleceu: (1) regras explícitas da organização por categoria ou motivo (ex.: “falha de pagamento = Alta”); (2) risco de escalada externa detectado eleva a prioridade no mínimo para Alta; (3) a urgência identificada pela IA define o valor-base; (4) o sentimento sozinho nunca eleva a prioridade acima de Média |
| RN-11 | Cada execução de triagem gera um registro próprio de revisão. Cada campo fica como aceito, alterado (com valor original e novo) ou pendente. Um reprocessamento (RF-TRI-08) gera nova execução, nova revisão e não apaga as anteriores. Alterações feitas depois da revisão entram no histórico normal do chamado |
| RN-12 | Categorias e motivos desativados permanecem nos chamados antigos. Renomear preserva o identificador interno, o que mantém a série histórica |
| RN-13 | Taxa de aceitação da triagem = campos aceitos sem alteração ÷ campos revisados, por período, considerando a execução mais recente de cada chamado. Triagens não revisadas ficam fora do cálculo e são reportadas à parte |
| RN-14 | A IA só pode sugerir categorias, motivos e equipes ativos da própria organização. Valor fora da lista é descartado e o campo fica “sem sugestão” |

**10.3 E-mail**

Princípio: uma mensagem recebida nunca é associada automaticamente a um chamado existente sem validação segura, e nunca expõe o histórico de um chamado a quem não é o contato verificado. Toda decisão de associação, recusa, quarentena ou descarte gera evento rastreável, com motivo.

| ID | Regra |
| --- | --- |
| RN-15 | **Associação a chamado existente.** A associação automática exige as três condições: (a) **vínculo válido**: token de resposta do chamado (aleatório, de alta entropia, exclusivo por chamado, incluído no endereço de resposta) ou cabeçalho In-Reply-To/References que corresponda a um Message-ID emitido pela plataforma para esse chamado; (b) o chamado pertence à mesma organização do endereço de entrada que recebeu a mensagem; (c) o remetente é o e-mail do contato do chamado e a mensagem não falhou na autenticação do remetente, quando o provedor de e-mail informar esse resultado (SPF, DKIM, DMARC). Protocolo no assunto, nome do remetente ou texto da mensagem nunca bastam para associar. Sem vínculo, a mensagem é tratada como nova manifestação. Com vínculo, mas sem as condições (b) ou (c), aplica-se RN-17 |
| RN-16 | **Mensagens automáticas.** Respostas automáticas, avisos de férias, bounces e notificações de entrega são identificados por cabeçalhos padrão (ex.: Auto-Submitted, Precedence, remetente nulo, relatório de entrega). Elas não geram chamado, não alteram status nem SLA e nunca recebem resposta automática. Ficam registradas no log técnico de recebimento pelo prazo de DP-17. Proteção contra loop: mais de 10 mensagens do mesmo remetente para a mesma organização em 1 hora (padrão) vão para a quarentena, e a plataforma não envia mais de 1 e-mail automático por hora ao mesmo endereço de origem não verificado |
| RN-17 | **Remetente não verificado e identificação inconsistente.** Vão para a quarentena da organização (RF-EML-08): (i) vínculo válido com remetente diferente do contato; (ii) remetente correto com falha de autenticação; (iii) token inválido, expirado ou de outra organização; (iv) vínculos contraditórios, como token de um chamado e cabeçalho de outro. Mensagem em quarentena não é anexada à linha do tempo, não aparece no portal, não notifica o contato, não altera status nem SLA, não é enviada à triagem por IA e não gera ao remetente nenhuma resposta com conteúdo do chamado. A tentativa recusada é registrada com o motivo. A liberação exige ação humana auditada: associar ao chamado como mensagem interna marcada “remetente não verificado”, criar novo chamado para o remetente ou descartar |
| RN-18 | **Duplicidade.** Mensagem com Message-ID já processado na mesma organização é ignorada e registrada. Eventos repetidos do provedor (reentrega de webhook) são processados de forma idempotente. Mensagem sem Message-ID, com remetente, assunto e corpo idênticos a outra recebida nos últimos 10 minutos (padrão), é marcada como “possível duplicata”, mas não é descartada automaticamente |
| RN-19 | **Conteúdo potencialmente malicioso.** O HTML recebido é sanitizado antes de armazenar e exibir: scripts, formulários, iframes e estilos ativos são removidos. Imagens remotas não são carregadas automaticamente e links são exibidos sem pré-carregamento. Mensagens acima do limite de tamanho são recusadas e registradas. Mensagens marcadas como spam pelo provedor, quando essa informação existir, vão para a quarentena. Anexos seguem RSG-12 e RSG-17 a RSG-19. O texto continua não confiável para a IA (RIA-08). E-mails enviados pela plataforma contêm apenas a mensagem nova e o link de acompanhamento, nunca o histórico completo do chamado |

**10.4 SLA**

| ID | Regra |
| --- | --- |
| RN-20 | O prazo de primeira resposta conta a partir da criação e termina na primeira resposta pública de um humano. Notas internas e mensagens automáticas não contam |
| RN-21 | O prazo de resolução conta a partir da criação e termina em Resolvido. A reabertura retoma a contagem do tempo restante |
| RN-22 | A contagem pausa em “Aguardando cliente” e “Aguardando terceiro” |
| RN-23 | Horas úteis consideram o horário comercial e os feriados da organização, no seu fuso horário |
| RN-24 | “Em risco” significa 80% do prazo consumido (padrão). Mudar a prioridade recalcula o prazo a partir da criação, com a nova meta |

**10.5 Dados e privacidade**

**Conceitos.** Este PRD distingue quatro tratamentos. Se eles atendem a cada obrigação legal concreta é uma questão jurídica pendente (DP-16).

- **Exclusão:** remoção definitiva do registro da base ativa.
- **Anonimização:** remoção ou substituição dos dados que identificam o titular, de forma que a reidentificação não seja possível por meios técnicos razoáveis disponíveis à plataforma. Não é garantia absoluta, por causa das cópias e referências indiretas listadas em RN-33.
- **Pseudonimização:** substituição por identificador que ainda permite vincular os registros entre si. Usada nos registros de auditoria.
- **Retenção legal:** conservação de dados determinada pela organização controladora por obrigação legal ou regulatória, ou para exercício de direitos. Suspende a anonimização e a expiração (RN-34).

| ID | Regra |
| --- | --- |
| RN-30 | A anonimização de um contato aplica o comportamento por tipo de dado da tabela 10.5.1. Ela é irreversível na base ativa, mas não alcança as cópias listadas em RN-33. O processo preserva os campos estruturados necessários aos indicadores agregados (RN-35) |
| RN-31 | A retenção de chamados é configurável por organização. O prazo padrão está pendente (DP-11). Chamados Fechados ou Cancelados há mais tempo que o prazo têm seus contatos anonimizados automaticamente conforme RN-30, exceto quando houver retenção legal (RN-34). A expiração automática só é ativada após a decisão de DP-11 e DP-16. Até lá, a retenção é registrada, mas não executada automaticamente |
| RN-32 | O Superadmin não tem funcionalidade de acesso ao conteúdo de chamados na v1.0. O acesso técnico excepcional à base, só para resposta a incidentes, segue o procedimento de RSG-16 e é registrado em log operacional de acesso, com motivo, responsável e período |
| RN-33 | **Limitações da anonimização, informadas à organização no comprovante:** (a) backups seguem RN-36; (b) dados já enviados à Gemini API ou a outros suboperadores ficam sujeitos aos termos deles e não podem ser recuperados pela plataforma (DP-01); (c) arquivos exportados e baixados pela organização ficam sob responsabilidade dela; (d) menções ao titular no conteúdo de chamados de outros contatos não são detectadas automaticamente; (e) informações estruturadas remanescentes podem, em contextos muito específicos, permitir reidentificação indireta; (f) a irreversibilidade da exclusão de anexos no armazenamento (Vercel Blob) depende da verificação de DP-18 e não é presumida |
| RN-34 | Contato ou chamado com retenção legal (RF-CLI-06) não é anonimizado nem expira enquanto a marca estiver ativa. Pedido de titular sobre dado retido é registrado e informado ao Administrador, a quem cabe a resposta ao titular |
| RN-35 | Indicadores agregados (RN-40 a RN-45) são recalculados a partir dos campos estruturados preservados e não mudam com a anonimização. Os indicadores do MVP não têm nível de detalhe por contato |
| RN-36 | **Backups.** Não são alterados individualmente. Os dados anonimizados permanecem neles até a expiração do ciclo de backup do provedor (DEP-02). A plataforma mantém um registro das anonimizações executadas, sem dados pessoais, e reaplica essas anonimizações após qualquer restauração, antes de liberar o acesso |

**10.5.1 Comportamento da anonimização por tipo de dado**

| Tipo de dado | Comportamento |
| --- | --- |
| Dados cadastrais do contato (nome, e-mail, telefone) | Excluídos. O contato passa a ser identificado por um código aleatório (“Contato anonimizado ABC123”), sem derivar do e-mail ou de outro dado. O vínculo com empresa-cliente é removido |
| Empresa-cliente | Mantida se tiver outros contatos. Excluída se ficar sem contatos e sem retenção legal |
| Conteúdo de mensagens (assunto, descrição, respostas públicas, notas internas, mensagens em quarentena) | O texto é substituído integralmente por um marcador (“conteúdo removido por anonimização”). Não se tenta remover dados pessoais trecho a trecho, por não ser confiável. Os originais preservados para auditoria (RF-EML-06) também são removidos |
| Histórico de atendimento (eventos, status, datas, atribuições, SLA) | Mantido, sem dados pessoais do titular. Nomes de atendentes são dados de usuários da organização e permanecem |
| Resultado da triagem | Campos estruturados mantidos (tipo, categoria, motivo, sentimento, urgência, risco, prioridade, equipe). A justificativa textual da IA é removida |
| Anexos | Objetos excluídos do armazenamento (Vercel Blob). Metadados reduzidos a tipo e tamanho. **A exclusão não é presumida irreversível:** comportamento, versionamento e possibilidade de recuperação dependem de DP-18 |
| CSAT | Nota mantida. Comentário textual removido |
| Registros de auditoria | Eventos preservados para rastreabilidade. Referências ao contato passam ao código aleatório (pseudonimização), e dados pessoais em campos de detalhe são mascarados. O próprio evento de anonimização fica registrado (quem, quando, escopo), sem dados do titular. A adequação desse tratamento depende de DP-16 |
| Logs técnicos | Não devem conter dados pessoais (RSG-08). Entradas residuais não são editadas individualmente e expiram pelo prazo de DP-17 |
| Índices de busca e caches | Atualizados ou removidos junto com a base ativa. Embeddings, a partir da v1.1, são excluídos |
| Exportações | Arquivos gerados pela plataforma expiram no prazo de DP-17 e são excluídos. Cópias baixadas seguem RN-33 (c) |
| Backups | RN-36 |
| Indicadores agregados | Preservados (RN-35) |
| Dados enviados à Gemini API | Não recuperáveis pela plataforma. Sujeitos à retenção do provedor conforme os termos vigentes (DP-01). Exposição reduzida previamente pela minimização (RIA-09) |

**Exclusão** de dados ocorre no encerramento da organização (RSG-25) e na expiração de exportações, logs e quarentena. A exclusão total dos chamados de um contato, sem preservar indicadores, não faz parte da v1.0 e depende de DP-16.

**10.6 Indicadores**

| ID | Regra |
| --- | --- |
| RN-40 | Tempo de primeira resposta = da criação até a primeira resposta pública humana. A média e a mediana são exibidas em horas úteis e corridas |
| RN-41 | Tempo de resolução = da criação até a última transição para Resolvido |
| RN-42 | % de SLA cumprido = chamados com a meta atingida ÷ chamados cuja meta venceu ou foi atingida no período, separado por primeira resposta e por resolução |
| RN-43 | CSAT = avaliações 4 ou 5 ÷ total de avaliações no período. A média simples e a taxa de resposta também são exibidas |
| RN-44 | Backlog = chamados em qualquer status diferente de Resolvido, Fechado ou Cancelado no fim do período |
| RN-45 | Chamados cancelados ficam fora dos indicadores de tempo e de SLA |

## 11. Requisitos não funcionais

As metas numéricas são propostas para o beta e serão revistas após medição real. Não representam compromisso contratual de nível de serviço com clientes.

| ID | Categoria | Requisito |
| --- | --- | --- |
| RNF-01 | Desempenho | Listagem e detalhe de chamados respondem em até 1,5 s no percentil 95, com até 50 mil chamados por organização |
| RNF-02 | Desempenho | A criação de chamado pelo portal confirma ao cliente em até 3 s, sem esperar pela triagem |
| RNF-03 | Desempenho | A triagem fica disponível em até 60 s após a criação em 95% dos casos, em operação normal |
| RNF-04 | Desempenho | O dashboard carrega em até 3 s no percentil 95 para períodos de até 90 dias |
| RNF-05 | Disponibilidade | Meta interna de 99,5% mensal no beta, limitada pelos SLAs dos provedores contratados |
| RNF-06 | Resiliência | A indisponibilidade da Gemini API ou do provedor de e-mail não impede criar, consultar ou responder chamados. As tarefas pendentes são reprocessadas ao retorno |
| RNF-07 | Escalabilidade | A arquitetura suporta crescimento horizontal sem mudança de modelo de dados, até pelo menos 100 organizações e 1 milhão de chamados no total (premissa de dimensionamento) |
| RNF-08 | Usabilidade | Interface em pt-BR, com textos externalizados para futura internacionalização. Datas, números e fusos no padrão brasileiro, com fuso configurável |
| RNF-09 | Acessibilidade | Conformidade com WCAG 2.1 nível AA nas telas do portal do cliente e nas telas principais da central, verificada por ferramenta automatizada e revisão manual de navegação por teclado |
| RNF-10 | Responsividade | Portal do cliente totalmente funcional a partir de 360 px de largura. Central de atendimento otimizada para desktop e utilizável em tablet |
| RNF-11 | Feedback | Toda ação tem estado de carregamento, mensagem de sucesso ou erro compreensível e, quando aplicável, ação de nova tentativa. Erros técnicos não exibem detalhes internos |
| RNF-12 | Observabilidade | Logs estruturados com identificador de correlação por requisição e tarefa, monitoramento de erros e métricas de fila (pendentes, falhas, tempo de processamento) |
| RNF-13 | Observabilidade | Métricas de IA por organização, funcionalidade e modelo: chamadas, tokens, latência, taxa de erro, taxa de falha de validação de schema |
| RNF-14 | Manutenibilidade | Código modular por domínio, tipagem estrita, validação de entradas e saídas com schemas e documentação técnica atualizada a cada incremento |
| RNF-15 | Testabilidade | Testes automatizados de unidade (regras de negócio, SLA, prioridade), integração (isolamento multi-tenant, permissões) e ponta a ponta (jornadas J1 a J6, incluindo J3b). Execução obrigatória no pipeline antes do deploy em produção |
| RNF-16 | Ambientes | Três ambientes: Development, Preview e Production, com bancos e credenciais segregados. Development e Preview usam apenas dados e arquivos sintéticos, nunca dados reais de clientes. Production só recebe dados reais após o Gate de dados reais (seção 26) |
| RNF-17 | Recuperação | Backup com recuperação pontual do banco. Meta proposta: perda máxima de dados (RPO) de 24 h e tempo de restauração (RTO) de 8 h no beta, a confirmar conforme os recursos do plano do Neon (DEP-02). Teste de restauração documentado antes do beta |
| RNF-18 | Custo | Custo de IA por chamado triado e custo de infraestrutura mensal medidos e exibidos ao Superadmin. Nenhum serviço pago recorrente novo sem aprovação (RST-04) |
| RNF-19 | Compatibilidade | Versões atuais de Chrome, Edge, Firefox e Safari, desktop e mobile |

## 12. Requisitos de IA e Gemini API

O Google Gemini é o único provedor de LLM da aplicação (DA-02). A v1.0 usa IA em uma única função, a triagem, implementada como chamada estruturada dentro de um fluxo determinístico, sem agente autônomo e sem ferramentas. Claude Code é apenas ferramenta de desenvolvimento e não faz parte da aplicação.

**12.1 Componentes de IA por versão (proposta)**

| Componente | Versão | Padrão proposto | Execução | Intervenção humana |
| --- | --- | --- | --- | --- |
| AI Triage Agent | v1.0 | Uma chamada com saída estruturada, seguida de regras determinísticas de prioridade | Assíncrona por chamado | Revisão obrigatória antes de resolver (RN-06) |
| AI Support Copilot | v1.1 | Recuperação na base de conhecimento (RAG) e geração com citação das fontes | Síncrona sob demanda do atendente | Aprovação antes de qualquer envio |
| AI CX Advisor | v1.2 | O código agrega e agrupa os dados; a LLM sintetiza temas e hipóteses citando os chamados | Lote agendado | Leitura e decisão pelo gestor |
| AI Quality Analyst | v1.3 | Avaliação por rubrica definida pela organização, com saída estruturada | Lote após o encerramento | Apoio à avaliação humana, sem uso disciplinar automático |

Os nomes comerciais (“Agent”, “Copilot”) não implicam autonomia. A adoção de agentes com ferramentas exige justificativa e aprovação em versão futura.

**12.2 Requisitos**

| ID | Requisito |
| --- | --- |
| RIA-01 | Todas as chamadas à Gemini API ocorrem exclusivamente no backend, pelo SDK oficial Google Gen AI para JavaScript/TypeScript, na versão estável confirmada na Fase 3 |
| RIA-02 | A chave da API fica em variável de ambiente protegida, segregada por ambiente. Nunca vai para o navegador, logs, repositório ou mensagens de erro |
| RIA-03 | O identificador do modelo de cada funcionalidade é configuração, não código. Os modelos são escolhidos na Fase 3 a partir da documentação oficial vigente (DP-02) |
| RIA-04 | Saídas usam o modo de resposta estruturada da Gemini API e são validadas com schemas Zod. Saída inválida gera uma nova tentativa; persistindo, marca a triagem como falha (RF-TRI-07) |
| RIA-05 | Cada chamada tem timeout, até 2 novas tentativas com espera crescente apenas para erros transitórios, e respeita os limites de requisições e tokens do projeto |
| RIA-06 | Idempotência: a chave da triagem é o hash do conteúdo relevante, da versão do prompt e do modelo. Uma triagem com a mesma chave não é reexecutada automaticamente. A única exceção é o reprocessamento forçado e justificado de RF-TRI-08 |
| RIA-07 | Prompts são versionados no repositório. Cada resultado persiste modelo, versão do prompt, tokens e latência |
| RIA-08 | O conteúdo do cliente é tratado como dado não confiável: delimitado no prompt, separado das instruções e nunca interpretado como comando. A saída é restrita a enums e textos curtos, e renderizada como texto, nunca como HTML |
| RIA-09 | Antes do envio, o sistema mascara CPF, CNPJ, cartões, telefones e e-mails no texto. O nome do contato e os dados cadastrais não são enviados quando desnecessários para a tarefa |
| RIA-10 | Anexos não são enviados à Gemini API na v1.0. Mensagens em quarentena também não (RN-17) |
| RIA-17 | Até a conclusão de DP-01, a Gemini API recebe apenas dados fictícios ou sintéticos. Isso vale para o MVP Core e para os testes do Marco A |
| RIA-11 | Cada requisição contém dados de uma única organização. Contexto, cache e exemplos nunca misturam organizações |
| RIA-12 | O consumo é registrado por organização e funcionalidade (RF-CON-01) e sujeito a cotas (RF-CON-02 a 04) |
| RIA-13 | A qualidade da triagem é medida contra um conjunto de referência rotulado (golden set) de no mínimo 200 manifestações fictícias ou anonimizadas, executado a cada mudança de prompt ou de modelo |
| RIA-14 | A IA não executa ações críticas: não envia mensagens, não altera status, não fecha nem cancela chamados |
| RIA-15 | Análises demoradas (v1.2+) usam processamento assíncrono. A adoção de Batch API e de cache de contexto será avaliada na Fase 3 |
| RIA-16 | Embeddings (v1.1+) usam modelo de embeddings do ecossistema Gemini, com índice vetorial filtrado obrigatoriamente por organização |

**12.3 Gemini Developer API: condições de uso**

A Gemini Developer API é a opção prioritária (DA-07). Antes do beta com dados reais, a Fase 3 deve confirmar nos termos oficiais vigentes:

- Uso ou não dos dados de prompts e respostas para melhoria de produtos, no nível pago.
- Prazo de retenção para monitoramento de abuso.
- Local de processamento e condições de transferência internacional.
- Existência de termos de tratamento de dados aplicáveis.

O faturamento habilitado não resolve esses pontos por si só. A Vertex AI só será avaliada se essa verificação revelar incompatibilidade concreta (DP-01).

**12.4 Estimativa de consumo (premissas explícitas)**

Os valores abaixo são premissas de dimensionamento, não medições. Preços por token não são informados aqui e serão obtidos da tabela oficial na Fase 3.

| Premissa | Valor assumido |
| --- | --- |
| Instruções, schema e taxonomia da organização por triagem | cerca de 1.500 tokens de entrada |
| Texto médio da manifestação | cerca de 500 tokens de entrada |
| Saída estruturada | cerca de 250 tokens |
| Novas tentativas e reprocessamentos | 10% adicional |
| Volume por organização no beta | 1.000 chamados por mês |

Resultado: cerca de 2,2 milhões de tokens de entrada e 0,28 milhão de tokens de saída por organização por mês.

```latex
Custo_{mensal} = \frac{T_{entrada}}{10^6} \cdot P_{entrada} + \frac{T_{sa\acute{\imath}da}}{10^6} \cdot P_{sa\acute{\imath}da}
```

P são os preços por milhão de tokens do modelo escolhido, a verificar. O custo real medido (RF-CON-01) substitui esta estimativa após as primeiras semanas de beta.

## 13. Segurança e LGPD

O isolamento entre organizações é o requisito de segurança mais crítico do produto. A presença dos controles abaixo não torna a plataforma automaticamente adequada à LGPD: a adequação depende também de contratos, políticas, processos e da atuação de cada organização contratante. A revisão jurídica especializada é condição do Gate de dados reais (DEP-08, CC-09).

**13.1 Requisitos de segurança**

| ID | Tema | Requisito |
| --- | --- | --- |
| RSG-01 | Isolamento | Toda tabela de dados de organização possui identificador da organização obrigatório. Toda consulta é filtrada pela organização da sessão, nunca por parâmetro enviado pelo cliente |
| RSG-02 | Isolamento | Segunda camada de defesa no banco (ex.: Row-Level Security), sujeita à validação de viabilidade na Fase 3 (DP-05) |
| RSG-03 | Isolamento | Testes automatizados tentam acessar recursos de outra organização por ID direto, busca, anexos, e-mail, exportação e IA. Todos devem falhar. A suíte bloqueia o deploy se houver falha |
| RSG-04 | Autorização | Toda verificação de permissão ocorre no backend, por perfil e organização. A interface apenas oculta ações, sem ser a barreira de segurança |
| RSG-05 | Autenticação | Sessões com cookies seguros (HttpOnly, Secure, SameSite), expiração por inatividade, revogação no logout e na desativação, proteção contra força bruta. MFA disponível para a equipe; obrigatório para o Superadmin |
| RSG-06 | Portal | Links mágicos e de acompanhamento usam tokens aleatórios de alta entropia, armazenados apenas como hash, de uso único (acesso) ou revogáveis (acompanhamento), com validade curta e limitados a um contato e uma organização |
| RSG-07 | Credenciais | Segredos só em variáveis de ambiente protegidas do provedor de hospedagem, segregados por ambiente, nunca no repositório. Varredura de segredos no repositório |
| RSG-08 | Logs | Logs não contêm corpo de mensagens, anexos, tokens, senhas ou chaves. E-mails e nomes aparecem mascarados. Prompts completos não são logados em produção |
| RSG-09 | Prompt injection | Aplicar RIA-08, RIA-11 e RIA-14. Testes com manifestações maliciosas conhecidas fazem parte do golden set |
| RSG-10 | Entradas | Validação de todas as entradas com schemas no servidor. Proteção contra XSS (conteúdo do cliente e de e-mails sempre sanitizado antes da exibição), CSRF e injeção de SQL |
| RSG-11 | Abuso | Rate limiting por IP e por organização no portal, no login, nos links mágicos e no e-mail de entrada. Desafio anti-bot no formulário público |
| RSG-12 | Anexos: validação e limites | **Formatos permitidos nesta etapa: PNG, JPEG, WEBP, PDF, TXT e CSV** (DA-20). A extensão e o tipo real, identificado pelo conteúdo do arquivo, devem coincidir e pertencer à lista. Divergência é recusada. **Limite inicial de 4 MB por arquivo no Marco A** (reavaliável conforme testes e necessidade comercial); quantidade por mensagem proposta em 5 arquivos (DP-15). O nome original é sanitizado e guardado só como metadado. O objeto é armazenado com chave aleatória, nunca exposta ao cliente |
| RSG-13 | Auditoria | Conforme RF-AUD-01 a 03. Prazo de retenção da auditoria pendente (DP-17), com proposta de 12 meses |
| RSG-14 | Transporte e repouso | TLS em todas as conexões. Criptografia em repouso fornecida pelos provedores de banco e de armazenamento |
| RSG-15 | Dependências | Verificação automatizada de vulnerabilidades em dependências e atualização periódica |
| RSG-16 | Incidentes | Procedimento documentado de resposta a incidentes, com comunicação às organizações afetadas, para que elas avaliem suas obrigações perante a ANPD e os titulares |
| RSG-17 | Anexos: conteúdo bloqueado | São recusados todos os formatos fora da lista da RSG-12, **incluindo DOCX, XLSX e ODT, bloqueados nesta etapa até nova avaliação**. Em especial: executáveis e instaladores, scripts, atalhos e imagens de disco; documentos com macros (ex.: DOCM, XLSM); arquivos compactados (ZIP, RAR, 7Z); conteúdo ativo renderizável (HTML, SVG, XML); PDFs com conteúdo ativo (JavaScript, ações automáticas, arquivos embutidos, formulários XFA) ou criptografados. Arquivos protegidos por senha ou que não possam ser analisados também são recusados |
| RSG-18 | Anexos: armazenamento e acesso | Armazenamento **privado no Vercel Blob** (store privado por ambiente; DA-20), com caminhos separados por organização e por estado (quarentena e liberado). Upload direto do navegador apenas com token restrito (tipo, tamanho e caminho), emitido pelo backend após autorização. A autorização de todo acesso parte do registro do anexo na organização, sob o isolamento de RSG-01 e RSG-02; o caminho do arquivo nunca é aceito como parâmetro do cliente. **Download autenticado:** cada download passa por autorização no backend (usuário da organização com permissão no chamado, ou sessão do portal válida para o contato e o chamado) e é servido por rota autenticada, sempre como download (Content-Disposition: attachment), com tipo de conteúdo fixado pelo tipo validado, nosniff e sem cache. O arquivo nunca é renderizado dentro da aplicação na v1.0. Credenciais do armazenamento ficam apenas no servidor |
| RSG-19 | Anexos: quarentena, sanitização e antimalware | Cada arquivo tem um estado: pendente → liberado, em quarentena ou recusado. Só arquivos liberados podem ser baixados. Todo arquivo passa por **validação e sanitização (CDR)** antes da liberação: recodificação de imagens; normalização de texto e CSV com neutralização de fórmulas; rejeição de PDF com conteúdo ativo. Falha de sanitização leva à quarentena (arquivo indisponível, evento de auditoria, alerta ao Administrador). Erro técnico mantém o arquivo pendente (falha fechada). **A sanitização não substitui a verificação antimalware.** **Development e Preview:** apenas arquivos sintéticos. **Anexos reais de clientes:** a solução **não está homologada**. Antes do beta com dados reais, a DP-12 deve ser decidida formalmente entre (a) implementação de solução antimalware adequada e (b) aceitação temporária e documentada do risco residual, se justificável. **Nenhuma aceitação de risco residual está autorizada nesta versão.** Restrição de tipos e download forçado reduzem o risco, mas não substituem a verificação antimalware |

**13.2 Papéis na LGPD (proposta a validar juridicamente)**

| Agente | Papel provável | Responsabilidades principais |
| --- | --- | --- |
| Organização contratante | Controladora dos dados dos seus clientes | Base legal, transparência com os titulares, atendimento a pedidos, definição da retenção |
| Customer Voice AI | Operadora (dados dos clientes das organizações) e controladora (dados de conta dos usuários e da cobrança) | Tratar dados conforme instruções, segurança, registro das operações, suporte aos direitos dos titulares, gestão de suboperadores |
| Google (Gemini API) e demais provedores | Suboperadores | Conforme seus termos, a verificar (DEP-01) |

**13.3 Requisitos de privacidade**

| ID | Requisito |
| --- | --- |
| RSG-20 | Termos de Uso, Política de Privacidade e Acordo de Tratamento de Dados (DPA) disponíveis e aceitos antes do uso com dados reais |
| RSG-21 | Lista pública de suboperadores, incluindo o Google como provedor de IA, com indicação de processamento fora do Brasil quando aplicável |
| RSG-22 | Avaliação da transferência internacional de dados conforme a regulamentação vigente da ANPD, antes do Gate de dados reais (a verificar com jurídico) |
| RSG-23 | Minimização: apenas os dados necessários são coletados no portal e enviados à IA (RIA-09, RIA-10) |
| RSG-24 | Direitos dos titulares: exportação e anonimização por contato (RF-CLI-05), com retenção legal (RF-CLI-06) e os comportamentos de RN-30 a RN-36, executadas pela organização controladora. A adequação desses mecanismos a cada pedido concreto é responsabilidade da controladora e depende de DP-16 |
| RSG-25 | Encerramento da organização: exportação dos dados disponível e exclusão definitiva após prazo contratual, incluindo backups ao fim do ciclo de retenção deles |
| RSG-26 | O portal informa ao cliente final que a manifestação pode ser analisada com auxílio de IA, com link para a política de privacidade da organização |
| RSG-27 | Os termos de uso orientam que não sejam registrados dados sensíveis desnecessários. O produto não é ofertado para operações centradas em saúde ou finanças reguladas (DA-10) |

## 14. Requisitos de integração

A v1.0 integra apenas três serviços externos: Gemini API, e-mail (entrada e saída) e armazenamento de anexos. O armazenamento de anexos foi decidido na versão 0.3 (Vercel Blob privado, DA-20). O provedor de e-mail segue a decisão arquitetural vigente (Fase 3).

| ID | Integração | Requisito | Versão |
| --- | --- | --- | --- |
| RI-01 | Gemini API | Conforme a seção 12 | v1.0 |
| RI-02 | E-mail de saída | Envio transacional por provedor com domínio autenticado (SPF, DKIM, DMARC), webhooks de entrega e bounce, e camada gratuita ou cobrança por consumo (DA-11, DP-07) | v1.0 |
| RI-03 | E-mail de entrada | Recebimento por webhook ou mecanismo equivalente, com verificação de autenticidade da chamada, limite de tamanho e conversão em chamado (RF-EML-02 a 06) | v1.0 |
| RI-04 | Armazenamento de anexos | Vercel Blob em store privado, com upload direto do navegador por token restrito emitido após autorização, download por rota autenticada e sanitização antes da liberação (RSG-18, RSG-19). Sem novos serviços pagos (DA-20) | v1.0 |
| RI-05 | Importação de CSV | Importação de histórico de chamados com mapeamento de colunas, validação prévia, relatório de erros e triagem opcional em lote | v1.1 ou v1.2 |
| RI-06 | API pública e webhooks | API autenticada por chave da organização, com escopos e limites | v2.0 |
| RI-07 | WhatsApp | Integração pela API oficial, com custos e regras do provedor avaliados antes | v2.0 |
| RI-08 | Chat no site | Widget de chat integrado aos chamados | v2.0 |
| RI-09 | CRM e outras plataformas de atendimento | Sincronização de contatos e importação de chamados | v2.0 |
| RI-10 | Pagamentos | Gateway para assinaturas e faturamento | Antes da cobrança |

## 15. Modelo SaaS multi-tenant

Cada organização é um tenant lógico, com isolamento total de usuários, contatos, chamados, equipes, configurações, indicadores, anexos, base de conhecimento e consumo de IA. A estratégia proposta é banco compartilhado com identificador de organização em toda tabela de dados de tenant, mais uma segunda camada de defesa no banco. A confirmação depende da Fase 3 (DP-05).

| Aspecto | Definição para a v1.0 | Evolução |
| --- | --- | --- |
| Cadastro de organizações | Por convite do Superadmin (DA-08) | Cadastro público com onboarding automático |
| Usuários | Vínculo usuário-organização com perfil por organização. Um usuário pode pertencer a várias | SSO corporativo |
| Perfis | Fixos: Administrador, Gestor (com leitura executiva opcional), Atendente | Perfis customizáveis |
| Configurações por organização | Fuso, horário comercial, feriados, categorias, motivos, regras de prioridade, SLA, e-mail de entrada, identidade básica do portal, retenção, ativação da IA | Campos customizados, automações |
| Limites de uso | Cota mensal de IA. Limites técnicos de anexos e de taxa de requisições | Limites por plano (usuários, chamados, armazenamento) |
| Consumo de IA | Medido por organização e funcionalidade (RF-CON-01) | Base para cobrança por uso ou franquia |
| Planos e assinaturas | Fora da v1.0. Modelo de dados preparado para associar organização a plano | Planos comerciais antes do início da cobrança |
| Suspensão | O Superadmin suspende a organização: o acesso da equipe e do portal é bloqueado, com dados preservados | Suspensão automática por inadimplência |
| Auditoria | Por organização, mais eventos da plataforma | Exportação de auditoria |

## 16. Definição do MVP

O MVP é a v1.0. Uma organização convidada recebe manifestações por portal e por e-mail, a Gemini faz a triagem com revisão humana, a equipe atende dentro do SLA, o cliente acompanha e avalia, e o gestor acompanha os indicadores, com isolamento, auditoria e custo de IA medidos.

**Escopo obrigatório da v1.0:**

- Todos os requisitos RF da seção 9.
- As regras da seção 10.
- Os RNF da seção 11.
- RIA-01 a RIA-14 e RIA-17.
- RSG-01 a RSG-19.
- RSG-20 a RSG-27. Os documentos legais e as avaliações jurídicas são condições do Gate de dados reais. Os mecanismos técnicos correspondentes (aviso de IA no portal, exportação, anonimização, retenção legal) fazem parte do Marco A.
- RI-01 a RI-04.

Nenhum requisito aprovado foi retirado da v1.0 nesta revisão.

**16.1 Marco interno MVP Core — Atendimento + Triagem Inteligente**

O MVP Core é uma entrega interna de demonstração e homologação técnica. Ele **não é pronto para uso comercial nem para dados reais**: usa apenas dados fictícios (RIA-17, RNF-16). Não substitui nem reduz o escopo da v1.0. Após sua homologação, os incrementos seguintes completam a v1.0.

| # | Capacidade demonstrável | Requisitos (total ou parcial) |
| --- | --- | --- |
| 1 | Autenticação básica da equipe | RF-ORG-03 (login, logout, sessão segura); recuperação de acesso pode ficar para o I-3 |
| 2 | Duas organizações isoladas | RF-ORG-01, RF-ORG-02, RF-ORG-04 (perfis Administrador e Atendente), RSG-01, RSG-03, RSG-04 |
| 3 | Cadastro de contatos | RF-CLI-01 |
| 4 | Criação manual de chamados | RF-ATD-01 (canal manual), RF-ATD-02, RF-ATD-03 |
| 5 | Listagem e visualização de chamados | RF-ATD-10 (filtros por status e período), detalhe do chamado |
| 6 | Classificação pela Gemini API | RF-TRI-01, RF-TRI-02, RF-TRI-04, RF-TRI-07, RIA-01 a RIA-09, RIA-11, RIA-14, RIA-17 |
| 7 | Revisão humana da classificação | RF-TRI-05, RF-TRI-06, RN-11, RN-14 |
| 8 | Registro de consumo de IA | RF-CON-01 |
| 9 | Histórico básico do atendimento | RF-ATD-04 (somente notas internas), RF-ATD-05 (eventos de criação, triagem, revisão e notas), RF-AUD-01 (eventos de login e de revisão) |

Critérios de homologação do MVP Core:

- [ ] MC-01: as capacidades 1 a 9 demonstradas em roteiro de homologação, no ambiente Preview, com dados fictícios.
- [ ] MC-02: CA-01.1, CA-01.2, CA-02.1, CA-04.1, CA-08.1 a CA-08.3, CA-08.5, CA-08.7, CA-09.1, CA-16.1, CA-19.1 e CA-19.2 aprovados.
- [ ] MC-03: suíte de isolamento (RSG-03) cobrindo contatos, chamados, triagem e consumo, com 100% de sucesso.
- [ ] MC-04: golden set inicial executado e resultado registrado. As metas de KPI-04 não são exigidas neste marco.
- [ ] MC-05: nenhum dado real usado, e chave da Gemini API presente apenas no backend (RIA-02).

**16.2 Incrementos da v1.0 (proposta)**

Cada incremento só começa após a homologação do anterior. A ordem foi ajustada para que triagem e núcleo de atendimento formem o MVP Core.

| Incremento | Conteúdo | Resultado demonstrável |
| --- | --- | --- |
| I-0 | Fundação: ambientes, pipeline, autenticação básica, organizações, perfis, isolamento com testes, auditoria base | Duas organizações isoladas, com usuários convidados |
| I-1 | Núcleo de atendimento: contatos, chamados manuais, listagem, detalhe, notas internas, histórico básico | Chamados internos registrados e consultados |
| I-2 | Triagem com Gemini: chamada estruturada assíncrona, revisão humana, modo degradado, registro de consumo, golden set inicial | **Marco MVP Core** |
| I-3 | Central completa: status, atribuição, respostas públicas, filtros, busca, visões, recuperação de acesso, equipes, checklist de configuração | Atendimento interno completo |
| I-4 | Portal e e-mail: portal público, link mágico, e-mails de saída, e-mail de entrada com quarentena, anexos com RSG-12 e RSG-17 a RSG-19 (Vercel Blob privado, sanitização e quarentena; verificação de DP-18 antes de iniciar), CSAT | Cliente abre, acompanha, responde e avalia |
| I-5 | SLA, prioridade, cotas e dashboard: calendário, metas, alertas, regras de prioridade, reprocessamento, cotas e teto, indicadores, leitura executiva | Gestor acompanha a operação com SLA |
| I-6 | Prontidão técnica: anonimização e retenção legal, exportação, página pública, backup testado, revisão de segurança, documentação | **Marco A** |

Depois do Marco A vêm o Gate de dados reais e o Marco B (seção 26). A ordem e o conteúdo serão refinados no backlog da Fase 4.

## 17. Funcionalidades fora do MVP

Nenhum item abaixo deve ser implementado na v1.0, mesmo que pareça simples (RST-01).

| Funcionalidade | Destino |
| --- | --- |
| Detecção de duplicidade | v1.1 |
| AI Support Copilot, base de conhecimento, RAG, respostas prontas | v1.1 |
| Importação de CSV | v1.1 ou v1.2 (DP-13) |
| AI CX Advisor, dashboard executivo, recorrência e tendências | v1.2 |
| Planos de ação básicos | v1.2 |
| AI Quality Analyst | v1.3 |
| Distribuição automática, escalonamento automático, múltiplos calendários, SLA por cliente | v1.3 |
| Campos e status customizáveis, mesclagem de chamados, ações em massa | v1.3 |
| Envio automático de respostas pela IA | v1.3 ou posterior, condicionado a métricas de qualidade |
| WhatsApp, chat, API pública, CRM, integrações com outras plataformas | v2.0 |
| Cadastro público de organizações, SSO/SAML, perfis customizáveis | v2.0 |
| Planos comerciais, assinaturas, pagamentos, faturamento | Antes do início da cobrança |
| Outros idiomas na interface | v2.0 ou conforme demanda |
| Aplicativo móvel nativo | Sem previsão |
| Envio de anexos para análise pela IA | Sem previsão (avaliar após a v1.2) |

## 18. Histórias de usuário (v1.0)

São 20 histórias que cobrem todos os requisitos funcionais do MVP (cobertura na seção 19.1). Elas serão refinadas e quebradas em tarefas na Fase 4.

| ID | História | Requisitos |
| --- | --- | --- |
| HU-01 | Como Superadmin, quero convidar uma organização para o beta, para controlar quem usa a plataforma | RF-ORG-01, RF-ORG-02 |
| HU-02 | Como Administrador, quero convidar colaboradores com perfil e equipe, para montar minha operação | RF-ORG-03 a 06, RF-ORG-10 |
| HU-03 | Como Administrador, quero configurar horário, feriados, categorias, motivos, regras de prioridade e e-mail de entrada com um checklist, para adaptar a plataforma ao meu negócio | RF-ORG-07, RF-ORG-11, RF-ATD-13, RF-EML-02 |
| HU-04 | Como usuário de várias organizações, quero alternar entre elas, sem risco de misturar dados | RF-ORG-08 |
| HU-05 | Como cliente final, quero registrar uma manifestação pelo portal e receber o protocolo, para ter garantia de registro | RF-POR-01, RF-POR-02, RF-ATD-01, RF-ATD-02, RF-CLI-03 |
| HU-06 | Como cliente final, quero escrever para o e-mail da empresa e ter minha mensagem tratada como chamado, sem que terceiros possam se passar por mim | RF-EML-02 a 06, RF-EML-08 |
| HU-07 | Como cliente final, quero acompanhar e responder meus chamados por link seguro, sem criar senha | RF-POR-03, RF-POR-04, RF-POR-06 |
| HU-08 | Como atendente, quero ver as sugestões da IA e confirmá-las ou corrigi-las rapidamente, para classificar sem retrabalho | RF-TRI-01 a 06 |
| HU-09 | Como atendente, quero continuar trabalhando quando a IA estiver indisponível ou desativada | RF-TRI-07, RF-TRI-09 |
| HU-10 | Como atendente, quero assumir chamados, responder ao cliente, anexar arquivos e registrar notas internas, para resolver as manifestações | RF-ATD-03 a 07, RF-ATD-09, RF-EML-01, RF-EML-07 |
| HU-11 | Como atendente, quero filtrar, buscar e usar visões pré-definidas, para priorizar meu trabalho | RF-ATD-10 a 12 |
| HU-12 | Como Gestor, quero que o SLA seja calculado e sinalizado automaticamente, para agir antes das violações | RF-SLA-01 a 05 |
| HU-13 | Como cliente final, quero avaliar o atendimento e reabrir o chamado se o problema voltar | RF-POR-05, RF-ATD-08 |
| HU-14 | Como Gestor, quero um dashboard com indicadores confiáveis da operação e da qualidade da triagem | RF-DSH-01 a 04, RF-ORG-10 |
| HU-15 | Como Administrador, quero consultar a auditoria da minha organização, para rastrear operações relevantes | RF-AUD-01 a 03 |
| HU-16 | Como Administrador e Superadmin, quero ver e limitar o consumo de IA e suspender organizações, para controlar custos e o uso da plataforma | RF-CON-01 a 04, RF-DSH-05, RF-TRI-08, RF-ORG-09 |
| HU-17 | Como Administrador, quero atender pedidos de titulares (exportação e anonimização) e registrar retenções legais, para cumprir minhas obrigações de controlador | RF-CLI-05, RF-CLI-06 |
| HU-18 | Como atendente, quero ver o perfil e o histórico do contato, para atender com contexto | RF-CLI-01, RF-CLI-02, RF-CLI-04, RF-ATD-05 |
| HU-19 | Como atendente, quero cadastrar um contato e registrar manualmente um chamado em nome dele, para tratar manifestações recebidas fora do portal e do e-mail | RF-CLI-01, RF-ATD-01, RF-ATD-02, RF-ATD-03 |
| HU-20 | Como visitante ou organização convidada, quero conhecer o produto e consultar os termos, a política de privacidade e os suboperadores, para decidir participar do beta | RF-PUB-01 |

## 19. Critérios de aceite verificáveis

Cada critério é verificável por teste automatizado ou por roteiro de homologação com resultado esperado definido. Valores marcados como padrão seguem as regras de negócio e podem ser recalibrados.

**HU-01**

- CA-01.1: um convite expirado ou já utilizado é recusado com mensagem clara.
- CA-01.2: ao aceitar o convite, a organização é criada e o convidado tem perfil Administrador apenas nela.

**HU-02**

- CA-02.1: um Atendente que tenta acessar a tela ou a API de gestão de usuários recebe acesso negado (HTTP 403) e o evento é auditado.
- CA-02.2: um usuário desativado com sessão ativa perde o acesso na próxima requisição.
- CA-02.3: o logout em todos os dispositivos invalida todas as sessões ativas do usuário, verificado com duas sessões simultâneas.
- CA-02.4: o convite aceito cria o usuário com o perfil e as equipes definidos. Um convite para e-mail já vinculado à organização é recusado.
- CA-02.5: uma equipe arquivada não aparece como opção de atribuição nem na lista enviada à IA, e seus chamados antigos permanecem consultáveis.

**HU-03**

- CA-03.1: uma categoria desativada some das opções de novos chamados e da lista enviada à IA, mas continua visível nos chamados antigos e nos indicadores do período.
- CA-03.2: uma regra “categoria X = Alta” é aplicada à prioridade sugerida, e a justificativa cita a regra.
- CA-03.3: a alteração do horário comercial é aplicada ao cálculo de SLA dos chamados criados depois dela. O nome e o logotipo configurados aparecem no portal.
- CA-03.4: o checklist mostra o estado de cada item e marca automaticamente como concluído o item cuja configuração foi salva.

**HU-04**

- CA-04.1: com a organização A ativa, uma requisição com ID de chamado da organização B retorna “não encontrado”, sem revelar a existência do recurso.
- CA-04.2: a suíte de isolamento (RSG-03) passa com 100% de sucesso no pipeline.
- CA-04.3: após trocar para a organização B, todas as telas mostram apenas dados de B, e o nome da organização ativa fica visível no cabeçalho.

**HU-05**

- CA-05.1: o envio válido cria o chamado com protocolo único, e o e-mail de confirmação é enviado ou fica registrado como pendente em até 1 minuto.
- CA-05.2: a confirmação aparece na tela em até 3 s, independentemente da triagem.
- CA-05.3: envios acima do limite de taxa ou sem o desafio anti-bot são rejeitados.
- CA-05.4: um envio com e-mail de contato já existente na organização reutiliza o contato. Um e-mail novo cria um contato.

**HU-06**

- CA-06.1: um e-mail novo, sem vínculo, cria o chamado com canal “e-mail” e contato identificado ou criado.
- CA-06.2: uma resposta do contato com token válido entra no chamado correto, com o texto citado removido.
- CA-06.3: respostas automáticas e bounces não criam chamados, não alteram status e não disparam e-mails.
- CA-06.4: cada um dos casos de RN-17 (remetente diferente, falha de autenticação, token inválido ou de outra organização, vínculos contraditórios) leva a mensagem à quarentena. Ela não aparece na linha do tempo nem no portal, não gera notificação e o motivo fica registrado.
- CA-06.5: um anexo de e-mail com tipo bloqueado (RSG-17) é recusado e registrado. A mensagem é aceita sem o anexo.
- CA-06.6: um e-mail com o protocolo do chamado no assunto, mas sem token ou cabeçalho válido, cria novo chamado e não é associado ao existente.
- CA-06.7: uma mensagem com Message-ID já processado não gera novo chamado nem nova mensagem.
- CA-06.8: HTML com script, iframe ou formulário é exibido sem esses elementos, e imagens remotas não são carregadas automaticamente.
- CA-06.9: na quarentena, as ações associar, criar novo chamado e descartar exigem justificativa e geram evento de auditoria. Uma mensagem associada aparece como interna marcada “remetente não verificado” e não aparece no portal.

**HU-07**

- CA-07.1: o link mágico funciona uma única vez e expira no prazo configurado.
- CA-07.2: o cliente vê apenas os chamados do seu contato naquela organização e nunca vê notas internas, dados da triagem ou mensagens em quarentena.
- CA-07.3: o portal é utilizável a 360 px de largura e a verificação automatizada de acessibilidade (critérios WCAG 2.1 A e AA) não aponta violações de severidade crítica ou grave.

**HU-08**

- CA-08.1: campos preenchidos pela IA exibem o selo “sugestão da IA” até serem revisados.
- CA-08.2: “Confirmar todos” registra todos os campos como aceitos, com revisor e data e hora.
- CA-08.3: alterar um campo registra os valores original e novo, o modelo e a versão do prompt.
- CA-08.4: a justificativa é exibida como texto e não contém HTML executável.
- CA-08.5: um valor sugerido fora da taxonomia ativa é descartado (RN-14).
- CA-08.6: cada chamado criado gera exatamente uma tarefa de triagem.
- CA-08.7: uma resposta da IA que não passa na validação do schema gera uma nova tentativa. Se persistir, a triagem é marcada como falha e o chamado segue RF-TRI-07.
- CA-08.8: com risco de escalada detectado, a prioridade sugerida é no mínimo Alta. Com sentimento muito negativo e urgência baixa, sem regra da organização nem risco, a prioridade sugerida não passa de Média (RN-10).

**HU-09**

- CA-09.1: com a Gemini API simulada como indisponível, o chamado é criado, vai para a fila padrão com o indicador “triagem indisponível” e pode ser atendido normalmente.
- CA-09.2: com a cota esgotada, nenhuma chamada é feita à Gemini API.
- CA-09.3: com a IA desativada na organização, nenhuma chamada é feita à Gemini API, e o atendente consegue preencher tipo e categoria manualmente e resolver o chamado (RN-06).

**HU-10**

- CA-10.1: uma resposta pública gera e-mail ao contato e aparece no portal. Uma nota interna não gera nenhum dos dois.
- CA-10.2: transições de status fora de RN-05 são bloqueadas.
- CA-10.3: resolver sem categoria e tipo confirmados por humano é bloqueado (RN-06).
- CA-10.4: um anexo com tipo fora da lista, tipo bloqueado, divergência entre extensão e conteúdo ou tamanho acima do limite é recusado.
- CA-10.5: um atendente só assume chamados das filas das suas equipes. Um Gestor reatribui um chamado para outro membro da equipe, e a mudança aparece no histórico.
- CA-10.6: cada evento transacional de RF-EML-01 dispara o e-mail correspondente, que contém apenas a mensagem nova e o link, sem o histórico do chamado (RN-19).
- CA-10.7: quando o provedor informa falha de entrega ou bounce, o status aparece na mensagem correspondente.
- CA-10.8: um anexo só pode ser baixado no estado “liberado”, pela rota autenticada, sempre como download, por usuário autorizado da organização do chamado ou pela sessão do portal do contato. Tentativas de outro usuário, de outra organização ou sem sessão válida falham, e o caminho do arquivo não é exposto.
- CA-10.9: arquivos sintéticos de teste produzem o resultado esperado: imagem válida é recodificada e liberada; PDF com JavaScript, arquivo com extensão divergente e DOCX são recusados ou vão para a quarentena; CSV é liberado com fórmulas neutralizadas; arquivo acima de 4 MB é recusado. Falha técnica na sanitização mantém o arquivo pendente.

**HU-11**

- CA-11.1: a busca por protocolo retorna o chamado exato.
- CA-11.2: nenhuma busca retorna resultados de outra organização.
- CA-11.3: a visão “SLA em risco” lista apenas chamados com 80% ou mais do prazo consumido.
- CA-11.4: filtros combinados (ex.: equipe + prioridade + período) retornam exatamente os chamados de uma base de teste com resultado conhecido.
- CA-11.5: a visão “Aguardando revisão da triagem” lista apenas chamados com campos de triagem pendentes.

**HU-12**

- CA-12.1: testes de unidade cobrem o cálculo em horas úteis com fim de semana, feriado, pausa, reabertura e troca de prioridade, com resultados esperados documentados.
- CA-12.2: o alerta de risco e o de violação são gerados uma vez por chamado e por meta.
- CA-12.3: metas configuradas por prioridade, em horas úteis ou corridas, são aplicadas aos chamados criados depois da configuração.
- CA-12.4: o chamado exibe tempo restante e situação (no prazo, em risco, violado) coerentes com o cálculo de RF-SLA-02.
- CA-12.5: uma violação registrada não é removida por mudanças posteriores de status ou de prioridade.

**HU-13**

- CA-13.1: a avaliação só é aceita para chamados Resolvidos ou Fechados, uma vez por resolução.
- CA-13.2: a reabertura funciona até o fim do prazo de RN-07. Depois disso, a mensagem cria um chamado vinculado.

**HU-14**

- CA-14.1: para uma base de teste com resultados conhecidos, todos os indicadores coincidem com os valores esperados calculados conforme RN-40 a RN-45.
- CA-14.2: a taxa de aceitação da triagem segue RN-13.
- CA-14.3: o dashboard carrega em até 3 s no percentil 95 (RNF-04) na base de teste de referência: 50 mil chamados, período de 90 dias.
- CA-14.4: um usuário com “leitura executiva” acessa o dashboard e recebe acesso negado (HTTP 403) em chamados, contatos e configurações.
- CA-14.5: os filtros por período, equipe, categoria e canal alteram os indicadores conforme os valores esperados da base de teste.

**HU-15**

- CA-15.1: cada evento listado em RF-AUD-01 gera registro com ator, organização, ação, alvo e data e hora.
- CA-15.2: não existe rota da aplicação que altere ou exclua registros de auditoria.

**HU-16**

- CA-16.1: cada chamada à Gemini API gera registro de consumo com tokens e organização.
- CA-16.2: os alertas de 80% e 100% são enviados uma vez por ciclo.
- CA-16.3: o reprocessamento com o mesmo conteúdo, prompt e modelo não gera nova chamada (RIA-06).
- CA-16.4: uma organização suspensa tem o acesso da equipe e do portal bloqueado, com dados preservados. A interface e a API do Superadmin não oferecem nenhuma rota de leitura de conteúdo de chamados.
- CA-16.5: o reprocessamento forçado exige justificativa, gera evento de auditoria, consome cota e cria nova execução e nova revisão (RN-11).
- CA-16.6: o Administrador vê chamadas, tokens e porcentagem da cota usada no mês, coincidentes com os registros de consumo.
- CA-16.7: ao atingir o teto global, nenhuma nova chamada é feita à Gemini API em nenhuma organização, e os chamados seguem RF-TRI-07.

**HU-17**

- CA-17.1: a exportação gera um arquivo com os dados do contato e dos seus chamados, disponível pelo prazo de DP-17.
- CA-17.2: após a anonimização, as buscas por nome, e-mail e telefone do titular não retornam resultados. Cada tipo de dado da tabela 10.5.1 apresenta o comportamento definido, e os indicadores agregados permanecem inalterados.
- CA-17.3: a anonimização exige confirmação explícita, gera evento de auditoria sem dados do titular e emite um comprovante que lista as limitações de RN-33.
- CA-17.4: com retenção legal ativa, a anonimização manual é recusada e a expiração automática não alcança o contato ou chamado. A criação e a remoção da marca são auditadas.
- CA-17.5: após restaurar um backup em ambiente de teste, as anonimizações registradas desde o backup são reaplicadas antes da liberação do acesso (RN-36).

**HU-18**

- CA-18.1: o perfil do contato lista apenas chamados da organização ativa, do mais recente para o mais antigo.
- CA-18.2: a linha do tempo do chamado mostra todos os eventos com autor e data e hora.
- CA-18.3: o contato vinculado a uma empresa-cliente exibe a empresa, e a empresa lista seus contatos.

**HU-19**

- CA-19.1: o atendente cria um chamado manual para um contato existente. O chamado recebe protocolo único, canal “manual” e os campos de RF-ATD-03, e aparece na listagem e no detalhe.
- CA-19.2: o cadastro de contato com e-mail já existente na mesma organização é recusado. O mesmo e-mail em outra organização é aceito.

**HU-20**

- CA-20.1: a página pública está acessível sem login e contém os links para Termos de Uso, Política de Privacidade e lista de suboperadores, que retornam páginas válidas.

**19.1 Cobertura: requisito funcional → história → critério de aceite**

Todo requisito funcional da v1.0 tem pelo menos uma história e um critério de aceite.

| RF | HU | CA |
| --- | --- | --- |
| RF-ORG-01 | HU-01 | CA-01.1, CA-01.2 |
| RF-ORG-02 | HU-01 | CA-01.2 |
| RF-ORG-03 | HU-02 | CA-02.2, CA-02.3 |
| RF-ORG-04 | HU-02 | CA-02.1, CA-02.4 |
| RF-ORG-05 | HU-02 | CA-02.2 |
| RF-ORG-06 | HU-02 | CA-02.5 |
| RF-ORG-07 | HU-03 | CA-03.3 |
| RF-ORG-08 | HU-04 | CA-04.1, CA-04.3 |
| RF-ORG-09 | HU-16 | CA-16.4 |
| RF-ORG-10 | HU-02, HU-14 | CA-14.4 |
| RF-ORG-11 | HU-03 | CA-03.4 |
| RF-PUB-01 | HU-20 | CA-20.1 |
| RF-CLI-01 | HU-18, HU-19 | CA-19.2 |
| RF-CLI-02 | HU-18 | CA-18.3 |
| RF-CLI-03 | HU-05 | CA-05.4, CA-06.1 |
| RF-CLI-04 | HU-18 | CA-18.1 |
| RF-CLI-05 | HU-17 | CA-17.1, CA-17.2, CA-17.3, CA-17.5 |
| RF-CLI-06 | HU-17 | CA-17.4 |
| RF-ATD-01 | HU-05, HU-19 | CA-05.1, CA-06.1, CA-19.1 |
| RF-ATD-02 | HU-05, HU-19 | CA-05.1, CA-19.1 |
| RF-ATD-03 | HU-10, HU-19 | CA-19.1 |
| RF-ATD-04 | HU-10 | CA-10.1 |
| RF-ATD-05 | HU-18 | CA-18.2 |
| RF-ATD-06 | HU-10 | CA-10.5 |
| RF-ATD-07 | HU-10 | CA-10.2, CA-10.3 |
| RF-ATD-08 | HU-13 | CA-13.2 |
| RF-ATD-09 | HU-10 | CA-10.4, CA-10.8, CA-10.9 |
| RF-ATD-10 | HU-11 | CA-11.4 |
| RF-ATD-11 | HU-11 | CA-11.1, CA-11.2 |
| RF-ATD-12 | HU-11 | CA-11.3, CA-11.5 |
| RF-ATD-13 | HU-03 | CA-03.1 |
| RF-POR-01 | HU-05 | CA-05.1, CA-05.3 |
| RF-POR-02 | HU-05 | CA-05.1 |
| RF-POR-03 | HU-07 | CA-07.1 |
| RF-POR-04 | HU-07 | CA-07.2 |
| RF-POR-05 | HU-13 | CA-13.1 |
| RF-POR-06 | HU-07 | CA-07.3 |
| RF-EML-01 | HU-10 | CA-10.1, CA-10.6 |
| RF-EML-02 | HU-03, HU-06 | CA-06.1 |
| RF-EML-03 | HU-06 | CA-06.2, CA-06.4, CA-06.6 |
| RF-EML-04 | HU-06 | CA-06.3, CA-06.7 |
| RF-EML-05 | HU-06 | CA-06.5 |
| RF-EML-06 | HU-06 | CA-06.2, CA-06.8 |
| RF-EML-07 | HU-10 | CA-10.7 |
| RF-EML-08 | HU-06 | CA-06.4, CA-06.9 |
| RF-SLA-01 | HU-12 | CA-12.3 |
| RF-SLA-02 | HU-12 | CA-12.1 |
| RF-SLA-03 | HU-12 | CA-12.4 |
| RF-SLA-04 | HU-12 | CA-12.2 |
| RF-SLA-05 | HU-12 | CA-12.5 |
| RF-TRI-01 | HU-08 | CA-08.6 |
| RF-TRI-02 | HU-08 | CA-08.7 |
| RF-TRI-03 | HU-08 | CA-03.2, CA-08.8 |
| RF-TRI-04 | HU-08 | CA-08.1 |
| RF-TRI-05 | HU-08 | CA-08.2, CA-08.3 |
| RF-TRI-06 | HU-08 | CA-08.3 |
| RF-TRI-07 | HU-09 | CA-09.1, CA-09.2 |
| RF-TRI-08 | HU-16 | CA-16.3, CA-16.5 |
| RF-TRI-09 | HU-09 | CA-09.3 |
| RF-DSH-01 | HU-14 | CA-14.1 |
| RF-DSH-02 | HU-14 | CA-14.2 |
| RF-DSH-03 | HU-14 | CA-14.5 |
| RF-DSH-04 | HU-14 | CA-14.1 |
| RF-DSH-05 | HU-16 | CA-16.6 |
| RF-AUD-01 | HU-15 | CA-15.1 |
| RF-AUD-02 | HU-15 | CA-15.1 |
| RF-AUD-03 | HU-15 | CA-15.2 |
| RF-CON-01 | HU-16 | CA-16.1 |
| RF-CON-02 | HU-16 | CA-09.2 |
| RF-CON-03 | HU-16 | CA-16.2 |
| RF-CON-04 | HU-16 | CA-16.7 |

Requisitos não funcionais, de IA e de segurança são verificados pelos critérios de conclusão (seção 26) e pelos CA que os citam, por exemplo CA-04.2, CA-07.3, CA-08.7, CA-10.8 e CA-14.3.

## 20. Indicadores de sucesso

Os indicadores medem o resultado do produto após o uso real e não fazem parte do aceite das histórias. As metas são hipóteses iniciais para o beta, a recalibrar após 60 dias de dados.

| ID | Indicador | Definição | Meta inicial (hipótese) | OBJ |
| --- | --- | --- | --- | --- |
| KPI-01 | Ativação de organizações | Organizações convidadas que registram 20 ou mais chamados reais em 30 dias | ≥ 60% | OBJ-01 |
| KPI-02 | Uso recorrente | Organizações ativas com chamados atendidos em pelo menos 3 de 4 semanas | ≥ 70% das ativadas | OBJ-01 |
| KPI-03 | Aceitação da triagem | RN-13, consolidado | ≥ 75% no beta; ≥ 85% na v1.1 | OBJ-02 |
| KPI-04 | Acurácia no golden set | Acerto de tipo e categoria no conjunto de referência | ≥ 85% em tipo; ≥ 75% em categoria | OBJ-02 |
| KPI-05 | Cobertura da triagem | Chamados com triagem concluída ÷ chamados criados com IA ativa | ≥ 98% | OBJ-02 |
| KPI-06 | Cumprimento de SLA | RN-42, por organização | Linha de base nos primeiros 30 dias, depois tendência de melhoria | OBJ-03 |
| KPI-07 | Taxa de resposta ao CSAT | Avaliações ÷ chamados resolvidos | ≥ 15% | OBJ-04 |
| KPI-08 | Custo de IA por chamado | Custo estimado de IA ÷ chamados triados | Dentro do teto definido após a Fase 3 (DP-02) | OBJ-06 |
| KPI-09 | Incidentes de isolamento | Acessos indevidos entre organizações confirmados | Zero | OBJ-01 |
| KPI-10 | Satisfação das organizações piloto | Pesquisa qualitativa com Administradores e Gestores ao fim do beta | Ao menos 2 organizações dispostas a seguir como piloto | OBJ-01 a OBJ-06 |

## 21. Roadmap

O roadmap mantém as cinco versões aprovadas, com dois ajustes já decididos: importação de CSV antecipada para v1.1 ou v1.2, e planos de ação básicos na v1.2. Não há datas: cada versão depende da homologação da anterior e de um PRD incremental aprovado (RST-02).

| Versão | Conteúdo | Critério de passagem para a próxima |
| --- | --- | --- |
| v1.0 · Atendimento Inteligente (MVP) | Organizações, central, portal, e-mail de entrada e saída, triagem Gemini com revisão humana, SLA básico, dashboard operacional, auditoria, consumo de IA por organização (incrementos I-0 a I-6, com o marco interno MVP Core no I-2) | Marco A homologado e PRD incremental da v1.1 aprovado. O Marco B pode ocorrer em paralelo ao desenvolvimento da v1.1 |
| v1.1 · AI Support Copilot | Base de conhecimento, RAG com citação de fontes, respostas sugeridas com aprovação, respostas prontas. Embeddings habilitam a detecção de duplicidade. Importação de CSV se DP-13 indicar | v1.1 homologada e 60+ dias de dados da v1.0 (ou histórico importado por CSV) |
| v1.2 · Customer Experience Intelligence | Recorrência, tendências e temas emergentes com evidência rastreável, dashboard executivo, planos de ação básicos, diagnóstico de histórico importado, importação de CSV (se não veio na v1.1) | v1.2 homologada e rubrica de qualidade definida com as organizações piloto |
| v1.3 · Qualidade e automações | AI Quality Analyst como apoio à avaliação humana, distribuição e escalonamento automáticos, comparação de resultados dos planos de ação, automações controladas por métricas de qualidade | v1.3 homologada e demanda por novos canais validada com clientes |
| v2.0 · Omnichannel e integrações | WhatsApp, chat, API pública e webhooks, CRM e outras plataformas, cadastro público de organizações, SSO e expansão comercial | — |

Planos comerciais e cobrança entram antes do primeiro cliente pagante, em qualquer ponto após a v1.0.

A principal dependência entre versões é de dados. A v1.2 precisa de histórico suficiente, vindo do uso da v1.0 ou de importação, e reaproveita a infraestrutura de embeddings criada na v1.1.

## 22. Riscos e mitigações

Os três riscos de maior impacto são vazamento entre organizações, crescimento de escopo e conformidade de dados com o provedor de IA.

| ID | Risco | Prob. | Impacto | Mitigação |
| --- | --- | --- | --- | --- |
| RSK-01 | Vazamento de dados entre organizações (consulta, busca, anexo, e-mail, IA, cache) | Média | Crítico | RSG-01 a 03, RIA-11, testes de isolamento bloqueantes, revisão de segurança por incremento |
| RSK-02 | Crescimento de escopo | Alta | Alto | Seção 17, incrementos homologáveis, mudança de escopo só por decisão registrada |
| RSK-03 | Termos da Gemini Developer API incompatíveis com o uso comercial pretendido (uso de dados, retenção, transferência) | Média | Alto | Verificação antes do beta (seção 12.3), DP-01, minimização (RIA-09) |
| RSK-04 | Prompt injection altera a triagem | Média | Médio | RIA-08, saída restrita a enums, revisão humana, testes adversariais |
| RSK-05 | Baixa qualidade da triagem em pt-BR ou em taxonomias específicas | Média | Alto | Golden set, KPI-03 e KPI-04, ajustes de prompt versionados, modelo configurável |
| RSK-06 | Custo de IA acima do previsto | Baixa | Médio | Cotas, teto global, idempotência, modelo leve para classificação, medição real |
| RSK-07 | Descontinuação ou mudança de comportamento de modelos Gemini | Alta | Médio | Modelo como configuração, testes de regressão no golden set antes de migrar |
| RSK-08 | Indisponibilidade da Gemini API | Média | Baixo | Modo degradado (RF-TRI-07), reprocessamento ao retorno |
| RSK-09 | Entregabilidade de e-mail (spam, bloqueio) e abuso do e-mail de entrada | Média | Alto | Domínio autenticado, monitoramento de bounces, RN-16, rate limiting |
| RSK-10 | Camadas gratuitas insuficientes ou alteradas pelos provedores | Média | Médio | Escolha de serviços com cobrança por consumo, monitoramento de uso, aprovação prévia de custos (RST-04) |
| RSK-11 | Restrição do plano gratuito da hospedagem para uso comercial | Alta | Médio | DP-10 resolvida antes do Gate de dados reais (CC-16) |
| RSK-12 | Capacidade de um único desenvolvedor | Alta | Alto | Serviços gerenciados, incrementos pequenos, automação de testes, documentação contínua |
| RSK-13 | Complexidade da segunda camada de isolamento no banco com o ORM e o pool de conexões | Média | Médio | Prova de conceito na Fase 3 antes da decisão (DP-05) |
| RSK-14 | Exposição jurídica por documentos legais inadequados | Média | Alto | Revisão jurídica antes de dados reais (DEP-08) |
| RSK-15 | Anexos maliciosos | Média | Alto | Lista restrita (RSG-12), bloqueios (RSG-17), sanitização e quarentena com falha fechada (RSG-19), download autenticado (RSG-18). Sem anexos reais até a decisão formal de DP-12. A sanitização não substitui antimalware |
| RSK-16 | Falsificação de remetente ou associação indevida de e-mail a chamado, expondo histórico | Média | Alto | Validação de RN-15, quarentena (RN-17), e-mails sem histórico (RN-19), testes CA-06.4 e CA-06.6 |
| RSK-17 | Pedido de titular atendido de forma inadequada (anonimização incompleta, cópias remanescentes) | Média | Alto | RN-30 a RN-36, comprovante com limitações, revisão jurídica (DP-16) |
| RSK-18 | MVP Core percebido como pronto para clientes | Baixa | Médio | Marco interno, apenas dados fictícios (RIA-17), Gate de dados reais obrigatório |

## 23. Premissas e restrições

**Premissas**

| ID | Premissa |
| --- | --- |
| PRM-01 | As PMEs do público-alvo têm volume de 100 a 5.000 chamados por mês e equipes de 2 a 50 atendentes |
| PRM-02 | O e-mail e um formulário web cobrem a maior parte das manifestações no beta |
| PRM-03 | A Gemini API oferece qualidade adequada para classificar manifestações em pt-BR (a confirmar com o golden set) |
| PRM-04 | As organizações do beta aceitam o processamento de dados por IA de terceiro, informado nos termos |
| PRM-05 | Haverá organizações dispostas a participar do beta fechado |

**Restrições**

| ID | Restrição |
| --- | --- |
| RST-01 | Nenhuma funcionalidade sem requisito definido e aprovado. Nada da seção 17 entra na v1.0 |
| RST-02 | Cada versão futura exige PRD incremental aprovado antes da implementação |
| RST-03 | Google Gemini é o único provedor de LLM. Nenhuma integração com outros provedores de LLM |
| RST-04 | Nenhum novo serviço pago recorrente sem aprovação prévia do responsável pelo produto. Isso não autoriza comprometer segurança, confiabilidade ou qualidade |
| RST-05 | Infraestrutura base: Vercel, Neon PostgreSQL, GitHub |
| RST-06 | Desenvolvimento individual com apoio do Claude Code, sem prazo rígido, sem avanço de fase sem aprovação |
| RST-07 | Sem complexidade arquitetural sem necessidade comprovada. Agentes autônomos só com justificativa aprovada |
| RST-08 | Sem código, banco, infraestrutura ou deploy antes da aprovação do PRD e da arquitetura |

## 24. Dependências

| ID | Dependência | Bloqueia |
| --- | --- | --- |
| DEP-01 | Confirmação dos termos de dados da Gemini Developer API para uso comercial | Gate de dados reais |
| DEP-02 | Recursos de backup, recuperação pontual e ciclo de retenção de backup do plano do Neon | RNF-17, RN-36 |
| DEP-03 | Escolha e configuração do provedor de autenticação (DP-03) | Incremento I-0 |
| DEP-04 | Escolha do provedor de e-mail e de um domínio próprio da plataforma (DP-07, DP-14) | Incremento I-4 |
| DEP-05 | Armazenamento de anexos: **decidido** — Vercel Blob privado (DP-08, DA-20) | — |
| DEP-06 | Escolha do mecanismo de processamento assíncrono (DP-04) | Incremento I-2 (MVP Core) |
| DEP-07 | Golden set de triagem elaborado e rotulado (versão inicial no MVP Core, completa no Marco A) | MVP Core e Marco A |
| DEP-08 | Revisão jurídica de Termos de Uso, Política de Privacidade, DPA e das questões de DP-16 | Gate de dados reais |
| DEP-09 | Plano de hospedagem compatível com uso comercial (DP-10) | Gate de dados reais |
| DEP-10 | v1.1 (embeddings) para detecção de duplicidade; v1.0 com 60 dias ou mais de dados, ou importação de CSV, para a v1.2 | Roadmap |
| DEP-11 | Decisão formal de DP-12: antimalware adequado implementado, ou aceitação temporária e documentada do risco residual, se justificável | Gate de dados reais e qualquer uso de anexos reais |
| DEP-12 | Verificação técnica da exclusão no Vercel Blob (DP-18) | Início do I-4 (anexos) |

## 25. Decisões

**25.1 Decisões aprovadas**

| ID | Decisão |
| --- | --- |
| DA-01 | Produto comercial: beta fechado, homologação e pilotos com empresas reais |
| DA-02 | Google Gemini é o único provedor de LLM, via SDK oficial Google Gen AI, apenas no backend |
| DA-03 | E-mail de entrada e de saída no MVP |
| DA-04 | Central de atendimento própria, com diferencial na inteligência aplicada aos dados |
| DA-05 | Triagem: a IA preenche sugestões e o atendente confirma ou corrige, com registro completo (opção A) |
| DA-06 | Taxonomia: tipos padronizados, categorias configuráveis, motivos, sentimento, urgência, prioridade, risco de escalada |
| DA-07 | Prioridade para a Gemini Developer API. Vertex AI só com justificativa concreta |
| DA-08 | Beta fechado por convite |
| DA-09 | Medição de consumo na v1.0. Planos e pagamentos antes do início da cobrança |
| DA-10 | Sem foco em dados sensíveis de saúde ou em finanças reguladas nesta etapa |
| DA-11 | Infraestrutura base: Vercel, Neon, Gemini, GitHub. Novos serviços pagos recorrentes só com aprovação |
| DA-12 | Desenvolvimento individual e incremental, sem prazo rígido |
| DA-13 | Roadmap v1.0 a v2.0, com importação de CSV antecipada para v1.1 ou v1.2 e planos de ação básicos na v1.2 |
| DA-14 | Indicadores quantitativos calculados por código e consultas, nunca pela LLM |
| DA-15 | A IA não executa ações críticas. Respostas sugeridas exigem aprovação humana. Nenhuma decisão disciplinar automática |
| DA-16 | Preferir fluxos determinísticos com chamadas estruturadas a agentes autônomos |
| DA-17 | Interface em português brasileiro |
| DA-18 | A conclusão técnica do MVP (Marco A) não depende de cliente piloto. A validação comercial (Marco B) é um marco separado. O uso de dados reais depende do Gate de dados reais |
| DA-19 | Existe um marco interno demonstrável, o MVP Core (atendimento + triagem), sem uso comercial nem dados reais. A composição detalhada da seção 16.1 é proposta deste PRD |
| DA-20 | Anexos (ADR-008 rev. 2, aprovada com condições): armazenamento privado no Vercel Blob; formatos PNG, JPEG, WEBP, PDF, TXT e CSV, com DOCX, XLSX, ODT e demais bloqueados nesta etapa; limite inicial de 4 MB por arquivo no Marco A; validação, quarentena, sanitização, autorização por organização e download autenticado; custo adicional zero no desenvolvimento, sem cobranças automáticas nem novos serviços pagos. A sanitização não substitui antimalware. A solução não está homologada para anexos reais (DP-12 pendente) |

**25.2 Decisões pendentes**

Nenhuma decisão abaixo está aprovada. As inclinações preliminares servem apenas de ponto de partida para a Fase 3.

| ID | Decisão | Opções ou critérios | Inclinação preliminar | Decidir até |
| --- | --- | --- | --- | --- |
| DP-01 | Adequação da Gemini Developer API ao uso comercial | Verificar termos de uso de dados, retenção, região e DPA. Vertex AI só se houver incompatibilidade | Developer API, no nível pago | Antes do beta com dados reais |
| DP-02 | Modelos Gemini por funcionalidade e teto de custo por chamado | Qualidade no golden set, latência, preço oficial vigente | Modelo leve para triagem; superior para análises (v1.2+); modelo de embeddings do Google (v1.1) | Fase 3 |
| DP-03 | Autenticação: Clerk ou Better Auth | Segurança, compatibilidade com Next.js, sessões, controle de acesso, multi-tenancy, complexidade, custos, limites do plano gratuito, escalabilidade, domínio separado do cliente final | Recomendação fundamentada na Fase 3 | Fase 3 |
| DP-04 | Processamento assíncrono | Recursos nativos da Vercel, serviço externo com camada gratuita ou fila no próprio PostgreSQL | Preferir opção sem nova assinatura | Fase 3 |
| DP-05 | Segunda camada de isolamento | Row-Level Security no PostgreSQL ou alternativa, compatível com o ORM e o pool do Neon | RLS, condicionado à prova de conceito | Fase 3 |
| DP-06 | ORM e stack de aplicação | Stack de referência: Next.js, TypeScript, Tailwind, shadcn/ui, Prisma, Zod, Vitest, ferramenta E2E | Manter a referência, validando DP-05 | Fase 3 |
| DP-07 | Provedor de e-mail (saída e entrada) | Camada gratuita ou por consumo, webhooks de entrada e de entrega, autenticação de domínio, reputação | Comparativo na Fase 3 | Fase 3 |
| DP-08 | Armazenamento de anexos | **Decidida na versão 0.3:** Vercel Blob privado (DA-20). S3 + GuardDuty pago não aprovado | — | — |
| DP-09 | Observabilidade | Logs da hospedagem, monitoramento de erros com camada gratuita, tabela própria de métricas de IA | Comparativo na Fase 3 | Fase 3 |
| DP-10 | Plano de hospedagem | O plano gratuito da Vercel é destinado a uso pessoal não comercial, a confirmar nos termos vigentes. Pilotos comerciais provavelmente exigem plano pago | Submeter o custo à aprovação antes do Gate de dados reais | Antes do Gate de dados reais |
| DP-11 | Prazo padrão de retenção de chamados | Definição com apoio jurídico. Configurável pela organização | Sem inclinação | Antes do beta |
| DP-12 | Estratégia antimalware para anexos reais (decisão técnica e financeira) | (a) Solução antimalware adequada (serviço gerenciado ou varredura própria, com custo a apresentar e aprovar) ou (b) aceitação temporária e documentada do risco residual, se justificável, com controles compensatórios e prazo. A sanitização (CDR), a restrição de tipos e o download forçado são controles complementares, não substitutos (RSG-19) | Sem inclinação. **Nenhuma aceitação de risco autorizada** e nenhum serviço pago autorizado nesta etapa | Antes do Gate de dados reais e de qualquer anexo real de cliente |
| DP-13 | Importação de CSV: v1.1 ou v1.2 | Demanda das organizações do beta | Decidir após o beta | Fim da v1.0 |
| DP-14 | Nome de domínio e identidade visual | Domínio próprio, necessário para autenticação de e-mail | Sem inclinação | Antes do I-2 |
| DP-15 | Limites padrão (cota de IA, anexos, rate limiting) | Calibrar com o custo medido. Anexos: 4 MB por arquivo no Marco A **já aprovado** (DA-20); quantidade por mensagem e limites do beta a definir | Valores provisórios deste PRD | Fase 3 |
| **DP-16 (nova)** | Questões jurídicas de privacidade | (a) se a anonimização de RN-30 atende aos pedidos de eliminação neste contexto; (b) tratamento de dados pessoais nos registros de auditoria; (c) comunicação da retenção em backups; (d) necessidade de exclusão total de chamados de um contato; (e) confirmação dos papéis de controladora, operadora e suboperador; (f) prazo padrão de retenção (com DP-11) | Sem inclinação. Requer assessoria jurídica | Antes do Gate de dados reais |
| **DP-17 (nova)** | Prazos operacionais de retenção | Logs técnicos (proposta: 30 dias), auditoria (proposta: 12 meses), quarentena de e-mail (proposta: 30 dias), arquivos de exportação (proposta: 7 dias), log de recebimento de mensagens automáticas (proposta: 30 dias) | Valores propostos, a validar com DP-16 e com os recursos dos provedores | Fase 3 |
| **DP-18 (nova, v0.3)** | Comportamento da exclusão de arquivos no Vercel Blob | Verificar: se a exclusão é definitiva; existência ou ausência de versionamento; possibilidade de recuperação de arquivos excluídos; impactos sobre retenção, anonimização (RN-30, RN-33) e LGPD (DP-16). Não presumir irreversibilidade sem confirmação técnica | Sem inclinação | Antes da implementação dos anexos (I-4) |

## 26. Critérios de conclusão do MVP

A v1.0 é concluída em marcos sucessivos (DA-18). A conclusão técnica (Marco A) não depende de cliente piloto. O uso de dados reais só começa após o Gate de dados reais. Os KPIs da seção 20 não são condição de conclusão: eles medem o resultado após o uso. Os identificadores CC-01 a CC-13 da versão 0.1 foram preservados e redistribuídos entre os marcos.

| Ordem | Marco | Natureza | Condição para iniciar |
| --- | --- | --- | --- |
| 1 | MVP Core (MC-01 a MC-05, seção 16.1) | Demonstração interna, dados fictícios | Homologação do PRD e da arquitetura |
| 2 | Marco A — MVP tecnicamente homologado | Homologação técnica, dados sintéticos | MVP Core homologado |
| 3 | Gate de dados reais | Condições legais, de segurança e de infraestrutura | Marco A homologado |
| 4 | Marco B — Beta comercial validado | Validação com organização real | Gate de dados reais atendido |

**26.1 Marco A — MVP tecnicamente homologado**

- [ ] CC-01: histórias HU-01 a HU-20 implementadas, com todos os critérios de aceite aprovados (cobertura da seção 19.1).
- [ ] CC-02: suíte de isolamento multi-tenant (RSG-03) com 100% de sucesso, executada no pipeline.
- [ ] CC-03: testes automatizados de unidade, integração e ponta a ponta das jornadas J1 a J6 (incluindo J3b) passando no pipeline, contra o ambiente Preview, com dados sintéticos.
- [ ] CC-04: golden set de triagem completo (RIA-13), com resultado igual ou superior às metas de KPI-04.
- [ ] CC-05: modo degradado sem IA demonstrado (indisponibilidade simulada, IA desativada e cota esgotada).
- [ ] CC-06: revisão de segurança concluída (incluindo isolamento, autenticação, anexos, e-mail de entrada e prompt injection), sem vulnerabilidades altas ou críticas abertas.
- [ ] CC-07: backup e restauração testados e documentados (RNF-17), incluindo a reaplicação de anonimizações (RN-36, CA-17.5).
- [ ] CC-10: medição de consumo de IA validada, com o registro coincidindo com o consumo informado pelo provedor dentro de uma tolerância de 5%, e com cotas e teto global testados.
- [ ] CC-11: documentação técnica e funcional atualizada (arquitetura, operação, runbook de incidentes, procedimento de acesso excepcional de RN-32, guia de configuração inicial).
- [ ] CC-14: infraestrutura operacional nos três ambientes (RNF-16), com monitoramento de erros, métricas de fila e de IA (RNF-12, RNF-13) e segredos segregados (RSG-07).
- [ ] CC-15: controles de anexos (RSG-12, RSG-17, RSG-18 e o fluxo de estados e sanitização de RSG-19, CA-10.9) e de e-mail de entrada (RN-15 a RN-19) homologados com arquivos e mensagens sintéticos, com a verificação de DP-18 concluída e registrada.

**26.2 Gate de dados reais (pré-condições do beta)**

Nenhuma organização real usa a plataforma com dados reais antes de todos os itens abaixo.

- [ ] CC-08: verificação dos termos da Gemini Developer API concluída e registrada (DP-01).
- [ ] CC-09: Termos de Uso, Política de Privacidade, DPA e lista de suboperadores publicados após revisão jurídica (RSG-20, RSG-21), com avaliação da transferência internacional (RSG-22).
- [ ] CC-13: decisões pendentes que bloqueiam o beta decididas e registradas: DP-01, DP-03, DP-04, DP-07, DP-10, DP-11, DP-12, DP-16 e DP-18 (DP-08 já decidida na versão 0.3).
- [ ] CC-16: plano de hospedagem e demais serviços compatíveis com uso comercial, confirmados documentalmente e com custos aprovados (DP-10, RST-04).
- [ ] CC-17: DP-12 decidida formalmente pelo responsável: solução antimalware adequada implementada e homologada, **ou** aceitação temporária e documentada do risco residual, se justificável (RSG-19). Até essa decisão, nenhum anexo real de cliente é aceito.
- [ ] CC-18: Marco A homologado, sem pendência de segurança alta ou crítica aberta.

**26.3 Marco B — Beta comercial validado**

- [ ] CC-12: pelo menos uma organização real convidada opera a plataforma por 30 dias corridos (proposta, alinhada à janela de KPI-01), com acompanhamento do responsável pelo produto.
- [ ] CC-19: nenhum incidente crítico (ver glossário) no período. Incidentes não críticos registrados com causa e tratamento.
- [ ] CC-20: feedback estruturado coletado com Administradores, Gestores e Atendentes da organização.
- [ ] CC-21: avaliação de aderência às necessidades do cliente documentada, incluindo as hipóteses H1 a H5 da seção 3 e os KPIs disponíveis no período.
- [ ] CC-22: oportunidades de melhoria registradas e priorizadas como insumo para o PRD incremental da v1.1.

## Matriz de rastreabilidade (v1.0)

| Objetivo | Requisitos funcionais | Histórias | Critérios de aceite | KPIs | Critérios de conclusão |
| --- | --- | --- | --- | --- | --- |
| OBJ-01 Operação segura multi-tenant | RF-ORG-01 a 09, RF-ORG-11, RF-PUB-01, RF-CLI-01 a 06, RF-ATD-01 a 12, RF-EML-01 a 08, RF-AUD-01 a 03 | HU-01 a 07, HU-10, HU-11, HU-15, HU-17 a 20 | CA-01.x a CA-07.x, CA-10.x, CA-11.x, CA-15.x, CA-17.x a CA-20.x | KPI-01, KPI-02, KPI-09 | CC-01, CC-02, CC-06, CC-09, CC-15, CC-19 |
| OBJ-02 Triagem com qualidade | RF-TRI-01 a 09, RF-ATD-13, RF-DSH-02 | HU-03, HU-08, HU-09 | CA-03.x, CA-08.x, CA-09.x, CA-14.2 | KPI-03, KPI-04, KPI-05 | CC-04, CC-05 |
| OBJ-03 SLA | RF-SLA-01 a 05, RF-ATD-10 | HU-12 | CA-11.3, CA-12.x | KPI-06 | CC-01 |
| OBJ-04 Canal do cliente | RF-POR-01 a 06, RF-EML-01, RF-EML-07 | HU-05, HU-07, HU-13 | CA-05.x, CA-07.x, CA-10.6, CA-10.7, CA-13.x | KPI-07 | CC-01, CC-20 |
| OBJ-05 Indicadores determinísticos | RF-DSH-01, RF-DSH-03, RF-DSH-04, RF-ORG-10 | HU-14 | CA-14.1, CA-14.3 a CA-14.5 | KPI-06, KPI-07 | CC-01 |
| OBJ-06 Custo controlado | RF-CON-01 a 04, RF-DSH-05, RF-TRI-07 a 09, RF-ORG-09 | HU-09, HU-16 | CA-09.x, CA-16.x | KPI-08 | CC-10, CC-16 |

## 27. Glossário

| Termo | Definição |
| --- | --- |
| Organização (tenant) | Empresa contratante, com ambiente lógico isolado na plataforma |
| Contato | Cliente final de uma organização, que registra manifestações |
| Empresa-cliente | Empresa à qual um ou mais contatos pertencem |
| Manifestação | Qualquer comunicação do cliente: reclamação, solicitação, dúvida, sugestão ou elogio |
| Chamado | Registro de tratamento de uma manifestação, com protocolo, status e histórico |
| Protocolo | Identificador legível e único de um chamado dentro da organização |
| Triagem | Classificação inicial do chamado (tipo, categoria, motivo, sentimento, urgência, risco, prioridade, equipe) |
| Motivo de contato | Razão específica da manifestação, mais granular que a categoria, base para análises de recorrência |
| Risco de escalada | Indício de que o cliente pode recorrer a canais externos (Procon, Reclame Aqui, ação judicial) ou cancelar |
| SLA | Meta de tempo de primeira resposta e de resolução, definida pela organização |
| CSAT | Customer Satisfaction Score: avaliação do atendimento pelo cliente, de 1 a 5 |
| Golden set | Conjunto de manifestações com classificação correta conhecida, usado para medir a qualidade da IA |
| Taxa de aceitação da triagem | Proporção de sugestões da IA confirmadas sem alteração (RN-13) |
| Modo degradado | Operação normal sem IA quando a Gemini API está indisponível ou a cota se esgotou |
| RAG | Retrieval-Augmented Generation: geração de respostas com base em documentos recuperados da base de conhecimento |
| Embedding | Representação numérica de um texto, usada em busca semântica |
| Prompt injection | Tentativa de manipular a IA com instruções inseridas no conteúdo analisado |
| Link mágico | Link de acesso de uso único enviado por e-mail, que dispensa senha |
| Controladora / Operadora | Papéis da LGPD: quem decide sobre o tratamento / quem trata dados em nome do controlador |
| Suboperador | Terceiro contratado pela operadora para tratar dados (ex.: provedor de IA) |
| DPA | Data Processing Agreement: acordo de tratamento de dados entre controladora e operadora |
| Superadmin | Operador interno da plataforma Customer Voice AI |
| Anonimização | Remoção ou substituição dos dados que identificam o titular, sem possibilidade razoável de reidentificação pela plataforma. Tem limitações (RN-33) |
| Exclusão | Remoção definitiva de um registro da base ativa |
| Pseudonimização | Substituição de dados identificadores por código que mantém o vínculo entre registros |
| Retenção legal | Conservação de dados determinada pela controladora por obrigação legal ou para exercício de direitos, que suspende anonimização e expiração (RN-34) |
| Quarentena | Estado em que uma mensagem recebida ou um anexo fica isolado, invisível ao cliente e sem efeitos no chamado, até decisão humana ou verificação |
| CDR (sanitização) | Content Disarm & Reconstruction: validação e reconstrução, ou rejeição, de arquivos para remover conteúdo potencialmente perigoso. Não é verificação antimalware |
| Incidente crítico | Acesso indevido a dados entre organizações ou por terceiros, perda de dados confirmada, falha de segurança explorada, ou indisponibilidade da operação principal por mais de 4 horas em horário comercial |
| MVP Core | Marco interno de demonstração (atendimento + triagem), apenas com dados fictícios (seção 16.1) |
| Marco A / Marco B | Homologação técnica do MVP / validação do beta com organização real (seção 26) |
| Gate de dados reais | Conjunto de condições legais, de segurança e de infraestrutura obrigatórias antes do uso com dados reais (seção 26.2) |
| Gemini Developer API | Interface de acesso aos modelos Gemini do Google, com chave de API do projeto, distinta da Vertex AI |
