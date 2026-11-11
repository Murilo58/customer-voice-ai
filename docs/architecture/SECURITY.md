# Customer Voice AI — Arquitetura de Segurança

| Item | Valor |
| --- | --- |
| Versão | 1.0 — Candidata à homologação |
| Data | 09/11/2026 |
| Base | PRD 0.2: seção 13 (RSG-01 a 27), RN-15 a 19, RN-30 a 36 |
| Status | **Proposta.** Controles dependentes da ADR-002 (aprovada com condições) e da ADR-004 (Better Auth pendente de validação) |

**Escopo:** este documento define **controles técnicos**. Ele não declara conformidade com a LGPD. As decisões jurídicas pendentes estão na seção 9 e são condição do Gate de dados reais.

## 1. Ativos e fronteiras de confiança

| Ativo | Classificação | Onde está |
| --- | --- | --- |
| Conteúdo de chamados, mensagens e anexos | Dado pessoal de terceiros (organização = controladora) | Neon, Vercel Blob (store privado; proposta), Resend (trânsito e retenção de 30 dias), Gemini (trânsito e logs do provedor) |
| Dados de contatos | Dado pessoal | Neon |
| Contas de usuários da equipe | Dado pessoal (plataforma = controladora) | Neon (Better Auth) |
| Segredos (chaves Gemini, Resend, token do Blob, banco) | Crítico | Variáveis de ambiente da Vercel, por ambiente |
| Trilha de auditoria | Integridade crítica | Neon (somente inserção) |

**Fronteiras de confiança:**

1. Navegador da equipe ↔ aplicação.
2. Navegador do cliente final ↔ portal.
3. Provedores (Resend, callbacks do Vercel Blob) ↔ webhooks.
4. Aplicação ↔ Gemini, onde **o conteúdo do cliente é não confiável**.
5. Aplicação ↔ banco, com isolamento por tenant.

## 2. Modelo de ameaças (STRIDE resumido)

