# ADR-001 — Estilo arquitetural: monólito modular

**Status:** Aprovada (aprovação do responsável em 09/11/2026)

## Problema

Definir o estilo arquitetural para um SaaS multi-tenant desenvolvido por uma pessoa, com custos controlados e evolução incremental (RST-06, RST-07).

## Alternativas avaliadas

1. Monólito modular em Next.js (App Router, runtime Node.js) em um único deploy na Vercel.
2. Microsserviços (serviços separados para triagem, e-mail e atendimento).
3. Frontend Next.js mais um backend separado (API dedicada).

## Critérios

Simplicidade operacional, isolamento multi-tenant, custo, testabilidade, capacidade de um desenvolvedor e evolução.

## Comparação

| Critério | Monólito modular | Microsserviços | Front + API separados |
| --- | --- | --- | --- |
| Operação | 1 deploy | N deploys e contratos | 2 deploys |
| Isolamento | 1 ponto de controle (`withTenant`) | Repetido em cada serviço | 1 ponto, com mais superfície |
| Custo | Menor | Maior | Médio |
| Evolução | Módulos extraíveis | Nativa | Média |

## Recomendação

Monólito modular, com 14 módulos de domínio e camadas interface → aplicação → domínio → infraestrutura (ARCHITECTURE.md, seção 3). Handlers de fila e cron ficam no mesmo deploy.

## Justificativa

Menor complexidade compatível com os requisitos. As fronteiras de módulo, verificadas por lint, permitem extrair serviços no futuro, se houver necessidade demonstrável.

## Impactos

Regras de dependência entre módulos e lint de importações. Todos os processos compartilham limites das funções Vercel (duração, memória).

## Custos

Nenhum custo adicional além da hospedagem (ADR-013).

## Riscos

Acoplamento gradual entre módulos. Mitigação: regras de importação no lint e revisão de PR.
