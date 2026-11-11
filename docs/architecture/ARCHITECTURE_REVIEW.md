# Customer Voice AI — Revisão da Arquitetura para Homologação

| Item | Valor |
| --- | --- |
| Data | 09/11/2026 |
| Fase | 3B — Documentação arquitetural |
| Status | **Candidata à homologação.** A implementação do MVP Core não está autorizada |

## 1. Resumo executivo

A arquitetura proposta é um **monólito modular em Next.js na Vercel**, com **PostgreSQL no Neon (São Paulo)** e isolamento multi-tenant em quatro camadas: sessão → `withTenant` → RLS → FKs compostas. A IA usa a **Gemini Developer API** em um pipeline determinístico com saída estruturada.

O processamento assíncrono usa **outbox no PostgreSQL com Vercel Queues**. O e-mail usa **Resend**. Os anexos usam **Vercel Blob privado com CDR (sanitização) e quarentena**, com custo adicional zero. A revisão 2 da ADR-008 foi **aprovada com condições**, depois da rejeição de S3 + GuardDuty, e **não está homologada para anexos reais de clientes**.

A PoC local de RLS aprovou o desenho SQL em 13 de 13 testes e trouxe dois achados incorporados à arquitetura:

1. É obrigatório usar `NULLIF` na leitura do contexto.
2. É proibido usar `set_config` de sessão.

A PoC de RLS no Neon foi **aprovada com ressalvas** em 10/11/2026: isolamento aprovado nos cenários testados (0 vazamentos em 14.000 transações); desempenho N7 e homologação integrada pendentes; custo US$ 0. As PoCs da Gemini e do Resend estão prontas e serão conduzidas uma por vez, com aprovação entre elas.

**Custo estimado:**

| Cenário | Custo mensal |
| --- | --- |
| A — Desenvolvimento | ≈ US$ 0 a 1 |
| B — Beta fechado | ≈ US$ 66 a 68 |
| C — Operação inicial | ≈ US$ 145 a 200 |

Nenhum serviço foi contratado. As contratações seguem gatilhos objetivos e aprovação caso a caso (ADR-013).

## 2. Entregáveis

| Documento | Conteúdo |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Visão, componentes, fluxos (Mermaid), isolamento, infraestrutura, incrementos |
| [DATA_MODEL.md](DATA_MODEL.md) | Modelo conceitual (ER) e lógico, chaves, índices, restrições, multi-tenant, retenção |
| [SECURITY.md](SECURITY.md) | Modelo de ameaças, controles, autorização, segurança de IA, backup, incidentes, pendências jurídicas |
| [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md) | Integração Gemini, fluxo de triagem, prompt e schema, consumo, **controles de gasto em 9 camadas**, qualidade, falhas |
| [INFRASTRUCTURE_COSTS.md](INFRASTRUCTURE_COSTS.md) | Preços datados, cenários A, B e C, alternativas de anexos com custo zero (seção 4), **gatilhos de contratação**, riscos |
| [ADR/](ADR/README.md) | 13 ADRs com status |
| [poc/POC_RESULTS.md](poc/POC_RESULTS.md) | Resultados e evidências das PoCs |
| [ARCHITECTURE_EVALUATION_3A.md](ARCHITECTURE_EVALUATION_3A.md) | Avaliação 3A (histórico) |

## 3. Situação das decisões

| Status | Decisões |
| --- | --- |
| **Aprovada** | ADR-001 (monólito modular); ADR-004 (separação dos domínios de identidade) |
| **Aprovada com condições** | ADR-002 (RLS: PoC no Neon); ADR-005 (Developer API: sintéticos até DP-01, controles de gasto); ADR-006 (Queues: provisória); ADR-007 (Resend: provisória, teste prático); **ADR-008 rev. 2** (Vercel Blob privado + CDR + quarentena: condições C1 a C8, seção 4.1) |
| **Pendente de validação** | ADR-003 (Prisma 7); ADR-004 (Better Auth); ADR-005 (modelo de triagem) |
| **Não aprovada** | ADR-008 rev. 1 (S3 + GuardDuty pago) |
| **Proposta** | ADR-009 (rate limiting); ADR-010 (observabilidade); ADR-011 (ambientes); ADR-012 (SLA); ADR-013 (planos e gatilhos) |

## 4. Atendimento às condições da aprovação 3A