| # | Ameaça | Vetor | Controles | Verificação |
| --- | --- | --- | --- | --- |
| A1 | Acesso a dados de outra organização (IDOR, filtro esquecido) | ID em URL ou API, consulta sem `WHERE` | RLS com `FORCE`, `withTenant`, organização vinda da sessão, FKs compostas, 404 para recurso de outro tenant | PoC T1 a T8 e N0 a N7; suíte RSG-03 bloqueante; CA-04.1 |
| A2 | Vazamento de contexto entre requisições pelo pooler | Reuso de conexão | `set_config(..., true)` só dentro de transação; `set_config` de sessão proibido | PoC T6, T8, T9, N3, N4 |
| A3 | Sequestro de sessão ou força bruta | Credenciais, cookies | Cookies HttpOnly/Secure/SameSite, expiração por inatividade, revogação, rate limiting de login, MFA (obrigatório para Superadmin) | CA-02.2, CA-02.3 |
| A4 | Abuso do portal (enumeração de e-mails, spam) | Formulário e link mágico | Resposta idêntica com ou sem contato, Turnstile, WAF e limites por e-mail e IP, token de uso único em hash | CA-05.3, CA-07.1 |
| A5 | Falsificação de remetente e associação indevida de e-mail | E-mail forjado, token reutilizado | RN-15 (token + organização + remetente + `authentication` do provedor), quarentena (RN-17), e-mails sem histórico (RN-19) | CA-06.4, CA-06.6, CA-06.9 |
| A6 | Webhook forjado | Chamada direta ao endpoint | Assinatura Svix (Resend), verificação da assinatura do callback do Blob, janela de timestamp, idempotência | Testes de integração |
| A7 | XSS armazenado | HTML de e-mail, textos de clientes, justificativa da IA | Sanitização no servidor (lista permitida), React com escape padrão, proibição de `dangerouslySetInnerHTML` sem sanitizador, CSP restritiva | CA-06.8, CA-08.4 |
| A8 | CSRF | Formulário entre sites | SameSite=Lax/Strict, verificação de origem em Server Actions (padrão do Next.js) e token nos formulários do portal | Testes |
| A9 | SQL injection | Consultas cruas | ORM parametrizado; SQL cru só com template parametrizado (`$queryRaw` com tags); `$queryRawUnsafe` proibido por lint fora de migrations | Lint + revisão |
| A10 | Prompt injection | Texto da manifestação | Dados delimitados, saída restrita a enums de IDs, validação Zod, RN-14, IA sem ferramentas e sem ações, revisão humana | Casos adversariais no golden set (S21, S22, S38) |
| A11 | Exposição de dados ao provedor de IA | Envio de PII | Mascaramento (RIA-09), sem anexos (RIA-10), sem mensagens em quarentena, nível pago, dados sintéticos até DP-01 | Testes unitários de mascaramento |
| A12 | Malware em anexos | Upload ou e-mail | Lista restrita, bloqueio de executáveis, macros, compactados e conteúdo ativo, verificação de conteúdo real, CDR com quarentena e falha fechada, download forçado e nosniff. Sem antivírus por assinatura: risco residual para decisão no Gate (DP-12) | CA-06.5, CA-10.4, CA-10.8 |
| A13 | Vazamento de segredos | Repositório, logs, erros | Variáveis de ambiente por ambiente, varredura de segredos no CI, logs sem segredos, mensagens de erro genéricas | CI + revisão |
| A14 | Adulteração da auditoria | Update ou delete | Papel sem privilégios de alteração, trigger de bloqueio | CA-15.2 |
| A15 | Gastos descontrolados de IA (abuso econômico) | Volume ou loop | Cotas por organização, teto global, teto de gasto no Google, rate limit do Tier 1 | CA-09.2, CA-16.7 |
| A16 | Indisponibilidade ou perda de dados | Falha de provedor, erro humano | PITR do Neon, outbox durável, modo degradado, backups testados, rollback | CC-05, CC-07 |
| A17 | Artefatos de ferramentas inseridos no repositório | CLIs que instalam configurações de agentes | Revisão de PR e verificação no CI de pastas não aprovadas | POC_RESULTS, seção 6 |

## 3. Controles por tema

### 3.1 Autenticação

| Contexto | Controle |
| --- | --- |
| Equipe | Better Auth (pendente de validação): e-mail e senha com política mínima, 2FA TOTP com códigos de backup, convites com expiração, sessão em banco com revogação imediata (`cookieCache` desativado ou `maxAge` curto, para atender CA-02.2) |
| Superadmin | Mesma base, com papel de plataforma e **MFA obrigatório**. Rotas `/admin` isoladas. Sem acesso a conteúdo de chamados (RN-32) |
| Cliente final | Módulo próprio: link mágico de 15 minutos e uso único; token de acompanhamento revogável por chamado. Ambos com 128 bits de entropia, guardados como SHA-256. Sessão curta com cookie `Path=/portal` |
| Recuperação de acesso | Pelo mecanismo do Better Auth, com rate limiting e tokens de uso único |

### 3.2 Autorização

- **Matriz em código**, a detalhar na Fase 4:
  - Perfis `admin`, `manager`, `agent`, mais a permissão `executive_read` (RF-ORG-10).
  - Ações por módulo.
  - Verificação no caso de uso, nunca só na interface (RSG-04).
- **Sequência por requisição:**
  1. Sessão válida.
  2. Vínculo ativo com a organização ativa.
  3. Organização ativa e não suspensa.
  4. Permissão do perfil.
  5. Regra de escopo, quando houver (ex.: atendente só assume chamado de sua equipe, CA-10.5).

### 3.3 Segregação de dados

Ver [ADR-002](ADR/ADR-002-isolamento-multi-tenant.md) e [DATA_MODEL.md](DATA_MODEL.md), seção 5.

**Defesa em profundidade:** sessão → `withTenant` → RLS → FK composta.

### 3.4 Proteção de entrada e saída

