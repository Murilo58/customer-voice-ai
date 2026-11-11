# ADR-006 — Processamento assíncrono: outbox PostgreSQL + Vercel Queues

**Status:** Aprovada com condições (provisória). As confirmações pedidas pelo responsável estão nas seções abaixo, e a escolha será consolidada após a homologação da arquitetura.

## Problema

A triagem e outras tarefas (e-mail, anexos, exportação, anonimização) precisam de execução durável, com retentativas e idempotência. Funções serverless não oferecem durabilidade por si só.

## Alternativas avaliadas

Vercel Queues, Upstash QStash, Inngest, Trigger.dev, pg-boss (fila no PostgreSQL) e Vercel Workflow.

## Critérios

Persistência, retentativas, idempotência, recuperação de falhas, concorrência, limites de execução, escalabilidade, complexidade e custo.

## Confirmações (verificadas em 09/11/2026)

| Item | Vercel Queues |
| --- | --- |
| Disponibilidade | “available in Beta on all plans”; 19 regiões |
| SDK | `@vercel/queue`; consumidor push via trigger no `vercel.json` (`handleCallback`); modo poll disponível |
| Garantia de entrega | At-least-once (“consumers should be idempotent”) |
| Durabilidade | Gravação síncrona em 3 zonas de disponibilidade antes de confirmar a publicação |
| Retentativas | `retryAfterSeconds` (padrão 60), `maxDeliveries`, `maxConcurrency`, backoff forçado após 32 tentativas |
| Idempotência | Chave de até 256 caracteres, deduplicação durante a retenção (cobrança em dobro) |
| Retenção | 60 s a 7 dias (padrão 24 h). **Expirada, a mensagem é excluída mesmo sem processamento** |
| DLQ | **Não há DLQ nativa** |
| Ordem | Aproximada, sem FIFO |
| Limites | Mensagem de até 100 MB; visibilidade de até 60 min; atraso de até 7 dias |
| Custo | Hobby: 1M operações incluídas. Pro: a partir de US$ 0,60 por 1M (blocos de 4 KiB) |
| SLA | Não informado |

## Comparação

| Alternativa | Durável | Custo inicial | Complexidade | Observação |
| --- | --- | --- | --- | --- |
| Vercel Queues | Sim | US$ 0 a 0,15/mês | Baixa | Beta; sem DLQ |
| QStash | Sim, com DLQ | Grátis até 1.000/dia; US$ 1 por 100 mil | Baixa | Cada retentativa é cobrada |
| Inngest | Sim | Grátis até 50 mil execuções e depois pausa; Pro US$ 99 | Média | A pausa é inaceitável para a triagem |
| Trigger.dev | Sim | US$ 5 em créditos grátis; Hobby US$ 10 | Média | Novo fornecedor |
| pg-boss | Sim | US$ 0 | Média | Exige worker persistente; `LISTEN/NOTIFY` indisponível no pooler |
| Vercel Workflow | Sim | 50 mil eventos grátis; US$ 20 por 1M | Média | Mais amplo que o necessário |

## Recomendação

1. **Outbox (`jobs`)** como fonte de verdade, gravada na mesma transação do evento de negócio.
2. Publicação no Vercel Queues com `idempotency key = job.id`, logo após o commit.
3. **Consumidor idempotente:** verifica `jobs.status` e a chave de negócio (ex.: `triage_runs.idempotency_key`).
4. **`maxDeliveries` por tipo** (proposta: 5). Ao esgotar, o consumidor confirma a mensagem e marca o job como `failed`. A outbox funciona como DLQ própria, com tela para o Superadmin.
5. **Varredor** (cron) republica jobs `pending` antigos e `running` com `locked_until` vencido. Isso cobre falha na publicação e expiração do TTL.
6. **TTL de 7 dias** nas mensagens críticas.
7. **Concorrência:** `maxConcurrency` por tipo, para respeitar os limites da Gemini.

## Comportamento diante de falhas

| Falha | Resultado |
| --- | --- |
| Erro após o commit, antes de publicar | Job `pending`; o varredor publica |
| Fila indisponível | Idem |
| Worker cai no meio | Reentrega após a visibilidade; idempotência evita duplicação |
| Mensagem expira | O job continua na outbox; o varredor republica |
| Erro permanente | `failed` após `maxDeliveries`; alerta |
| Entrega duplicada | Ignorada pela idempotência |

## Compatibilidade com o PRD

RF-TRI-01 (assíncrono), RNF-03 (triagem em até 60 s em 95% dos casos, a medir), RNF-06 (resiliência), RIA-06 (idempotência).

## Impactos

O cron por minuto do varredor exige o Pro em ambiente compartilhado (ADR-013). No Hobby, o varredor é acionado manualmente.

## Custos

Cenário B: ≈ US$ 0,04/mês. Cenário C: ≈ US$ 0,15/mês, dentro do crédito do Pro.

## Riscos e contingência

| Risco | Contingência |
| --- | --- |
| Mudança ou descontinuação do beta | Trocar o publicador por QStash. A outbox e os consumidores HTTP continuam |
| Ausência de SLA | A outbox garante que nada se perca |
