# Provas de conceito — Resultados e evidências

| Item | Valor |
| --- | --- |
| Autorização | Aprovação da Etapa 3A: três PoCs exploratórias, ambientes isolados, contas gratuitas, sem dados reais, sem contratação |
| Data | 09/11/2026 (parte local); 10/11/2026 (parte Neon) |
| Código | `poc/` (fora da aplicação; não é base para implementação) |
| Custo incorrido | US$ 0 |

## Situação geral

| PoC | Situação | Bloqueio |
| --- | --- | --- |
| PoC 1 — RLS: parte local (desenho SQL) | **Executada: 13/13 testes aprovados** | — |
| PoC 1 — RLS: parte Neon (pooler + Prisma 7) | **Aprovada com ressalvas (10/11/2026).** Isolamento: aprovado nos cenários testados. Desempenho N7: **atendido na Vercel (12/11/2026), p95 13,3–14,5 ms**. Homologação integrada: pendente | Ver seção do N7 abaixo |
| PoC 2 — Teste comparativo Gemini | **Executada (11/11/2026): 80/80 chamadas, 100% de saídas válidas.** Recomendado: `gemini-3.1-flash-lite` (indicativo) | Seleção definitiva depende do golden set de 200 itens (RIA-13) e da decisão do responsável |
| PoC 3 — Recursos do Resend | **Documental concluída; prática aprovada (11–12/11/2026):** recebimento com SPF/DKIM/DMARC, cabeçalhos, MIME bruto, anexos e subendereçamento `r+token@`; envio com cabeçalhos customizados e idempotência | `Message-ID` customizado **não** é preservado na entrega (R2a'): ajuste mínimo da ADR-007 aprovado em 12/11/2026 (seção 4.2) |

Credenciais nunca são solicitadas no chat. O responsável as configura localmente (seção 5); a verificação confirma apenas presença e formato, sem exibir valores.

---

## 1. PoC 1 — RLS (parte local, executada)

**Ambiente:** PostgreSQL 17.5 embutido (PGlite 0.3.16), em processo, com dados sintéticos. Script: `poc/rls-pglite/poc-rls.mjs`. Evidência: `poc/rls-pglite/resultado-2026-11-09.txt`.

**O que valida:** o desenho SQL da ADR-002:

- Papel de migração não superusuário e papel de runtime sem `BYPASSRLS`.
- `ENABLE` + `FORCE ROW LEVEL SECURITY`.
- Políticas `USING`/`WITH CHECK`.
- Função `app_current_org()`.
- FKs compostas.
- `set_config(..., true)` por transação.
- Reuso sequencial da mesma conexão por transações de tenants diferentes, que é o comportamento do PgBouncer em modo transação.

| Teste | Resultado | Evidência |
| --- | --- | --- |
| T-OWNER — FORCE RLS bloqueia o dono sem contexto | Aprovado | 0 linhas |
| T1 — cada tenant vê só seus dados | Aprovado | A=30, B=20 |
| T2 — sem contexto: 0 linhas e insert recusado | Aprovado | — |
| T3 — UPDATE sem WHERE afeta só o tenant | Aprovado | 30 afetadas, 0 em B |
| T4 — WITH CHECK impede inserir ou mover dados para outro tenant | Aprovado | Ambos recusados |
| T5 — FK composta recusa referência cruzada | Aprovado | `violates foreign key constraint` |
| T6 — contexto não sobrevive ao COMMIT | Aprovado | 0 linhas; valor residual `""` |
| T6b — sem `NULLIF`, o valor residual gera erro de cast | Aprovado (achado) | `invalid input syntax for type uuid: ""` |
| T7 — rollback não deixa contexto residual | Aprovado | 0 linhas |
| T8 — 2.000 transações alternando tenants na mesma conexão | Aprovado | 0 vazamentos |
| T9 — controle negativo: `set_config` de sessão vaza | Aprovado (comportamento esperado) | 30 linhas visíveis sem contexto local |
| T10 — várias escritas na mesma transação mantêm o contexto | Aprovado | — |
| T11 — sobrecarga local (indicativa) | Registrado | 0,96 ms com contexto × 0,34 ms simples, em processo |

**Achados que entram na arquitetura:**

1. **`current_setting` volta como string vazia, não nulo**, depois que a variável é usada na sessão. As políticas devem usar `NULLIF(current_setting('app.org_id', true), '')::uuid`, encapsulado na função `app_current_org()`. Sem isso, o comportamento é falha por erro de cast, ainda fechada, mas gera exceções.
2. **`set_config(..., false)` (sessão) vaza contexto entre transações** na mesma conexão. Isso deve ser proibido por regra de código e coberto por teste.
3. **`FORCE ROW LEVEL SECURITY` é indispensável:** sem ele, o dono da tabela ignora as políticas.

**Limitações:** não valida o pooler real do Neon, a latência de rede, a concorrência entre funções Vercel nem o comportamento do Prisma 7 com `@prisma/adapter-neon`. A sobrecarga medida não representa produção.

## 2. PoC 1 — RLS (parte Neon, executada)

**Ambiente:** projeto Neon gratuito e exclusivo (`cva-poc-rls`), AWS São Paulo (`sa-east-1`), PostgreSQL 18.6, banco vazio antes da execução (verificado). Conexão do runtime pelo pooler (PgBouncer, modo transação) com papel próprio sem `BYPASSRLS`. Prisma 7.10.1 + `@prisma/adapter-neon` 7.10.1. Cliente executado a partir da máquina do responsável (Brasil, rede doméstica). Dados sintéticos. Custo: US$ 0.

**Script:** `poc/rls-neon/poc-neon.ts`. **Evidências:** `poc/rls-neon/resultado-neon-2026-11-11-execucao1.json` a `-execucao4.json` (datas em UTC).

### Resultado consolidado (execuções 2 a 4, script revisado)

| Teste | O que verifica | Critério | Resultado |
| --- | --- | --- | --- |
| N0 | Papel, tabelas e políticas via SQL no Neon | Sem erro | Aprovado |
| N1 | Transação interativa do Prisma 7 com `set_config` pelo adaptador | Seed concluído | Aprovado |
| N2 | Sem contexto, pelo pooler | 0 linhas | Aprovado (0) |
| N3 | 2.000 transações, 50 simultâneas, alternando tenants | 0 vazamentos e 0 erros | Aprovado nas 3 execuções; p95 237–251 ms (fila no pool do cliente) |
| N3b | Diagnóstico: 2.000 transações, 20 simultâneas (= pool do cliente) | 0 vazamentos e 0 erros | Aprovado nas 3 execuções; p95 90–97 ms |
| N4 | 200 consultas sem contexto após a carga | 0 linhas | Aprovado (0) |
| N5 | Rollback em transação interativa | Sem contexto residual | Aprovado |
| N6 | WITH CHECK e FK composta pelo runtime | Ambas recusadas | Aprovado |
| N7a | Diagnóstico: ida e volta de rede (`SELECT 1`) | Registro | p50 23–27 ms; p95 34–38 ms |
| N7 | Sobrecarga p95 com contexto × consulta simples | ≤ 15 ms | Máquina local: 80–99 ms (não representativo). **Vercel `gru1` (12/11/2026): 14,5 / 13,3 / 13,4 ms — atendido** (consulta simples p95 ≈ 5 ms; com contexto ≈ 18–20 ms) |
| CLN | Limpeza ao final | 0 papéis e 0 tabelas restantes | Aprovado |

**Total sob carga:** 14.000 transações concorrentes pelo pooler (2.000 na execução 1; 4.000 em cada uma das execuções 2 a 4), **0 vazamentos**.

### Interpretação

1. **Isolamento multi-tenant: aprovado.** Nenhum vazamento, nenhum contexto residual após carga ou rollback, escrita cruzada recusada. O padrão `withTenant` (transação interativa + `set_config(..., true)`) funciona pelo pooler real do Neon com Prisma 7.
2. **N7 é inconclusivo, não uma falha do mecanismo.** A transação com contexto faz 4 idas e voltas (BEGIN, `set_config`, consulta, COMMIT) contra 1 da consulta simples. A diferença medida (80–99 ms) corresponde a cerca de 3 idas e voltas de 23–27 ms, isto é, é dominada pela rede doméstica até `sa-east-1`. Em produção, a função Vercel e o banco ficam próximos e a ida e volta tende a ser muito menor, mas **isso não foi medido**: medir exige executar a partir de uma função na Vercel, o que envolve deploy, ainda não autorizado.
3. **Erros na execução 1 (19 de 2.000 no N3): causa não confirmada.** A versão original do script descartava a causa. Não se repetiram em 12.000 transações posteriores (N3 e N3b) com a captura de causa ativada. Uma hipótese levantada (tempo de espera do Prisma para abrir transação interativa com 50 tarefas disputando 20 conexões) **não tem evidência e não é atribuída como causa**. Tratamento: testes adicionais de concorrência e dimensionamento do pool na implementação.

### Achados que entram na arquitetura

1. **Limpeza do papel no Neon:** `neondb_owner` não tem permissão para `DROP OWNED BY` sobre outro papel (`42501 permission denied to drop objects`). Usar `REVOKE` + `DROP ROLE`. A versão original falhava silenciosamente na limpeza; o script agora reporta erros e verifica o que restou (teste CLN).
2. **Pooler e papel recriado com o mesmo nome:** depois de remover e recriar `poc_app_runtime`, as transações pelo pooler passaram a falhar com `permission denied for table organizations`, mesmo com as permissões recém-concedidas. Com nome de papel único por execução, o erro desapareceu. Conclusão operacional: **não recriar papéis de banco com o mesmo nome em ambientes com pooler**; rotação de credenciais deve trocar a senha (`ALTER ROLE ... PASSWORD`) ou usar papel novo. A causa exata (reuso de conexões do papel antigo pelo pooler) é inferida, não confirmada.
3. **Concorrência acima do pool do cliente gera fila:** com 50 tarefas para 20 conexões, a latência p95 sobe de ~95 ms para ~245 ms. O tamanho do pool por função e o `maxWait` são parâmetros de configuração da implementação.

### Alterações no script durante a execução

O script da PoC (não é código da aplicação) foi ajustado para diagnóstico, sem mudar os critérios N0 a N7: captura da causa dos erros no N3, teste N3b, medição N7a, limpeza com `REVOKE` + `DROP ROLE`, verificação CLN e nome de papel único por execução. A versão original está preservada em `poc/rls-neon/poc-neon-v1-original.ts.txt`; a execução 1 corresponde a ela.

### Decisão do responsável (10/11/2026): APROVADA COM RESSALVAS

| Aspecto | Situação |
| --- | --- |
| Isolamento multi-tenant | **Aprovado nos cenários testados.** Sustenta a adoção de RLS como segunda camada de isolamento |
| Desempenho N7 | **Atendido em 12/11/2026** no deploy de teste (função Vercel `gru1` → Neon `sa-east-1`): p95 13,3–14,5 ms. A hipótese de latência de rede foi confirmada. Margem pequena (≈ 1 ms no pior caso) |
| Homologação integrada | **Pendente.** A homologação definitiva depende dos testes integrados da aplicação |
| 19 erros da execução 1 | **Ocorrência de causa não confirmada.** Não atribuída ao pool do Prisma sem evidência |
| Custo | US$ 0 |

**Ressalvas que viram obrigação:**

1. **Medição do N7 é atividade obrigatória do I-0**, antes da homologação do componente de persistência, em ambiente equivalente ao de produção.
2. **A implementação deve incluir testes adicionais de concorrência e de dimensionamento do pool.**
3. **Projeto Neon `cva-poc-rls` mantido temporariamente**, com o `.env` preservado, para testes complementares. Condições: isolado, sem dados reais, sem recursos pagos nem cobranças adicionais.

## 3. PoC 2 — Teste comparativo Gemini (executada)

### Resultado (11/11/2026)

**Ambiente:** chave do nível gratuito do Google AI Studio, configurada em `poc/gemini-benchmark/.env` (no `.gitignore`), execução local. 40 itens sintéticos × 2 modelos = 80 chamadas, nenhuma nova tentativa, nenhuma recusa por limite (429). Custo real: US$ 0 (nível gratuito). Custo equivalente no nível pago: US$ 0,021. **Evidência:** `poc/gemini-benchmark/resultado-benchmark-2026-11-11.json`.

| Métrica | `gemini-3.1-flash-lite` | `gemini-3.5-flash-lite` |
| --- | --- | --- |
| Saída válida no schema | 100% | 100% |
| Acurácia: tipo | **90,0%** | 87,5% |
| Acurácia: categoria | **100%** | 95% |
| Acurácia: urgência | 85% | 85% |
| Acurácia: risco de escalada | 100% (5/5 e nenhum falso positivo) | 100% |
| Adversariais (S21, S22, S38) | 3/3 tipo e categoria corretos | 3/3 |
| Latência p50 / p95 (só a chamada) | 1.149 / **1.602 ms** | 1.059 / 1.848 ms |
| Tokens médios entrada / saída / raciocínio | 263 / 100 / 0 | 263 / 93 / 0 |
| `thinkingLevel: MINIMAL` | Aceito | Aceito |
| Custo projetado por 1.000 chamados (nível pago, +10%) | **US$ 0,24** | US$ 0,34 |

**Erros comuns aos dois modelos:** urgência em S21, S22 e S34; tipo em S03, S23 e S39. A urgência é o campo mais fraco (85%), e os adversariais acertaram tipo e categoria, mas erraram a urgência. Isso indica ajuste de critério no prompt, não limitação de modelo.

**Recomendação:** `gemini-3.1-flash-lite` como modelo da triagem. É melhor ou igual em todos os campos de acurácia, tem p95 menor e custa cerca de 30% menos. O `gemini-3.5-flash-lite` fica como alternativa de contingência (mesmo schema e prompt). Com o MINIMAL, nenhum dos dois consumiu tokens de raciocínio.

**Pendências:**

1. Resultado indicativo (40 itens). A seleção definitiva exige o golden set de pelo menos 200 itens (RIA-13).
2. Revisar os critérios de urgência do prompt antes da integração (meta de acurácia a definir no golden set).
3. A troca de `AI_PROVIDER=simulated` para `gemini` na aplicação continua bloqueada até a decisão do responsável. O uso em produção exige chave do nível pago, porque no nível gratuito o conteúdo pode ser usado pelo Google, o que é inaceitável com dados reais.

### Preparação

**Script:** `poc/gemini-benchmark/benchmark.mjs`, com `@google/genai` 3.0.0, publicado em 06/11/2026.

**Conjunto de teste:** `golden-set-sintetico.json`, com 40 manifestações fictícias, 3 adversariais (injeção de instruções) e 5 com risco de escalada.

**Modelos comparados:** `gemini-3.1-flash-lite` e `gemini-3.5-flash-lite`.

**Medições:**

- Taxa de saída válida no schema (validação Zod).
- Acurácia de tipo, categoria, urgência e risco.
- Comportamento nos casos adversariais.
- Latência p50/p95.
- Tokens de entrada, saída e raciocínio (`thoughtsTokenCount`).
- Custo por triagem e projeção por 1.000 chamados.

**Salvaguardas de custo:**

- Limite rígido de 80 chamadas, mais novas tentativas.
- Estimativa impressa antes de executar.
- Aborto se a estimativa dobrada passar do teto (`COST_CEILING_USD`, padrão de US$ 0,50) ou se o gasto acumulado passar do teto.

**Custo estimado:**

- No nível pago: cerca de **US$ 0,06**, ou até US$ 0,12 com novas tentativas.
- Com chave do nível gratuito: US$ 0. Nesse caso, o conteúdo pode ser usado pelo Google para melhorar produtos, o que é aceitável **apenas** porque os dados são sintéticos.

**Fatos já verificados que o teste vai medir:**

- `gemini-3.5-flash-lite` tem raciocínio ligado por padrão, no nível mínimo, sem opção de desligar ([aistudio.google.com/docs/thinking](https://aistudio.google.com/docs/thinking)).
- “response pricing is the sum of output tokens and thinking tokens”.
- A página de raciocínio não lista o `gemini-3.1-flash-lite` (texto). O script tenta `thinkingLevel: MINIMAL` e registra se foi aceito.

**Limitação:** 40 itens dão um resultado indicativo. A seleção definitiva exige o golden set de pelo menos 200 itens (RIA-13).

## 4. PoC 3 — Resend

### 4.1 Verificação documental (concluída em 09/11/2026)

| Requisito | Resultado | Fonte |
| --- | --- | --- |
| Veredito SPF/DKIM/DMARC no recebimento (RN-15c) | **Atendido:** a API retorna `authentication: { spf, dkim, dmarc }` com valores `pass`, `fail`, `gray`, `processing_failed` ou `unknown`, vindos do servidor receptor | [Retrieve received email](https://resend.com/docs/api-reference/emails/retrieve-received-email) |
| Cabeçalhos completos | Objeto `headers` existe, mas a lista de cabeçalhos incluídos não é informada | Idem |
| MIME bruto | `raw.download_url` (URL assinada, com expiração) | Idem |
| `message_id`, `received_for`, metadados de anexos | Disponíveis | Idem |
| Recebimento em domínio próprio, qualquer endereço | Sim: com o MX configurado, recebe “for any address at that domain”. Recomenda subdomínio | [Custom domains](https://resend.com/docs/dashboard/receiving/custom-domains) |
| Subendereçamento `r+token@` | Não declarado explicitamente (o recebimento é catch-all) | — |
| Tamanho máximo de entrada | Não informado | — |
| Envio com cabeçalhos customizados | Campo `headers` suportado. `Message-ID`, `In-Reply-To` e `References` não confirmados | [Send email](https://resend.com/docs/api-reference/emails/send-email) |
| Idempotency-Key no envio | Suportada, com validade de 24 h | Idem |
| Webhooks: retentativas | Backoff até cerca de 42 h (8 tentativas). O endpoint é desativado automaticamente após falhas contínuas | [Retries and replays](https://resend.com/docs/webhooks/retries-and-replays) |
| Eventos | `email.received`, `email.delivered`, `email.bounced`, `email.complained`, `email.failed`, `email.delivery_delayed` e outros | [Event types](https://resend.com/docs/webhooks/event-types) |

**Implicação para a arquitetura:** como o endpoint pode ser desativado após falhas, um **job de reconciliação** deve listar periodicamente os e-mails recebidos pela API e processar os que não chegaram por webhook (ADR-007).

### 4.2 Teste prático — execução parcial (11 e 12/11/2026, UTC)

Conta gratuita, domínio de recebimento gerenciado pelo Resend, chave em `poc/resend-check/.env` (no `.gitignore`), custo US$ 0.

**Evidências:**

- `poc/resend-check/resultado-resend-2026-11-11-envio.json` (envio).
- `poc/resend-check/resultado-resend-2026-11-12-recebimento.json` (recebimento, executado sem `TEST_TO` para não reenviar).

| Teste | Resultado |
| --- | --- |
| R1a — API de listagem de recebidos | **OK** (HTTP 200) |
| R1b — objeto `authentication` | **OK:** `spf=pass`, `dkim=pass`, `dmarc=pass` (remetente Gmail). Atende RN-15c |
| R1c — cabeçalhos retornados | **OK:** 18 chaves, incluindo `received`, `arc-seal`, `arc-authentication-results`, `dkim-signature`, `message-id`, `from`, `to`, `date`, `subject` |
| R1d — `Authentication-Results` entre os cabeçalhos | **Não retornado** (informativo). A fonte prevista é o objeto `authentication`; `arc-authentication-results` está disponível |
| R1e — `message_id` e `received_for` | **OK** |
| R1f — MIME bruto para download | **OK:** URL assinada com validade de cerca de 1 h (`expires_at`) |
| R1h — metadados de anexos | **OK** (estrutura presente; mensagem sem anexos) |
| R1g — recebimento em endereço com token (`r+token@`) | **OK (12/11/2026):** recebido. `to` e `received_for` = `r+tokenteste@<id>.resend.app`, com o `+` e o token preservados. SPF/DKIM/DMARC `pass`. Evidência: `resultado-resend-2026-11-12-subenderecamento.json` |
| R2a — envio com `Message-ID`/`In-Reply-To`/`References` customizados | **OK:** aceito (HTTP 200) |
| R2a' — `Message-ID` preservado na entrega | **NÃO (12/11/2026):** no original da mensagem entregue (Gmail, "Mostrar original"), o `Message-ID` termina em `@email.amazonses.com`. O valor customizado `<poc-…@poc.invalid>` foi substituído pela infraestrutura de envio. A API aceita o cabeçalho, mas não o preserva. Conferência manual do responsável |
| R2b — `Idempotency-Key` | **OK:** a repetição devolveu o mesmo id, sem novo envio |

**Achado sobre o R1g:** as primeiras tentativas falharam porque foram enviadas para um subdomínio digitado errado (`elexiamoru` em vez de `lexiamoru`), não por causa do token. No subdomínio correto, o subendereçamento com `+` funciona no domínio gerenciado do plano gratuito, e o token chega íntegro em `to` e `received_for` (ADR-007 confirmada). A variante `r-token@` não foi reenviada ao subdomínio correto: é desnecessária, porque o formato com `+` está validado.

**Impacto na ADR-007 (avaliação; nenhuma mudança aplicada):**

| Item da ADR-007 | Impacto |
| --- | --- |
| 2. Reply-To `r+{token}@` como vínculo principal (RN-15a) | **Nenhum.** Validado no R1g; passa a ser o **único** vínculo de correlação |
| Correspondência secundária por `In-Reply-To`/`References` com o `Message-ID` emitido (`outbound_emails.rfc_message_id`) | **Não funciona como desenhado:** as respostas dos clientes vão citar o `Message-ID` atribuído pelo provedor, não o nosso |
| 4. Deduplicação por `Message-ID` de **entrada** (RN-18) | **Nenhum.** Usa o `Message-ID` da mensagem recebida (R1e), não o emitido |
| Envio idempotente e eventos de status | **Nenhum** (R2b) |

**Ajuste mínimo (aprovado pelo responsável em 12/11/2026 e registrado na ADR-007 e no DATA_MODEL; implementação no I-4):**

1. **Correlação somente pelo token `r+{token}@`**, combinado com organização, remetente e `authentication` (RN-15, sem mudança de regra). Retirar da ADR-007 a correspondência secundária por `In-Reply-To`/`References`.
2. **Sem token válido** (cliente respondeu para outro endereço ou removeu o Reply-To), aplicar o fluxo já previsto: novo chamado ou quarentena (RN-15/RN-17). Não criar heurística nova.
3. **`rfc_message_id`** fica como identificador interno e de auditoria. Não deve ser usado para associar respostas. Não exige migration.
4. **Envio:** continuar enviando `Message-ID` próprio é inofensivo, mas inútil. A remoção é opcional e pode ser feita no I-4.
5. **Não verificado** (só se a correspondência secundária vier a ser exigida): se o evento de entrega ou a API do Resend informam o `Message-ID` efetivo atribuído pelo provedor, que poderia ser guardado para correspondência. Também não foi verificado se `In-Reply-To`/`References` customizados são preservados; isso afeta só o agrupamento visual no cliente de e-mail, não a correlação.

**Implicações já comprovadas:**

1. O veredito de SPF/DKIM/DMARC vem pronto da API (RN-15c).
2. O MIME bruto expira em cerca de 1 h. Se precisar ser guardado, deve ser baixado durante o processamento do webhook ou job.

### 4.2.1 Roteiro do teste prático

O script `poc/resend-check/check-resend.mjs` verifica na prática:

- O objeto `authentication`.
- As chaves de cabeçalho retornadas.
- O MIME bruto.
- O recebimento em `r+token@`.
- O envio com `Message-ID`/`In-Reply-To`/`References` customizados.
- A deduplicação por `Idempotency-Key`.

Grava `resultado-resend-AAAA-MM-DD.json`. O custo é zero no plano gratuito (100 e-mails/dia).

## 5. Como concluir as partes pendentes

Nenhuma credencial deve ser colada no chat. Use projetos e chaves exclusivos para teste.

1. **Neon:** criar um projeto gratuito exclusivo para a PoC (região `aws-sa-east-1`) e preencher `poc/rls-neon/.env`, que está no `.gitignore`. Depois executar `npx prisma generate && npx tsx poc-neon.ts` em `poc/rls-neon`.
2. **Gemini:** em um terminal, definir `GEMINI_API_KEY` só na sessão. Depois executar `node benchmark.mjs` em `poc/gemini-benchmark`.
3. **Resend:**
   - Preencher `RESEND_API_KEY` e `TEST_TO` em `poc/resend-check/.env` (já criado, no `.gitignore`; o script o carrega).
   - Enviar do e-mail pessoal uma mensagem de teste para `r+tokenteste@<seu-id>.resend.app`.
   - Executar `node check-resend.mjs` em `poc/resend-check`.

Alternativa: executar com o prefixo `!` nesta sessão, depois de definir as variáveis no próprio terminal, para que eu analise os resultados.

## 6. Observação de segurança registrada

O comando `prisma init` (Prisma 7.10.1) criou automaticamente, sem solicitação, pastas de “skills” de agentes de IA (`.claude/`, `.agents/`, `.windsurf/` e `skills-lock.json`) dentro da pasta da PoC. Elas foram removidas.

**Recomendação para a implementação:** não usar `prisma init` no repositório da aplicação, ou revisar e remover esses artefatos antes de qualquer commit. Também convém incluir uma verificação no CI que bloqueie pastas de configuração de agentes não aprovadas.
