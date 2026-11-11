# ADR-009 — Rate limiting e anti-bot

**Status:** Proposta (recomendação condicional, sujeita a revisão detalhada).

## Problema

Proteger portal, login, links mágicos, webhooks e e-mail de entrada contra abuso (RSG-11, RN-16), com baixo custo.

## Alternativas avaliadas

Vercel WAF Rate Limiting, contadores no PostgreSQL, Upstash Redis, Cloudflare Turnstile e Vercel BotID.

## Mecanismos e parâmetros propostos

| Camada | Mecanismo | Parâmetro | Limitação |
| --- | --- | --- | --- |
| Borda (por IP) | Vercel WAF Rate Limiting (janela fixa) | `/portal/*/submit`: 20/10 min; `/api/webhooks/*`: 600/min | Hobby: 1 regra; Pro: 40 regras. Janela de 10 s a 10 min |
| Aplicação (por identidade) | Tabela `rate_limit_counters` (janela fixa, upsert atômico) | Link mágico: 3/15 min por e-mail e 10/h por IP; login: 10/15 min por IP + e-mail; portal: 10/h por e-mail; API: 300/min por usuário | Uma escrita no banco por verificação. Migrar para Redis se a carga exigir |
| E-mail de entrada | Regra RN-16 no worker | 10 mensagens/h por remetente e organização → quarentena | — |
| Anti-bot | Cloudflare Turnstile no formulário público e na solicitação de link mágico | Validação no servidor | Novo script de terceiro (ajustar a CSP) |
| Biblioteca de autenticação | Rate limiting nativo do Better Auth nos endpoints de autenticação | Padrões da biblioteca, revisados | — |

## Custos

- WAF: Hobby com 1M de requisições permitidas incluídas; Pro a US$ 0,50 por 1M.
- PostgreSQL: incluído.
- Turnstile: gratuito (até 20 widgets, desafios ilimitados).
- Upstash, se necessário: 500 mil comandos/mês grátis.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Usuários atrás do mesmo IP (empresas) | Limites por identidade além do IP |
| Contadores no banco sob ataque volumétrico | O WAF absorve primeiro |
| Turnstile indisponível | Falha fechada no formulário público, com mensagem ao usuário |
