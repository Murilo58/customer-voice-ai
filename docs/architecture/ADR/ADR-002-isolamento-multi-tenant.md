# ADR-002 — Isolamento multi-tenant: `organization_id` + RLS + FKs compostas

**Status:** Aprovada com condições.

**Condição:** aprovação da PoC no Neon (testes N0 a N7 de `poc/rls-neon`). Se a PoC falhar, a contingência (Alternativa A reforçada) volta para aprovação.

**Situação da condição — PoC no Neon aprovada com ressalvas pelo responsável em 10/11/2026** (POC_RESULTS, seção 2):

| Aspecto | Situação |
| --- | --- |
| Isolamento (N0–N6) | **Aprovado nos cenários testados:** 0 vazamentos em 14.000 transações concorrentes pelo pooler; sem contexto residual; escrita cruzada recusada |
| Desempenho (N7) | **Pendente.** Meta de 15 ms não considerada atendida (80–99 ms medidos a partir de rede doméstica, não representativa). Medição obrigatória no I-0, antes da homologação do componente de persistência |
| Homologação integrada | **Pendente:** depende dos testes integrados da aplicação |
| 19 erros na execução 1 | Causa não confirmada; exige testes de concorrência e dimensionamento do pool na implementação |
| Custo | US$ 0 |

## Problema

O isolamento entre organizações é o requisito de segurança mais crítico (PRD seção 13; RSG-01 a 03). É preciso garantir que nenhuma consulta, inclusive com bug, exponha dados de outro tenant, considerando Neon (PgBouncer em modo transação), Prisma 7 e funções serverless.

## Alternativas avaliadas

- **A:** `organization_id` filtrado apenas pela aplicação.
- **B:** `organization_id` + Row-Level Security no PostgreSQL, com contexto local à transação.
- **(descartadas)** Schema por tenant e banco por tenant: complexidade operacional e de migrations desproporcional para PMEs e para um desenvolvedor.

## Critérios

Proteção contra filtro esquecido e IDOR, compatibilidade com o pooler e o ORM, desempenho, complexidade e testabilidade.

## Comparação

| Critério | A | B |
| --- | --- | --- |
| Filtro esquecido | Depende de disciplina | Bloqueado pelo banco (PoC T3) |
| Consulta crua com bug | Sem proteção | Bloqueada |
| Pooler do Neon | Compatível | Compatível com contexto local à transação (PoC T6, T8; Neon N2–N5 aprovados) |
| Prisma 7 | Compatível | Exige transação interativa por unidade de trabalho (Neon N1 aprovado) |
| Sobrecarga | Nenhuma | Uma transação e um `set_config` (local: 0,96 ms em processo; Neon: N7 pendente, sem medição representativa) |

## Recomendação (desenho)

1. **Papéis:**
   - `app_migrator`: dono do schema, conexão direta, só no CI.
   - `app_runtime`: conexão pooled, sem `BYPASSRLS`.
   - `app_system`: políticas explícitas, restrito a módulos de sistema.
2. **RLS:** `ENABLE` + `FORCE ROW LEVEL SECURITY` em todas as tabelas de tenant. Políticas `USING` e `WITH CHECK` com `organization_id = app_current_org()`.
3. **`app_current_org()`** = `NULLIF(current_setting('app.org_id', true), '')::uuid`. O `NULLIF` é exigido pelo achado T6b.
4. **`withTenant(orgId, fn)`**: transação interativa que executa `set_config('app.org_id', orgId, true)` antes de qualquer consulta. É a única forma de acesso a dados de tenant.
5. **Proibições** verificadas por lint e testes: `set_config` de sessão (`false`), porque vaza contexto (PoC T9); cliente Prisma cru fora da infraestrutura; `$queryRawUnsafe`.
6. **FKs compostas** `(organization_id, id)` em todas as referências entre tabelas de tenant (PoC T5).
7. **Origem do `organization_id`:** sempre a sessão validada no servidor.
8. **Suíte de isolamento** (RSG-03) bloqueante no CI.

## Justificativa

Defesa em profundidade com falha fechada. A PoC local confirmou o desenho SQL (13/13). A PoC no Neon confirmou o isolamento com o pooler real e o adaptador do Prisma 7 nos cenários testados. Permanecem pendentes o desempenho (N7) e a homologação integrada.

## Impactos

- Toda operação de tenant ocorre em transação.
- Jobs entre organizações usam `app_system` e alternam para `withTenant` ao processar cada tenant.
- Identidade (Better Auth) fica em tabelas de plataforma. **Pré-contexto (implementado no I-0):** como `FORCE ROW LEVEL SECURITY` também filtra funções `SECURITY DEFINER`, as consultas "de quais organizações sou membro" e "convite pelo token" usam variáveis locais à transação (`app.user_id`, `app.invitation_token_hash`) e políticas **somente de leitura**. Nenhum papel recebe `BYPASSRLS`.
- **Papéis de banco não são removidos e recriados com o mesmo nome** em ambientes com pooler (achado da PoC no Neon). Rotação de credencial troca a senha ou cria papel novo.
- **Remoção de papéis no Neon usa `REVOKE` + `DROP ROLE`**: o dono do banco não pode usar `DROP OWNED BY` em outro papel.

## Custos

Nenhum custo de serviço. Esforço de implementação moderado.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Comportamento do pooler diferente do PostgreSQL local | Mitigado nos cenários testados (N2–N5; 14.000 transações). Suíte de isolamento no CI |
| Adaptador do Prisma sem suporte adequado a transações interativas | Mitigado nos cenários testados (N1). Contingência: Drizzle (ADR-003) ou Alternativa A reforçada |
| Erros sob concorrência de causa não confirmada (19 de 2.000 na execução 1) | Testes adicionais de concorrência e dimensionamento do pool na implementação; monitorar erros de transação |
| Prisma 8 remove `$transaction` | Fixar 7.x; `withTenant` isola a API |
| Sobrecarga de latência | Critério N7 ≤ 15 ms no p95, **pendente**: medição obrigatória no I-0 em ambiente equivalente ao de produção |

## Contingência (Alternativa A reforçada)

Repositórios com `orgId` obrigatório, extensão de consulta que injeta e verifica `organization_id`, FKs compostas, suíte de isolamento e lint. Exige nova aprovação.