- Validação Zod em todas as entradas: Server Actions, rotas, webhooks e respostas da IA.
- **Sanitização de HTML** com biblioteca de lista permitida (a escolher na implementação):
  - Sem `script`, `iframe`, `form`, `style` ativo ou handlers `on*`.
  - Links com `rel="noopener noreferrer nofollow"`.
  - Imagens remotas bloqueadas por padrão.
- **CSP:** `default-src 'self'`, sem `unsafe-inline` para scripts (nonce), `frame-ancestors 'none'` e `img-src` restrito.
- **Cabeçalhos:** HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

### 3.5 Rate limiting e anti-bot

Ver [ADR-009](ADR/ADR-009-rate-limiting.md). Parâmetros iniciais:

| Ponto | Limite proposto |
| --- | --- |
| Formulário do portal | 5/min e 20/h por IP; 10/h por e-mail. Turnstile obrigatório |
| Solicitação de link mágico | 3 a cada 15 min por e-mail; 10/h por IP |
| Login | 10 tentativas a cada 15 min por IP + e-mail; bloqueio progressivo |
| Webhooks | Assinatura obrigatória; 600/min global (WAF) |
| E-mail de entrada | RN-16: 10 mensagens/h por remetente e organização |
| API autenticada | 300/min por usuário |

### 3.6 Segredos

- Um conjunto de credenciais por ambiente: chaves Gemini em projetos Google separados, chaves Resend separadas, papéis Neon distintos, um store privado do Blob (e token) por ambiente.
- As variáveis da Vercel são marcadas como sensíveis. Nenhum segredo usa prefixo `NEXT_PUBLIC_`.
- **Rotação:** procedimento documentado e rotação imediata em caso de suspeita.
- Varredura de segredos no CI (ex.: ação de secret scanning do GitHub).

### 3.7 Auditoria

- Eventos de RF-AUD-01, mais quarentena, retenção legal, reprocessamento forçado, exportação e anonimização.
- Campos: ator, organização, ação, alvo, `request_id`, `ip_hash` (IP com hash e sal) e detalhes mascarados.
- **Imutabilidade:** privilégios do papel mais trigger. Exceção: pseudonimização na anonimização, pendente de DP-16.

### 3.8 Segurança de anexos

Ver [ADR-008](ADR/ADR-008-anexos-antimalware.md), revisão 2, **aprovada com condições**, com custo adicional zero. **Não homologada para anexos reais de clientes.**

1. Lista aprovada: PNG, JPEG, WEBP, PDF, TXT e CSV. DOCX, XLSX, ODT e outros ficam bloqueados até nova avaliação. Limite de 4 MB por arquivo no Marco A (ADR-008, C2 e C3).
2. Bloqueios da RSG-17 e verificação do tipo real pelo conteúdo.
3. Upload direto ao **store privado** do Vercel Blob, com token restrito gerado após autorização, no caminho `quarantine/{org}/{id}`.
4. **CDR** em job: recodificação de imagens, normalização de texto e CSV (neutralização de fórmulas) e rejeição de PDFs com conteúdo ativo.
5. Estados `pending` → `released` ou `quarantined`, com **falha fechada**.
6. Download só de `released`, por rota autenticada, com `Content-Disposition: attachment`, nosniff, `no-store` e `CSP: sandbox`.

**Development e Preview** usam apenas arquivos sintéticos.

**Limitação:** CDR não é antivírus. **Restrição de tipos, CDR e download forçado não substituem a verificação antimalware.** Antes do beta comercial, a DP-12 deve ser decidida formalmente: aceitação temporária e documentada do risco residual, se justificável, ou antimalware adequado. **Nenhuma aceitação de risco está autorizada neste momento.**

### 3.9 Segurança de IA

Ver [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md), seção 6.

## 4. Retenção de dados

Ver [DATA_MODEL.md](DATA_MODEL.md), seção 6. A execução da retenção é um job diário (`retention.expire`), desativado até as decisões de DP-11 e DP-16 (RN-31).

## 5. Backup e recuperação

