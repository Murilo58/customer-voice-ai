# ADR-010 — Observabilidade

**Status:** Proposta (recomendação condicional, sujeita a revisão detalhada).

## Problema

Atender RNF-12 e RNF-13 (logs estruturados, erros, filas, métricas de IA e custos por organização) com baixo custo. A restrição relevante é que os logs de runtime da Vercel duram **1 hora no Hobby e 1 dia no Pro** ([logs](https://vercel.com/docs/logs/runtime)).

## Mecanismos e parâmetros propostos

| Necessidade | Mecanismo | Parâmetro | Limitação |
| --- | --- | --- | --- |
| Logs estruturados | JSON com `requestId`, `orgId`, `jobId`, `module`, `event`, `level`; sem conteúdo nem PII (RSG-08) | Nível `info` em produção | Retenção curta na Vercel |
| Persistência operacional | Tabela `operational_events` para eventos relevantes (falhas de integração, quarentena, teto atingido, jobs `failed`) | Retenção de 30 dias (DP-17) | Volume controlado: só eventos significativos |
| Erros | Sentry Developer (SDK Next.js), com scrubbing de PII e sem enviar corpo de requisições | 5 mil erros/mês, 30 dias | 1 usuário; uso comercial no plano gratuito pendente |
| Métricas de fila | Consultas em `jobs` (pendentes, falhos, idade do mais antigo, tempo de processamento) | Painel do Superadmin | — |
| IA | `ai_usage_events`: chamadas, tokens (incluindo raciocínio), latência, erros, falhas de schema, custo por organização | Painel do Superadmin e do Administrador (RF-DSH-05) | — |
| Integrações | `email_events`, `inbound_messages.classification`, status de anexos | Painel | — |
| Alertas | Cron a cada 5 min (Pro) verifica limiares e envia e-mail ao Superadmin | Job mais antigo pendente > 10 min; taxa de falha da IA > 20% em 15 min; teto de IA ≥ 80%; bounces > 5%/dia; webhook sem eventos por 24 h com tráfego esperado | Depende do cron do Pro; no Hobby, verificação manual |
| Disponibilidade | Monitor de uptime do Sentry (1 monitor grátis) em `/api/health` | — | — |

## Custos

US$ 0 nos cenários A e B. No cenário C, US$ 0 a 29 (Sentry Team). O Observability Plus da Vercel (30 dias de logs) não é recomendado agora; o preço não foi consultado.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Investigação de incidente com logs de apenas 1 dia | `operational_events`, auditoria e Sentry. Avaliar log drain se necessário (custo a orçar) |
| PII no Sentry | `beforeSend` com scrubbing, sem dados de formulário, revisão |
