# Customer Voice AI — Custos de Infraestrutura

| Item | Valor |
| --- | --- |
| Versão | 1.0 — Candidata à homologação |
| Data de consulta dos preços | **09/11/2026** (páginas oficiais citadas) |
| Moeda | US$, sem impostos nem câmbio |
| Status | **Estimativas.** Nenhum serviço pago recorrente está contratado ou autorizado (ADR-013) |

Valores marcados como **pendente** não puderam ser confirmados em fonte oficial. Valores marcados como **(resumo)** vieram de leitura parcial da página e devem ser reconfirmados antes de qualquer contratação.

## 1. Premissas

| Premissa | A — Desenvolvimento | B — Beta fechado | C — Operação inicial |
| --- | --- | --- | --- |
| Organizações | 0 reais (2 sintéticas) | 5 | 20 |
| Chamados/mês | ≈ 300 sintéticos | 5.000 | 20.000 |
| Triagens/mês (+10% de novas tentativas) | ≈ 330 | 5.500 | 22.000 |
| Tokens por triagem | 2.000 de entrada e 250 de saída (PRD 12.4), sem raciocínio | Idem | Idem |
| E-mails de saída por chamado | — | 4,5 | 4,5 |
| E-mails recebidos por chamado | — | 2 | 2 |
| Anexos | Somente sintéticos | 20% dos chamados × 1,5 arquivo × 1 MB | Idem |
| Downloads por anexo | — | 2 | 2 |
| Operações de fila por chamado | ≈ 12 (em blocos de 4 KiB) | ≈ 12 | ≈ 12 |

## 2. Preços de referência (verificados)

