# ADR-013 — Planos de infraestrutura e gatilhos de contratação

**Status:** Proposta. **Nenhuma contratação está aprovada.** O responsável reconhece a possível necessidade de Vercel Pro, Neon Launch e Resend Pro antes do uso comercial, mas exige gatilhos objetivos e aprovação caso a caso.

## Problema

Definir quando cada plano pago se torna necessário, priorizando o menor custo compatível com segurança e confiabilidade (RST-04).

## Situação atual

| Serviço | Plano atual | Base |
| --- | --- | --- |
| Vercel | Hobby | Não comercial: desenvolvimento, PoCs, MVP Core |
| Neon | Free | Projeto não produtivo e PoC |
| Resend | Free | Desenvolvimento e PoC |
| Gemini | Projeto de teste (dados sintéticos) | Teto de US$ 5 no projeto |
| Vercel Blob | Hobby (store privado, dados sintéticos) | Sem cobrança: acesso bloqueado ao exceder 1 GB (ADR-008 rev. 2) |

## Gatilhos

Detalhes em INFRASTRUCTURE_COSTS.md, seção 5. Contrata-se quando **qualquer** gatilho for atingido **e** houver aprovação expressa.

| Plano | Gatilho técnico | Gatilho comercial | Gatilho financeiro | Custo estimado |
| --- | --- | --- | --- | --- |
| Vercel Pro | Cron por minuto em ambiente compartilhado (varredor, SLA); logs com mais de 1 h; mais de 1 regra de WAF | Acesso de organização externa / Gate de dados reais | Uso acima dos limites do Hobby | US$ 20/mês (com US$ 20 de crédito) |
| Neon Launch (produção) | Restauração ≥ 24 h (RNF-17); computação contínua | Dados reais (Gate) | CU-h acima de 100/mês | ≈ US$ 20 a 42/mês |
| Resend Pro | Mais de 100/dia ou 3.000/mês (enviados + recebidos); mais de 3 domínios | Envio a clientes reais (Gate) | — | US$ 20 a 35/mês, mais excedente |
| Antimalware pago (S3 + GuardDuty ou outro) | Somente se o risco residual da CDR não for aceito no Gate (DP-12) | — | — | Ver ADR-008, opções para decisão posterior. **Não aprovado** |
| Sentry Team | Mais de 1 usuário ou mais de 5 mil erros/mês | — | — | US$ 29/mês |

## Controles na contratação

| Serviço | Controle |
| --- | --- |
| Vercel Pro | Spend Management (orçamento sob demanda, alertas em 50%, 75% e 100%, pausa de produção avaliada) |
| Gemini | Teto do projeto, alertas de orçamento e tetos da aplicação |
| Vercel Blob | Uso contabilizado no crédito do Pro; alertas do Spend Management |
| Geral | Revisão trimestral de preços; este documento datado |

## Riscos

| Risco | Mitigação |
| --- | --- |
| Interpretação do uso “comercial” no Hobby durante o desenvolvimento | Contratar o Pro, no máximo, antes de qualquer acesso externo. Consultar os termos se houver dúvida |
| Contratação tardia que atrase o Gate | Lista de gatilhos acompanhada em cada incremento |
