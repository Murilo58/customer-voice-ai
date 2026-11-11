# ADR-011 — Ambientes, dados por ambiente e deploy

**Status:** Proposta (recomendação condicional, sujeita a revisão detalhada).

## Problema

Atender RNF-16 (Development, Preview e Production segregados; não produção só com dados sintéticos) e RNF-17 (backup e recuperação), com CI/CD, migrations e rollback seguros.

## Mecanismos e parâmetros propostos

| Ambiente | Aplicação | Banco | Credenciais | Dados |
| --- | --- | --- | --- | --- |
| Development | Local (`next dev`) | Projeto Neon **não produtivo**, branch `dev` | Conjunto “dev” (Gemini de teste, Resend de teste, store Blob dev) | Sintéticos |
| Preview | Deploy por PR na Vercel | Mesmo projeto não produtivo: um branch por PR, criado a partir do branch `seed` sintético e removido ao fechar o PR | Conjunto “preview” (igual ao dev ou separado) | Sintéticos |
| Production | Branch `main` | **Projeto Neon separado** (`aws-sa-east-1`) | Conjunto “prod” | Reais, só após o Gate |

**Regra crítica:** nunca criar branches a partir do banco de produção, porque copiariam dados reais. Por isso a separação em projetos.

### CI/CD (GitHub Actions + integração Git da Vercel)

1. **Em cada PR:**
   - Instalação com lockfile.
   - Lint (incluindo as regras de segurança da ADR-002).
   - Typecheck e testes unitários (Vitest).
   - Testes de integração contra um branch Neon efêmero.
   - **Suíte de isolamento** (bloqueante).
   - `npm audit` e secret scanning.
   - Build.
   - Deploy de Preview e E2E (Playwright) contra o Preview.
2. **Merge em `main`:**
   - Job de migration com `prisma migrate deploy` pela conexão **direta**, com o papel `app_migrator`, antes da promoção.
   - Snapshot manual do Neon antes de migrations destrutivas.
3. **Migrations:** padrão expand/contract. Colunas novas são opcionais primeiro, com backfill por job, e a remoção só ocorre em deploy posterior. Sem `prisma migrate dev` em produção.
4. **Rollback:**
   - Aplicação: Instant Rollback da Vercel.
   - Schema: compatível com a versão anterior (expand/contract).
   - Dados: instant restore do Neon (até 7 dias no Launch) para um branch, conferência e restauração.
5. **Golden set da IA:** execução manual ou noturna, com resultado registrado (AI_ARCHITECTURE.md, seção 7).

### Variáveis de ambiente

Por ambiente na Vercel, marcadas como sensíveis. `.env` local fora do Git. Nenhum segredo com prefixo `NEXT_PUBLIC_`.

## Limitações

| Limitação | Efeito |
| --- | --- |
| GitHub Free: US$ 12/mês de computação (≈ 2.000 min de Linux 2 núcleos) | Suficiente para um desenvolvedor com pipeline enxuto. E2E por PR pode exigir otimização |
| Neon Free: 10 branches por projeto | Limitar os Previews simultâneos |
| Hobby da Vercel | Uso não comercial (ADR-013) |

## Custos

US$ 0 no cenário A. A produção segue a ADR-013.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Migration incompatível | Expand/contract, snapshot e teste em Preview |
| Credenciais produtivas usadas fora da produção | Conjuntos separados; escopo de ambiente na Vercel |
