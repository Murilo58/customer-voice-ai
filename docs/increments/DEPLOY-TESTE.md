# Deploy de teste não comercial

| Item | Valor |
| --- | --- |
| Autorização | Responsável, 11/11/2026 (não comercial) |
| URL | https://customer-voice-ai-two.vercel.app |
| Conta | Vercel Hobby (gratuito), equipe pessoal; projeto `customer-voice-ai`, região `gru1` |
| Banco | `cva_dev` do projeto Neon existente (somente dados sintéticos; nenhum projeto Neon criado ou alterado) |
| Custo | US$ 0 |

## Configuração

| Variável | Valor no deploy |
| --- | --- |
| `DATABASE_URL` / `DATABASE_DRIVER` | `cva_dev` pelo pooler, papel `app_runtime` / `neon` |
| `BETTER_AUTH_SECRET`, `CRON_SECRET`, `N7_TOKEN` | Novos, gerados só para o deploy; cópia local em `.env.deploy.local` (fora do Git) |
| `BETTER_AUTH_URL` | URL de produção acima |
| `EMAIL_PROVIDER` | `console` (nenhum e-mail sai; o conteúdo vai para o log da função) |
| `AI_PROVIDER` | `simulated` |
| `TURNSTILE_*` | Chaves de teste da Cloudflare (sempre aprovam) |
| `STORAGE_PROVIDER` | `vercel-blob`: store privado `cva-test-anexos` em `gru1`, `BLOB_READ_WRITE_TOKEN` criado pela Vercel |
| `INBOUND_EMAIL_DOMAIN` | `lexiamoru.resend.app` |
| `RESEND_WEBHOOK_SECRET`, `RESEND_API_KEY` | Tipo sensível (não legíveis no painel). Segredo de assinatura inserido pelo responsável em `.env.deploy.local`; chave da PoC 3 (consulta do e-mail recebido). Envio de e-mails continua `console` |

`vercel.json`: build com `prisma generate && next build`; cron diário (limite do Hobby). `.vercelignore` impede o envio de `.env*`, PoCs e artefatos locais pela CLI. O repositório GitHub foi conectado ao projeto pela CLI: cada push em `main` gera deploy de produção.

## Verificações (12/11/2026)

| Verificação | Resultado |
| --- | --- |
| Rotas públicas (`/entrar`, portal `/p/{slug}`, `/api/auth/ok`) | 200; slug inexistente 404; área interna sem sessão redireciona |
| Rotas internas sem segredo (`/api/internal/jobs`, `/api/internal/n7`, webhook) | 404 (falha fechada) |
| Varredor da outbox com `CRON_SECRET` | 9 jobs pendentes processados, todos com sucesso |
| **N7** (3 × 200 iterações, org sintética) | Sobrecarga p95 **14,5 / 13,3 / 13,4 ms** (meta 15 ms): **atendido**. Consulta simples p95 ≈ 5 ms; com contexto ≈ 18–20 ms |
| Assinatura do webhook (Svix) | Sem assinatura, chave errada, timestamp de 10 min e corpo adulterado: 401. Assinatura válida: 200 |
| **E-mail de entrada ponta a ponta** (Gmail → `demo-mwbfailf@lexiamoru.resend.app`) | Evento assinado recebido; job `inbound.process` com sucesso na 1ª tentativa; SPF/DKIM/DMARC `pass`; chamado #3 criado (canal e-mail), em < 1 s |
| **Resposta pelo token** (Gmail → `r+{token}@lexiamoru.resend.app`) | Classificada como `associated` no chamado #3; mensagem do cliente (`source=email`, contato vinculado, remetente verificado); nenhum chamado novo. Correlação só pelo token (ADR-007) confirmada |
| Cabeçalhos | HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` |

## Pendências

1. **Margem do N7 é pequena** (≈ 1 ms no pior caso): cada consulta adicional dentro de `withTenant` custa uma ida e volta (~5 ms). Evitar transações com várias consultas sequenciais em rotas críticas.
2. **Frequência do varredor:** além do cron diário do Hobby, o workflow `.github/workflows/jobs-sweeper.yml` (autorizado em 12/11/2026) chama o varredor a cada 30 min (≈ 1.440 min/mês da cota gratuita de 2.000; alertas de SLA com atraso de até 30 min). Usa o segredo `CRON_SECRET` e a variável `DEPLOY_URL` do repositório; sem o segredo, a execução é ignorada com aviso.
3. **Webhook do Resend:** configurado e validado em 12/11/2026. Não testados no deploy: anexos recebidos por e-mail (estrutura do Resend com anexo real), quarentena por token inválido e e-mail de saída real (Resend continua só em `console`).
4. **Upload direto ao Blob:** até ser implementado, o corpo da requisição é limitado a 4,5 MB pela Vercel (anexos somados).
5. **Fluxos com login** não foram exercitados no deploy (senhas do seed exibidas uma única vez). Teste manual sugerido: login, chamado com anexo pequeno (Blob), portal com link mágico (link no log da função, provedor `console`).
6. **CSP** global não configurada (somente `sandbox` nos downloads de anexos); avaliar antes da homologação.
7. Hobby é para uso não comercial; qualquer uso comercial exige plano pago (fora do escopo).
