# ADR-004 — Identidade: domínios separados; Better Auth para a equipe

**Status:**

- Separação entre a autenticação da equipe e o acesso do cliente final: **Aprovada** (“Mantenha a separação”).
- Better Auth para equipe e Superadmin: **Pendente de validação** (recomendação preliminar, sujeita à confirmação de compatibilidade, segurança e manutenção).

**Evidência do I-0 (10/11/2026):** Better Auth **1.7.14** (publicada em 26/10/2026; inclui as correções de todos os avisos do GitHub Advisory publicados até 10/11/2026) com `@better-auth/prisma-adapter` 1.7.14 e Prisma 7.10.1 aprovado em testes automatizados: IDs UUIDv7, hash de senha, 2FA TOTP, revogação de todas as sessões (CA-02.3) e cadastro público bloqueado. **Decisão de implementação:** o plugin de organização não é usado; organizações, vínculos e convites são tabelas próprias com RLS (DATA_MODEL 3.1). Ver `docs/increments/I-0.md`. **Risco:** a biblioteca teve avisos de segurança frequentes em 2026 (vários críticos em plugins de OAuth e link mágico, que não usamos); acompanhar releases e manter a versão atualizada.

## Problema

Autenticar três públicos com requisitos distintos (RSG-05, RSG-06, RF-ORG-03, RF-POR-03):

1. Equipe das organizações, com convites, perfis, várias organizações por usuário e MFA disponível.
2. Superadmin, com MFA obrigatório.
3. Cliente final, sem senha.

## Alternativas avaliadas

1. Clerk (gerenciado).
2. Better Auth (biblioteca MIT, auto-hospedada).
3. Implementação própria completa (descartada pelo risco de segurança).

## Critérios

Segurança, compatibilidade com Next.js, multi-tenancy, sessões, MFA, convites, recuperação de acesso, permissões, custos, limites e complexidade operacional.

## Comparação (verificada em 09/11/2026)

| Critério | Clerk | Better Auth |
| --- | --- | --- |
| MFA | Indisponível no Hobby; **Pro US$ 25/mês** | Plugin 2FA (TOTP, códigos de backup), sem custo |
| Organizações | 100 MROs grátis; **até 20 membros por organização** sem add-on de US$ 100/mês | Plugin com convites, papéis, controle de acesso e organização ativa na sessão |
| Papéis customizados | Add-on de US$ 100/mês | Incluído |
| Sessões | Revogação de dispositivos | Listar e revogar; atenção ao `cookieCache` |
| Dados | No fornecedor, residência não informada | No próprio Neon |
| Responsabilidade de segurança | Fornecedor | Nossa (atualizações e configuração) |
| Versão | n/a | Pendente de verificação |

## Recomendação

| Domínio | Mecanismo |
| --- | --- |
| Equipe | Better Auth: e-mail e senha, 2FA, plugin de organização, adaptador Prisma 7. `cookieCache` desativado ou `maxAge` curto, para revogação imediata (CA-02.2) |
| Superadmin | Better Auth + tabela `platform_admins` + MFA obrigatório + rotas `/admin` |
| Cliente final | Módulo próprio: link mágico (15 min, uso único, hash SHA-256) e token de acompanhamento revogável; `portal_sessions` com cookie `Path=/portal`. Contatos não são usuários |

## Justificativa

- O PRD exige MFA, o que no Clerk exige o Pro.
- O limite de 20 membros por organização do Clerk gratuito é restritivo.
- Dados de identidade no mesmo banco simplificam LGPD e auditoria.
- Custo zero, alinhado à RST-04.

## Impactos

- Tabelas do Better Auth são de plataforma (sem RLS de tenant). O módulo `identity` é o único com acesso.
- Envio de e-mails de convite e recuperação pelo Resend.
- Rate limiting de login complementado pela ADR-009.

## Custos

US$ 0. A alternativa Clerk custaria US$ 25/mês ou mais, com add-ons de US$ 100/mês para mais de 20 membros ou papéis customizados.

## Riscos e condições de validação

| Item a validar | Como |
| --- | --- |
| Versão estável e histórico de avisos de segurança do Better Auth | Consulta ao GitHub e npm antes do I-0 |
| Adaptador com Prisma 7.10.x | Teste no I-0 |
| Revogação imediata de sessão | CA-02.2, CA-02.3 |
| Organização ativa versus `withTenant` | A organização ativa da sessão é validada contra `memberships` em cada requisição |
| Manutenção da biblioteca | Fixar versão; acompanhar releases |

## Contingência

Clerk Pro, com custo a aprovar.