| Condição do responsável | Onde foi atendida |
| --- | --- |
| PoC de RLS limitada a 3 dias, ambiente isolado | POC_RESULTS, seções 1 e 2. Parte local e parte Neon executadas em 10/11/2026; **aprovada com ressalvas** (N7 e homologação integrada pendentes) |
| Teste comparativo Gemini com dados sintéticos | POC_RESULTS, seção 3. Pronto, com teto de US$ 0,50 |
| Verificação de recursos do Resend | POC_RESULTS, seção 4. Verificação documental concluída; teste prático pronto |
| Limites de consumo e mecanismos contra gastos inesperados da Gemini | AI_ARCHITECTURE, seção 5.3 |
| Confirmar disponibilidade, limites, custos, garantias, falhas e contingências de Queues e Resend | ADR-006 e ADR-007 (seções “Confirmações”) |
| Estimativa discriminada da AWS, adequação do GuardDuty e comparação com opção mais simples | INFRASTRUCTURE_COSTS, seção 4; ADR-008. Depois, S3 + GuardDuty foi **rejeitado**: nova proposta de custo zero na ADR-008 rev. 2 |
| Parâmetros, mecanismos, limitações e custos de D-09 a D-12 | ADR-009 a ADR-012 |
| Gatilhos de contratação de Vercel Pro, Neon Launch e Resend Pro | INFRASTRUCTURE_COSTS, seção 5; ADR-013 |
| Classificar cada decisão sem transformar condicionais em definitivas | Seção 3 e ADR/README |

### 4.1 Restrições vigentes (rastreabilidade)

| ID | Restrição | Origem | Onde está aplicada | Vigência |
| --- | --- | --- | --- | --- |
| R-01 | AWS S3 + GuardDuty pago **não aprovado** | Decisão de 09/11/2026 (D-08) | ADR-008 (histórico); INFRASTRUCTURE_COSTS, seção 4 | Até nova decisão |
| R-02 | Anexos no **Vercel Blob privado**; sem contratação ou ativação de serviços pagos | ADR-008, C1 | ADR-008; ARCHITECTURE, seção 4.3; ADR-013 | Vigente |
| R-03 | Formatos permitidos: PNG, JPEG, WEBP, PDF, TXT, CSV. DOCX, XLSX, ODT e outros **bloqueados** até nova avaliação | ADR-008, C2 | ADR-008, seções 3 e 6; SECURITY, seção 3.8 | Até nova avaliação |
| R-04 | Limite de **4 MB por arquivo** no Marco A (reavaliável) | ADR-008, C3 | ADR-008, seção 6 | Marco A |
| R-05 | Sanitização (CDR) **não substitui antimalware** | ADR-008, C4 | ADR-008; SECURITY (A12, 3.8); ARCHITECTURE, seção 4.3 | Permanente |
| R-06 | Solução de anexos **não homologada para anexos reais de clientes** | ADR-008, C5 | ADR-008; esta revisão | Até a decisão de DP-12 |
| R-07 | **DP-12 pendente:** decisão formal no Gate entre aceitação temporária e documentada do risco residual ou antimalware adequado. **Nenhuma aceitação de risco autorizada agora** | ADR-008, C6 | ADR-008; INFRASTRUCTURE_COSTS, seção 4.4; seção 6 desta revisão | Gate de dados reais |
| R-08 | Custo adicional zero para anexos no desenvolvimento; **sem cobranças automáticas** | ADR-008, C7 | ADR-008 (plano Hobby: bloqueio sem cobrança); ADR-013 | Desenvolvimento |
| R-09 | Parâmetros da RSG-12 do PRD 0.2 (DOCX, XLSX, ODT; 10 MB, como proposta) **substituídos** por R-03 e R-04 | ADR-008, C2 e C3 | **Alinhado no PRD 0.3** (RSG-12, RSG-17 a RSG-19, DA-20) | Concluído |
| R-10 | Dados reais na Gemini só após DP-01 | ADR-005 | AI_ARCHITECTURE; RIA-17 | Até DP-01 |
| R-11 | Nenhum serviço pago recorrente sem aprovação expressa | RST-04; ADR-013 | INFRASTRUCTURE_COSTS, seção 5 | Permanente |
| R-12 | Implementação não autorizada sem aprovação expressa | Fase 3 | Esta revisão | Até a autorização |

## 5. Recomendações

