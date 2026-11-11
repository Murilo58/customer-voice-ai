# ADR-007 — E-mail de entrada e saída: Resend

**Status:** Aprovada com condições (provisória). Será consolidada após o teste prático da PoC 3 e a homologação da arquitetura.

## Problema

A v1.0 exige e-mail bidirecional (DA-03): notificações, recebimento de manifestações e associação segura de respostas (RN-15 a RN-19, RF-EML-01 a 08).

## Alternativas avaliadas

Resend, Postmark, Amazon SES, Mailgun, Cloudflare Email Service (recebimento) e SendGrid (preços não obtidos).

## Critérios

Envio transacional, recebimento, webhooks, autenticação de domínio, veredito de autenticação no recebimento, identificação de mensagens, idempotência, bounces, segurança, custo e complexidade.

## Confirmações (verificadas em 09/11/2026)

| Item | Resend |
| --- | --- |
| Disponibilidade | Plano Free com recebimento incluído; várias regiões de envio |
| Limites | Free: 3.000/mês e 100/dia, 3 domínios, 1 webhook. Pro: 50 mil (US$ 20) ou 100 mil (US$ 35), 10 domínios, 5 webhooks. **E-mails recebidos contam na cota** |
| Recebimento | Domínio próprio com MX: recebe “for any address at that domain” (catch-all). Recomenda subdomínio |
| Dados do recebimento | Webhook só com metadados; `GET /emails/receiving/{id}` traz corpo, `headers`, `authentication {spf, dkim, dmarc}`, `message_id`, `received_for`, anexos e `raw.download_url` |
| Envio | `headers` customizados, `reply_to`, `Idempotency-Key` (24 h), anexos de até 40 MB |
| Garantia e retentativa | Webhooks assinados (Svix), com retentativas por cerca de 42 h. **O endpoint é desativado após falhas contínuas** |
| Eventos | `email.received`, `delivered`, `bounced`, `complained`, `failed`, `delivery_delayed` e outros |
| Retenção no provedor | 30 dias |
| Não confirmado | Tamanho máximo de entrada; subendereçamento `r+token@` explícito; aceitação de `Message-ID` customizado; uso comercial no plano Free |

## Comparação (resumo)

| Provedor | Recebimento no plano de entrada | Veredito de autenticação | Custo no cenário B | Complexidade |
| --- | --- | --- | --- | --- |
| **Resend** | Free e pagos | Sim (objeto `authentication`) | US$ 20 | Baixa |
| Postmark | A partir de US$ 16,50 (10 mil) | Não verificado | ≈ US$ 46 | Baixa |
| Amazon SES | Pago por uso | Não verificado | ≈ US$ 6 | Alta (S3/SNS, IAM) |
| Mailgun | Free: 1 rota; Basic US$ 15 | Não verificado | ≈ US$ 35 | Média |
| Cloudflare Email Service | Recebimento grátis ilimitado; envio exige Workers Paid | Sim (`Authentication-Results`, DMARC validado) | Envio: preço do Workers Paid pendente | Média (Worker, DNS no Cloudflare) |

## Recomendação

Resend para envio e recebimento, num subdomínio dedicado (ex.: `in.<domínio>`), com o seguinte desenho:

1. **Endereço de entrada por organização:** `{slug}@in.<domínio>`.
2. **Reply-To por chamado:** `r+{token}@in.<domínio>`, com token de 128 bits em hash ligado a chamado e organização (RN-15a). Se o subendereçamento não funcionar, a alternativa é `r-{token}@in.<domínio>`, que o catch-all aceita.
3. **Webhook `email.received`:** verificar a assinatura, gravar `inbound_messages` (único por `provider_email_id`), criar o job e responder 200.
4. **Worker:** obter a mensagem pela API, deduplicar por `Message-ID` (RN-18) e classificar: automática (RN-16), nova, associada (RN-15: token + organização + remetente + `authentication` sem falha) ou quarentena (RN-17). Depois sanitizar (RN-19) e transferir anexos para verificação (ADR-008).
5. **Reconciliação** periódica pela API de listagem, para cobrir webhooks perdidos ou endpoint desativado.
6. **Envio** com `Idempotency-Key = outbound_emails.id`, conteúdo só com a mensagem nova e o link (RN-19), e status atualizado por eventos (RF-EML-07).
7. **Domínio** com SPF, DKIM e DMARC.

## Justificativa

É o único provedor avaliado que oferece, no mesmo serviço e em camada gratuita para desenvolvimento, envio, recebimento e veredito de autenticação via API, que a RN-15(c) exige.

## Impactos

- Exige domínio próprio (DP-14).
- Inbound conta na cota: o volume do cenário B (≈ 32,5 mil) já exige o Pro.

## Custos

A: US$ 0. B: US$ 20/mês. C: ≈ US$ 62/mês (seção 3 de INFRASTRUCTURE_COSTS).

## Riscos e contingências

| Risco | Contingência |
| --- | --- |
| Teste prático revela ausência de dados de autenticação ou falha do catch-all | Recebimento via Cloudflare Email Service (gratuito) encaminhando ao nosso endpoint; envio continua no Resend |
| Volume alto | Amazon SES para envio (≈ US$ 22 no cenário C) |
| Endpoint de webhook desativado | Job de reconciliação e alerta |
| Uso comercial no Free não declarado | Free apenas em desenvolvimento; Pro no Gate |
