# Registros de Decisão Arquitetural (ADRs)

Status possíveis: **Aprovada**, **Aprovada com condições**, **Proposta** e **Pendente de validação**. Nenhuma recomendação técnica é registrada como aprovada sem aprovação expressa do responsável pelo produto.

| ADR | Decisão | Status | Condição ou próximo passo |
| --- | --- | --- | --- |
| [001](ADR-001-monolito-modular.md) | Monólito modular | Aprovada | — |
| [002](ADR-002-isolamento-multi-tenant.md) | `organization_id` + RLS + FKs compostas | Aprovada com condições | PoC no Neon aprovada com ressalvas: isolamento aprovado; N7 atendido na Vercel (12/11/2026); homologação integrada pendente |
| [003](ADR-003-orm-prisma.md) | Prisma 7.x fixado | Pendente de validação | Adaptador validado na PoC no Neon; N7 atendido; pendentes Better Auth e testes de pool |
| [004](ADR-004-identidade.md) | Separação de domínios de identidade | Aprovada | — |
| [004](ADR-004-identidade.md) | Better Auth | Pendente de validação | Versão, segurança e testes no I-0 |
| [005](ADR-005-gemini.md) | Gemini Developer API | Aprovada com condições | Dados sintéticos até DP-01; controles de gasto |
| [005](ADR-005-gemini.md) | Modelo de triagem | Pendente de validação | Teste comparativo (PoC 2) |
| [006](ADR-006-processamento-assincrono.md) | Outbox + Vercel Queues | Aprovada com condições | Provisória; consolidar na homologação |
| [007](ADR-007-email.md) | Resend | Aprovada com condições | Provisória; teste prático (PoC 3) |
| [008](ADR-008-anexos-antimalware.md) | Vercel Blob privado + CDR + quarentena (custo zero). S3 + GuardDuty **não aprovado** | **Aprovada com condições** (revisão 2) | C1 a C8. Não homologada para anexos reais; DP-12 pendente; nenhuma aceitação de risco autorizada |
| [009](ADR-009-rate-limiting.md) | Rate limiting e anti-bot | Proposta | Revisão detalhada |
| [010](ADR-010-observabilidade.md) | Observabilidade | Proposta | Revisão detalhada |
| [011](ADR-011-ambientes-deploy.md) | Ambientes e deploy | Proposta | Revisão detalhada |
| [012](ADR-012-sla.md) | SLA | Proposta | Revisão detalhada |
| [013](ADR-013-planos-infraestrutura.md) | Planos e gatilhos de contratação | Proposta | Aprovação caso a caso |