| Item | Proposta |
| --- | --- |
| Banco de produção | Neon Launch: instant restore de até 7 dias (configurável; padrão de 1 dia nos planos pagos, a ajustar para 7) e snapshots manuais antes de migrations relevantes |
| Metas (RNF-17) | RPO de 24 h e RTO de 8 h, atendidos com folga pelo PITR |
| Teste | Restauração em branch isolado, com reaplicação de anonimizações (RN-36, CA-17.5), antes do Marco A (CC-07) |
| Anexos | Versionamento do bucket a avaliar, considerando o impacto na exclusão (anonimização) |
| Configuração | Infraestrutura documentada; variáveis exportáveis da Vercel |

## 6. Resposta a incidentes

1. **Detecção:** alertas da ADR-010, relatos e Sentry.
2. **Classificação:** incidente crítico conforme o glossário do PRD.
3. **Contenção:**
   - Revogar sessões e chaves.
   - Suspender a organização afetada.
   - Ativar o teto de IA.
   - Pausar o deploy de produção.
4. **Acesso técnico excepcional à base:** apenas para incidentes, com registro em log operacional de motivo, responsável e período (RN-32).
5. **Comunicação** às organizações afetadas, para que avaliem suas obrigações perante a ANPD e os titulares (RSG-16).
6. **Pós-incidente:** causa raiz, ações corretivas e atualização do runbook.

## 7. Controles no ciclo de desenvolvimento

- **CI bloqueante:** lint (incluindo regras contra cliente Prisma cru, `$queryRawUnsafe` e `set_config` de sessão), typecheck, testes, suíte de isolamento, verificação de dependências (`npm audit` ou Dependabot), secret scanning e verificação de pastas de configuração de agentes não aprovadas.
- **Versões de dependências** fixadas e atualizadas por PR revisado. Novas versões major só após avaliação.
- **Revisão de segurança** ao fim de cada incremento e revisão completa antes do Marco A (CC-06).

## 8. Matriz de rastreabilidade (RSG → controle)

| RSG | Controle principal | Seção |
| --- | --- | --- |
| RSG-01 a 03 | RLS, `withTenant`, FKs compostas, suíte de isolamento | 3.3 |
| RSG-04 | Autorização no caso de uso | 3.2 |
| RSG-05, 06 | Better Auth com MFA; tokens do portal | 3.1 |
| RSG-07 | Segredos por ambiente | 3.6 |
| RSG-08 | Logs sem conteúdo | ADR-010 |
| RSG-09 | Segurança de IA | AI_ARCHITECTURE, seção 6 |
| RSG-10 | Validação, sanitização, CSP | 3.4 |
| RSG-11 | Rate limiting e Turnstile | 3.5 |
| RSG-12, 17 a 19 | Anexos | 3.8 |
| RSG-13 | Auditoria | 3.7 |
| RSG-14 | TLS; criptografia em repouso dos provedores (Neon, Vercel Blob; confirmação da criptografia do Blob pendente) | — |
| RSG-15 | Dependências | 7 |
| RSG-16 | Incidentes | 6 |
| RSG-20 a 27 | Mecanismos técnicos em DATA_MODEL e PRD; documentos jurídicos pendentes | 9 |

## 9. Decisões jurídicas pendentes (não técnicas)

| Tema | Referência | Situação |
| --- | --- | --- |
| Termos da Gemini Developer API: prazo de retenção dos logs (não informado), armazenamento “in any country”, DPA de operador | DP-01, RSG-22 | Pendente de análise jurídica |
| Transferência internacional (Google, Resend, Vercel, Sentry) | RSG-22 | Pendente |
| Suficiência da anonimização para pedidos de eliminação; pseudonimização na auditoria; retenção em backups | DP-16 | Pendente |
| Prazo padrão de retenção | DP-11 | Pendente |
| Termos de Uso, Política de Privacidade, DPA, lista de suboperadores | RSG-20, RSG-21 | Pendente |
| Uso comercial nos planos gratuitos (Resend, Sentry, Neon) | DP-10, ADR-013 | Pendente de confirmação documental |
