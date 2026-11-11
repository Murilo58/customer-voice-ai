# ADR-003 — ORM: Prisma 7.x fixado com `@prisma/adapter-neon`

**Status:** Pendente de validação. Aceito pelo responsável como recomendação preliminar, sujeito à confirmação de compatibilidade, segurança e manutenção, a partir da PoC N0 a N7.

**Evidência da PoC no Neon (aprovada com ressalvas pelo responsável em 10/11/2026):** Prisma 7.10.1 + `@prisma/adapter-neon` 7.10.1 executaram transações interativas com `set_config` local pelo pooler sem vazamento nos cenários testados (N1, N3–N6). Continuam pendentes: compatibilidade com o Better Auth (DP-03), desempenho N7, testes de concorrência e dimensionamento do pool, e homologação integrada.

## Problema

Escolher o ORM compatível com Neon (pooler em modo transação), RLS com contexto por transação, Better Auth e o ambiente serverless.

## Alternativas avaliadas

1. Prisma 7.x (estável; 7.10.1 em 09/11/2026) com `@prisma/adapter-neon` (GA desde a 6.16).
2. Prisma 8 (pré-lançamento, rc.23).
3. Drizzle ORM.

## Critérios

Estabilidade, transações interativas, compatibilidade com RLS, compatibilidade com Better Auth, tipagem, migrations e manutenção.

## Comparação

| Critério | Prisma 7.x | Prisma 8 (rc) | Drizzle |
| --- | --- | --- | --- |
| Estabilidade | Estável | Pré-lançamento | Estável (versão não verificada nesta fase) |
| Transações interativas | `$transaction(async tx => …)` | Sem `$transaction`; `db.transaction` sem opções | Sim |
| Adaptador Better Auth | Suportado | **Não suportado** (“not supported by the adapter yet”) | Suportado (não verificado nesta fase) |
| RLS no guia do Neon | Exemplo do Prisma “not intended … production” | — | Citado no guia de RLS do Neon |
| Stack de referência | Sim | Sim | Não |

## Recomendação

Prisma **7.x com versão exata fixada** (sem atualização automática de major), adaptador Neon, `prisma.config.ts`, conexão pooled no runtime e direta para migrations.

## Justificativa

Faz parte da stack de referência, é compatível com o Better Auth e oferece transações interativas. O risco do Prisma 8 é contido pela fixação de versão e pela camada `withTenant`.

## Impactos

- Migrations geradas pelo Prisma, com SQL manual para RLS, papéis, funções e triggers.
- A tag `latest` do npm aponta para o Prisma 8. A instalação deve usar a versão explícita.

## Custos

Nenhum.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Limitação do adaptador em transações interativas | Mitigado nos cenários testados (PoC N1/N3). Concorrência e pool: testes adicionais na implementação |
| Fim de suporte do 7.x | Avaliar o Prisma 8 quando estável e quando o Better Auth o suportar |
| `prisma init` instala artefatos de agentes de IA | Não usar `prisma init` no repositório (POC_RESULTS, seção 6) |

## Contingência

Drizzle ORM, com nova avaliação e aprovação.