1. **Executar as três PoCs pendentes** antes da homologação final da arquitetura. Custo: US$ 0 com contas gratuitas, ou cerca de US$ 0,06 a 0,12 na Gemini paga.
2. **Homologar a ADR-002 só após o N7 medido no I-0 e os testes integrados da aplicação.** O isolamento já foi aprovado nos cenários testados da PoC.
3. **Selecionar o modelo Gemini** pelo teste comparativo e depois pelo golden set de 200 itens no I-2.
4. **Configurar os controles de gasto da Gemini** (teto do projeto de US$ 5 e alertas de orçamento) antes de qualquer uso de chave paga.
5. **Reavaliar os riscos dos anexos antes do beta comercial** e decidir formalmente a DP-12 (R-07). Até lá, nenhum anexo real de cliente (R-06).
6. **Não usar `prisma init` no repositório** e incluir no CI a verificação de pastas de configuração de agentes não aprovadas.

## 6. Decisões pendentes

| ID | Decisão | Quando |
| --- | --- | --- |
| DP-01 | Termos da Gemini: retenção de logs (prazo não informado), localização “any country”, DPA, transferência internacional | Antes do Gate |
| DP-02 | Modelo de triagem e teto de custo por chamado | Após o teste comparativo / I-2 |
| DP-03 | Better Auth (validação) | Antes do I-0 |
| DP-05 | RLS no Neon (PoC) | **PoC aprovada com ressalvas (10/11/2026).** N7 pendente: obrigatório no I-0, antes da homologação do componente de persistência |
| DP-06 | ORM (Prisma 7 ou contingência) | Antes do I-0 |
| DP-08 | Armazenamento de anexos | **Decidida:** Vercel Blob privado (ADR-008, aprovada com condições) |
| DP-12 | Antimalware: aceitação temporária e documentada do risco residual **ou** solução antimalware adequada | **Antes do Gate de dados reais.** Nenhuma aceitação autorizada agora |
| DP-10 | Planos comerciais (ADR-013) | Por gatilho, antes do Gate |
| DP-11, DP-16, DP-17 | Retenção, questões jurídicas, prazos operacionais | Antes do Gate (DP-17 na Fase 4) |
| DP-14 | Domínio da plataforma | Antes do I-3 |
| DP-18 | Comportamento da exclusão no Vercel Blob (definitiva, versionamento, recuperação; impactos em retenção, anonimização e LGPD) | Antes do I-4 |
| — | Versões do Better Auth e do `@google/genai` (fixar versão com pelo menos 2 semanas) | I-0 / I-2 |

## 7. Principais riscos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| RLS incompatível com o adaptador ou o pooler | Alto → reduzido | Isolamento aprovado na PoC (N0–N6); N7, concorrência e pool a validar no I-0; contingências definidas |
| Vercel Queues em beta, sem DLQ nem SLA | Médio | Outbox como fonte de verdade; QStash como contingência |
| Termos da Gemini sem prazo de retenção | Alto (jurídico) | Dados sintéticos até DP-01; minimização |
| Tokens de raciocínio elevam o custo | Médio | Medição; tetos em camadas |
| Better Auth: segurança sob nossa responsabilidade | Médio | Fixar versão; testes; acompanhar avisos |
| Logs da Vercel com retenção curta | Médio | `operational_events`, Sentry, auditoria |
| Sem detecção de malware por assinatura (CDR não é antivírus) | Alto | Lista restrita (R-03), CDR, quarentena, download forçado; sem anexos reais até a DP-12 (R-06, R-07) |
| Ferramentas instalando artefatos de agentes | Baixo | Revisão e verificação no CI |

## 8. Dependências para iniciar o MVP Core

1. Homologação desta arquitetura.
2. PoC de RLS no Neon aprovada (ADR-002 e ADR-003). **Atendido com ressalvas em 10/11/2026**; N7 segue como obrigação do I-0.
3. Validação do Better Auth (ADR-004).
4. Teste comparativo Gemini executado, com controles de gasto configurados (ADR-005).
5. Repositório GitHub, projeto Neon não produtivo e projeto Vercel Hobby (US$ 0), mediante autorização expressa.

## 9. Questões que exigem aprovação

1. Homologa a arquitetura (ARCHITECTURE, DATA_MODEL, SECURITY, AI_ARCHITECTURE, INFRASTRUCTURE_COSTS) com os status da seção 3?
2. Vai executar ou autorizar a execução das partes pendentes das PoCs, configurando as credenciais de teste localmente (POC_RESULTS, seção 5)?
3. Aprova os tetos de gasto da Gemini propostos: US$ 5 (desenvolvimento), US$ 15 (beta) e US$ 45 (operação inicial)?
4. Aprova os gatilhos de contratação da ADR-013 como critério, mantendo a aprovação caso a caso?
5. Após a homologação, e com as PoCs aprovadas, autoriza o início do planejamento detalhado (Fase 4) e depois do MVP Core?