| Serviço | Item | Preço | Fonte |
| --- | --- | --- | --- |
| Vercel | Hobby | US$ 0, **apenas uso não comercial** | [fair use](https://vercel.com/docs/limits/fair-use-guidelines) |
| Vercel | Pro | US$ 20/mês por assento de deploy, com US$ 20 de crédito mensal | [pro-plan](https://vercel.com/docs/plans/pro-plan) |
| Vercel | Queues (beta) | Hobby: 1M operações incluídas. Pro: a partir de US$ 0,60 por 1M | [queues/pricing](https://vercel.com/docs/queues/pricing) |
| Vercel | Blob | US$ 0,023/GB-mês; US$ 0,40/1M simples; US$ 5/1M avançadas. Hobby: 1 GB | [blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing) |
| Vercel | WAF Rate Limiting | Hobby: 1 regra, 1M incluído. Pro: US$ 0,50 por 1M permitidas | [rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting) |
| Neon | Free | US$ 0; 100 CU-h/projeto; 1 GB/projeto; restauração de 6 h | [pricing](https://neon.com/pricing) |
| Neon | Launch | US$ 0,106/CU-h; US$ 0,35/GB-mês; histórico a US$ 0,20/GB-mês; restauração de até 7 dias; sem mínimo | Idem |
| Gemini | `gemini-3.1-flash-lite` | US$ 0,25 / 1,50 por 1M tokens | [pricing](https://aistudio.google.com/docs/pricing) |
| Gemini | `gemini-3.5-flash-lite` | US$ 0,30 / 2,50 por 1M tokens | Idem |
| Resend | Free | 3.000/mês, 100/dia, recebimento incluído | [pricing](https://resend.com/pricing) |
| Resend | Pro | US$ 20 (50 mil), US$ 35 (100 mil); excedente de US$ 0,90/mil | Idem |
| Amazon SES (alternativa) | Envio | US$ 0,10/mil (à la carte); plano Essentials US$ 0,16/mil para novas contas desde 21/07/2026 | [ses pricing](https://aws.amazon.com/ses/pricing/) |
| Amazon SES (alternativa) | Recebimento | US$ 0,10/mil + US$ 0,09 por mil blocos de 256 KB | Idem |
| AWS GuardDuty (referência; **não aprovado**) | Malware Protection for S3 | US$ 0,09/GB verificado e US$ 0,215 por mil objetos (US East) | [guardduty pricing](https://aws.amazon.com/guardduty/pricing/) |
| Cloudflare R2 (referência) | Armazenamento | US$ 0,015/GB-mês; 10 GB gratuitos; saída gratuita | [r2 pricing](https://developers.cloudflare.com/r2/pricing/) |
| Sentry | Developer | US$ 0, 1 usuário, 5 mil erros/mês | [pricing](https://sentry.io/pricing/) |
| Sentry | Team | US$ 29/mês | Idem |
| Cloudflare Turnstile | Free | US$ 0, desafios ilimitados, até 20 widgets | [turnstile plans](https://developers.cloudflare.com/turnstile/plans/) |
| GitHub Actions | Free | US$ 12/mês de computação incluída (≈ 2.000 min de Linux 2 núcleos a US$ 0,006/min) | [github billing](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions) |
| Clerk (não recomendado) | Pro | US$ 25/mês (MFA indisponível no Hobby) | [clerk pricing](https://clerk.com/pricing) |
| Domínio | Registro anual | **Pendente** (registrador a escolher) | — |

## 3. Cenários

### Cenário A — Desenvolvimento (um desenvolvedor, dados fictícios)

| Serviço | Plano | Fixo/mês | Variável/mês | Limite gratuito relevante |
| --- | --- | --- | --- | --- |
| Vercel | Hobby | US$ 0 | US$ 0 | Uso não comercial; cron diário; logs de 1 h; 4 CPU-h; Blob de 1 GB |
| Neon (não produção) | Free | US$ 0 | US$ 0 | 100 CU-h/projeto; scale-to-zero obrigatório |
| Gemini | Projeto de teste | US$ 0 | < US$ 0,50 (330 triagens × ≈ US$ 0,001) | Teto do projeto: US$ 5 |
| Resend | Free | US$ 0 | US$ 0 | 100 e-mails/dia |
| Fila | Vercel Queues no Hobby | US$ 0 | US$ 0 | 1M operações |
| Vercel Blob (store privado) | Hobby | US$ 0 | US$ 0 (ao exceder, o acesso é bloqueado, sem cobrança) | 1 GB, 10 mil operações simples, 2 mil avançadas, 10 GB de transferência |
| Sentry | Developer | US$ 0 | US$ 0 | 1 usuário |
| GitHub Actions | Free | US$ 0 | US$ 0 enquanto dentro de US$ 12 | ≈ 2.000 min |
| **Total** | | **US$ 0** | **≈ US$ 0 a 1** | Mais o domínio (anual, pendente), necessário a partir do I-3 |

### Cenário B — Beta fechado (5 organizações, 5.000 chamados/mês)

| Serviço | Plano | Fixo/mês | Variável/mês | Base do cálculo |
| --- | --- | --- | --- | --- |
| Vercel | Pro (gatilho comercial) | US$ 20 | US$ 0 (dentro do crédito de US$ 20) | Funções, Queues (≈ 60 mil operações ≈ US$ 0,04) e WAF são cobertos pelo crédito |
| Neon (produção) | Launch | US$ 0 | ≈ US$ 21 | ≈ 180 CU-h × 0,106 = 19,1; ~2 GB × 0,35 = 0,7; histórico ~5 GB × 0,20 = 1,0 |
| Neon (não produção) | Free | US$ 0 | US$ 0 | — |
| Gemini | Pago, com teto de US$ 15 | US$ 0 | ≈ US$ 4,8 a 6,7 | 5.500 triagens (seção 5.2 de AI_ARCHITECTURE) |
| Resend | Pro 50 mil | US$ 20 | US$ 0 | 22,5 mil enviados + 10 mil recebidos = 32,5 mil |
| Vercel Blob (anexos) | Uso no crédito do Pro | US$ 0 | ≈ US$ 0,03 a 0,41 (1,5 a 18 GB), dentro do crédito | Seção 4 |
| Sentry | Developer | US$ 0 | US$ 0 | Uso comercial no plano gratuito pendente de confirmação |
| Turnstile | Free | US$ 0 | US$ 0 | — |
| **Total** | | **US$ 40** | **≈ US$ 26 a 28** | **≈ US$ 66 a 68/mês** |

### Cenário C — Operação comercial inicial (20 organizações, 20.000 chamados/mês)

| Serviço | Plano | Fixo/mês | Variável/mês | Base do cálculo |
| --- | --- | --- | --- | --- |
| Vercel | Pro | US$ 20 | US$ 0 a 20 | Uso pode passar do crédito; Queues ≈ 240 mil operações ≈ US$ 0,15 |
| Neon | Launch | US$ 0 | ≈ US$ 42 | ≈ 360 CU-h × 0,106 = 38,2; ~5 GB × 0,35 = 1,75; histórico ≈ 2 |
| Gemini | Pago, com teto de US$ 45 | US$ 0 | ≈ US$ 19 a 27 | 22.000 triagens |
| Resend | Pro 100 mil + excedente | US$ 35 | ≈ US$ 27 | 90 mil + 40 mil = 130 mil; 30 mil × 0,90/mil |
| Vercel Blob (anexos) | Uso no crédito do Pro | US$ 0 | ≈ US$ 0,14 a 1,66 (6 a 72 GB) | Seção 4 |
| Sentry | Developer ou Team | US$ 0 a 29 | — | Team se houver mais de 1 usuário ou mais de 5 mil erros |
| WAF | Pro | — | < US$ 1 | — |
| **Total** | | **US$ 55 a 84** | **≈ US$ 90 a 118** | **≈ US$ 145 a 200/mês** |

**Alternativa de e-mail no cenário C:** com Amazon SES, o custo seria ≈ US$ 22/mês (envio: 90 mil × 0,16/mil = 14,4; recebimento: 40 mil × 0,10/mil = 4 + blocos ≈ 3,6), contra ≈ US$ 62 no Resend. Em troca, a configuração e a operação na AWS seriam maiores. Reavaliar acima de ≈ 150 mil e-mails/mês.

## 4. Anexos e antimalware: alternativas com custo adicional zero

A configuração **S3 + GuardDuty (paga) não foi aprovada** pelo responsável em 09/11/2026. A revisão 2 da ADR-008, **aprovada com condições**, adota **Vercel Blob privado + CDR + quarentena**, com custo adicional zero no desenvolvimento. Não está homologada para anexos reais (DP-12 pendente; nenhuma aceitação de risco autorizada).

### 4.1 Quantidades mensais (mesmas premissas)

| Item | Cenário B | Cenário C |
| --- | --- | --- |
| Novos arquivos | 1.500 | 6.000 |
| Volume novo | 1,5 GB | 6 GB |
| Armazenamento acumulado após 12 meses | ≈ 18 GB | ≈ 72 GB |
| Downloads | ≈ 3.000 | ≈ 12.000 |

### 4.2 Custo do Vercel Blob (preços verificados)

| Componente | Cenário B | Cenário C | Observação |
| --- | --- | --- | --- |
| Armazenamento (US$ 0,023/GB-mês) | US$ 0,03 (mês 1) a 0,41 (mês 12) | US$ 0,14 a 1,66 | Original excluído após a sanitização (não duplica) |
| Uploads e cópias (avançadas, US$ 5/1M) | ≈ US$ 0,02 | ≈ US$ 0,06 | Original + sanitizado |
| Leituras (simples, US$ 0,40/1M) | ≈ US$ 0,002 | ≈ US$ 0,01 | — |
| Transferência | Incluída no CDN do Pro (1 TB) | Idem | Uploads diretos sem cobrança de transferência |
| CDR (processamento) | Funções dentro do crédito | Idem | Bibliotecas livres |
| **Total** | **≈ US$ 0,05 a 0,43** | **≈ US$ 0,21 a 1,73** | **Dentro do crédito de US$ 20 do Pro**, que já é condição de uso comercial |

No **Hobby** (desenvolvimento e Marco A), o custo é zero e **não há cobrança automática**: “You will not pay for any additional usage … you will not be able to access Vercel Blob if limits are exceeded”.

### 4.3 Alternativas avaliadas

| Alternativa | Custo | Risco de cobrança automática | Situação |
| --- | --- | --- | --- |
| **Vercel Blob privado + CDR** | US$ 0 adicional | Não no Hobby; no Pro, dentro do crédito e com Spend Management | **Aprovada com condições** (ADR-008, C1 a C8) |
| Neon (`bytea`) | US$ 0 no Free (1 GB compartilhado) | Não no Free | Inviável para volume (banco e backups maiores; uploads de até 4,5 MB) |
| Cloudflare R2 | US$ 0 até 10 GB | **Sim** (assinatura e cobrança mensal do excedente) | Descartada |
| S3 + GuardDuty | ≈ US$ 0,2 a 1,8 + S3 | Sim | **Não aprovada** |
| ClamAV próprio | Servidor de 3 a 4 GiB (pendente) | Depende do provedor | Para decisão posterior |
| VirusTotal (gratuito) | US$ 0 | — | Descartado: compartilha arquivos de clientes |

### 4.4 Limitação e custo da segurança completa

A CDR **não detecta malware por assinatura**. Para o beta com dados reais, a RSG-19 exige uma de duas opções. A escolha é **decisão posterior do responsável (DP-12), no Gate**:

| Opção | Custo | Efeito |
| --- | --- | --- |
| A. Aceitação formal e temporária do risco residual (lista restrita + CDR + quarentena + download forçado), com prazo de revisão | US$ 0 | Atende à RSG-19 como exceção temporária documentada |
| B. Adicionar scanner (S3 + GuardDuty, ClamAV ou API comercial) pela interface `MalwareScanner` | ≈ US$ 0,2 a 2/mês (GuardDuty) ou servidor (pendente) | Detecção por assinatura; permite ampliar a lista de tipos |

## 5. Gatilhos de contratação

Cada plano só é contratado quando **qualquer** gatilho for atingido **e** houver aprovação expressa do responsável pelo produto (RST-04). O objetivo é o menor custo compatível com segurança e confiabilidade.

### Vercel Pro (US$ 20/mês)

| Tipo | Gatilho |
| --- | --- |
| Comercial | Primeiro acesso de organização externa (Gate de dados reais), ou qualquer uso que caracterize finalidade comercial pelos termos (“Hobby teams are restricted to non-commercial personal use only”) |
| Técnico | Necessidade de cron por minuto em ambiente compartilhado (varredor da outbox e SLA, I-5); logs de runtime de mais de 1 hora para diagnosticar; mais de 1 regra de WAF; Blob acima de 1 GB |
| Financeiro | Uso acima dos limites do Hobby (4 CPU-h, 1M invocações) |
| Controle após contratar | Spend Management com orçamento sob demanda de US$ 10 acima do crédito, alertas em 50%, 75% e 100%, e pausa de produção avaliada |

### Neon Launch (pago por uso; ≈ US$ 20 a 42/mês)

| Tipo | Gatilho |
| --- | --- |
| Comercial | Dados reais (Gate). O plano Free não declara permissão de uso comercial |
| Técnico | Restauração mínima de 24 h para atender ao RPO (o Free oferece 6 h e 1 GB de alterações); necessidade de desativar o scale-to-zero (latência); computação acima de 100 CU-h |
| Financeiro | Crescimento previsível de CU-h. Revisar a migração para o Scale se precisar de mais de 7 dias de restauração |
| Observação | O projeto não produtivo continua no Free |

### Resend Pro (US$ 20/mês, ou US$ 35 para 100 mil)

| Tipo | Gatilho |
| --- | --- |
| Técnico | Volume acima de 100 e-mails/dia ou 3.000/mês (enviados + recebidos); mais de 3 domínios; mais de 1 endpoint de webhook |
| Comercial | Envio a clientes reais (Gate). Uso comercial no plano gratuito não declarado |
| Financeiro | Acima de ≈ 150 mil/mês, reavaliar o Amazon SES |

### Antimalware pago (somente se não houver aceitação de risco)

| Tipo | Gatilho |
| --- | --- |
| Segurança | No Gate, o responsável não aceitar o risco residual da CDR (DP-12), ou for necessário ampliar a lista de tipos (DOCX, XLSX, ODT) |
| Situação | **Não aprovado.** Exige proposta de custo e aprovação expressa |

### Sentry Team (US$ 29/mês)

Mais de um usuário com acesso, mais de 5 mil erros/mês ou necessidade de retenção maior.

## 6. Riscos financeiros

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Tokens de raciocínio da Gemini | Custo de IA de 1,5 a 3 vezes maior (estimativa) | Teste comparativo mede; preferir modelo com raciocínio mínimo; teto do projeto |
| Troca para modelo Flash por qualidade | Até 5,6 vezes o custo do Flash-Lite (preço de 2027) | Só com aprovação; tetos |
| Mudança de preços (ex.: 3.6/3.8 Flash dobram em 01/01/2027) | Variável | Modelo como configuração; revisão trimestral |
| Excedente da Vercel sem teto padrão | Cobrança sob demanda | Spend Management configurado no dia da contratação |
| Volume de e-mail acima do previsto | Linear em US$ 0,90/mil | Alertas; avaliar SES |
| Camadas gratuitas alteradas | Custo inesperado | Revisão trimestral dos preços; este documento datado |
| Crescimento do armazenamento de anexos (Vercel Blob) | Linear (US$ 0,023/GB-mês) | Retenção (DP-11); limites de tamanho |
| Teto do provedor com latência (≈ 10 min no AI Studio) | Pequeno excedente | Tetos da aplicação como primeira barreira |
