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
| PoC 1 — RLS: parte Neon (pooler + Prisma 7) | **Aprovada com ressalvas (10/11/2026).** Isolamento: aprovado nos cenários testados. Desempenho N7: pendente. Homologação integrada: pendente | N7 obrigatório no I-0, antes da homologação do componente de persistência |
| PoC 2 — Teste comparativo Gemini | **Pronta, não executada** | Requer `GEMINI_API_KEY` no ambiente |
| PoC 3 — Recursos do Resend | **Verificação documental concluída; teste prático pronto, não executado** | Requer `RESEND_API_KEY` e uma mensagem de teste |

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
| N7 | Sobrecarga p95 com contexto × consulta simples | ≤ 15 ms | **Não atingido a partir da máquina local:** 80–99 ms |
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
| Desempenho N7 | **Pendente.** A meta de 15 ms **não** é considerada atendida. A hipótese de latência de rede é plausível, mas não comprovada em ambiente equivalente ao de produção |
| Homologação integrada | **Pendente.** A homologação definitiva depende dos testes integrados da aplicação |
| 19 erros da execução 1 | **Ocorrência de causa não confirmada.** Não atribuída ao pool do Prisma sem evidência |
| Custo | US$ 0 |

**Ressalvas que viram obrigação:**

1. **Medição do N7 é atividade obrigatória do I-0**, antes da homologação do componente de persistência, em ambiente equivalente ao de produção.
2. **A implementação deve incluir testes adicionais de concorrência e de dimensionamento do pool.**
3. **Projeto Neon `cva-poc-rls` mantido temporariamente**, com o `.env` preservado, para testes complementares. Condições: isolado, sem dados reais, sem recursos pagos nem cobranças adicionais.

## 3. PoC 2 — Teste comparativo Gemini (pronto)

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

### 4.2 Teste prático (pronto)

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
   - Definir `RESEND_API_KEY` e `TEST_TO`.
   - Enviar do e-mail pessoal uma mensagem de teste para `r+tokenteste@<seu-id>.resend.app`.
   - Executar `node check-resend.mjs` em `poc/resend-check`.

Alternativa: executar com o prefixo `!` nesta sessão, depois de definir as variáveis no próprio terminal, para que eu analise os resultados.

## 6. Observação de segurança registrada

O comando `prisma init` (Prisma 7.10.1) criou automaticamente, sem solicitação, pastas de “skills” de agentes de IA (`.claude/`, `.agents/`, `.windsurf/` e `skills-lock.json`) dentro da pasta da PoC. Elas foram removidas.

**Recomendação para a implementação:** não usar `prisma init` no repositório da aplicação, ou revisar e remover esses artefatos antes de qualquer commit. Também convém incluir uma verificação no CI que bloqueie pastas de configuração de agentes não aprovadas.
