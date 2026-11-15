# VoxDesk AI

SaaS B2B multi-tenant de atendimento com IA. Referências: `docs/PRD-Customer-Voice-AI.md` (v0.3) e `docs/architecture/`.

**Estado:** incrementos I-0 a I-5 (atendimento interno, portal do cliente, e-mail de entrada com quarentena, anexos com sanitização, CSAT, SLA, alertas, dashboard e backoffice; IA simulada). E-mail pelo provedor `console` por padrão (`resend` disponível); anexos em pasta local no desenvolvimento (`vercel-blob` disponível). Somente dados sintéticos fora da produção. Variáveis do I-4 em `.env.example`; acessibilidade do portal: `npm run a11y:portal -- <slug>`.

## Stack (versões fixadas)

Next.js 16.4.3 · React 19.3.1 · TypeScript 6.0.3 · Prisma 7.10.1 (`@prisma/adapter-neon` / `@prisma/adapter-pg`) · Better Auth 1.7.14 · Vitest 4.1.12 · Node ≥ 22.12.

`.npmrc` usa `save-exact` e `legacy-peer-deps` (contorno de falha do npm 10 com as dependências opcionais do Better Auth).

## Configuração local

1. `npm ci`
2. Copie `.env.example` para `.env` e preencha. Use um projeto Neon **não produtivo**, com bancos separados para desenvolvimento e testes (o nome do banco de testes deve terminar em `_test`).
3. Banco:
   ```
   npx prisma generate
   npm run db:migrate                     # conexão do dono do schema (DATABASE_URL_MIGRATOR)
   npm run db:bootstrap                   # LOGIN e senha do papel app_runtime
   DATABASE_URL_MIGRATOR=<url de teste> npx prisma migrate deploy && npm run db:bootstrap -- --test
   npm run db:seed                        # dados sintéticos; exibe as senhas uma única vez
   ```
4. `npm run dev` e acesse http://localhost:3000.

Nunca use `prisma init` neste repositório (instala artefatos de agentes; POC_RESULTS, seção 6).

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run lint` | Typecheck + verificação estática de segurança (`scripts/check-security.mjs`) |
| `npm run test:unit` | Testes unitários |
| `npm run test:integration` | Integração e suíte de isolamento contra o banco de testes (bloqueante no CI) |
| `npm run build` | Build de produção (não exige banco nem segredos) |
| `npm run jobs:work` | Worker local da outbox (triagem, e-mails, fechamento automático, verificações de SLA); em produção, `after()` + varredor `/api/internal/jobs` |
| `npm run perf:dashboard` | Mede o p95 do dashboard com 50 mil chamados sintéticos (CA-14.3); só em banco não produtivo, remove os dados ao final |

## Regras de segurança verificadas automaticamente

- Acesso a dados de tenant só por `withTenant` (`src/server/db/tenant.ts`), com `set_config(..., true)`. Contexto de sessão é proibido.
- `PrismaClient` só em `src/server/db/client.ts`; `$queryRawUnsafe`/`$executeRawUnsafe` proibidos.
- O runtime conecta como `app_runtime`, sem `BYPASSRLS`; RLS com `FORCE` em todas as tabelas de tenant.
- `audit_logs` é somente inserção (privilégios + trigger).
- Cadastro só por convite; as rotas HTTP do Better Auth expostas são apenas `/api/auth/get-session` e `/api/auth/ok`.

## Triagem por IA

`AI_PROVIDER=simulated` (padrão) classifica por palavras-chave, sem rede e sem custo. O cliente Gemini será ligado após a PoC 2. Até a DP-01, somente dados sintéticos (RIA-17).

## E-mail

E-mails transacionais (resposta pública, aviso de resolução, recuperação de senha) passam pela outbox (`outbound_emails` + job `email.send`). Provedor `console` (registra a mensagem no log do servidor). O Resend será integrado após a PoC 3.
