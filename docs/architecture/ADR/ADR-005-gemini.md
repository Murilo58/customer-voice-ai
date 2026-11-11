# ADR-005 — Gemini Developer API e modelo de triagem

**Status:**

- Gemini Developer API (nível pago) como escolha preferencial: **Aprovada com condições**:
  - somente dados sintéticos até a conclusão de DP-01;
  - uso pago sem autorização de despesas ilimitadas, com os controles da seção 5.3 de AI_ARCHITECTURE.md.
- Modelo de triagem: **Pendente de validação** (teste comparativo).
- Controles de gasto: **Proposta**.

## Problema

Definir o acesso à Gemini (único provedor de LLM, DA-02), o modelo para a triagem e os mecanismos de custo e segurança.

## Alternativas avaliadas

- **Acesso:** Gemini Developer API ou Gemini via Vertex AI.
- **Modelos:** `gemini-3.1-flash-lite`, `gemini-3.5-flash-lite` e `gemini-3.6-flash` (todos Stable); `gemini-3.8-flash` (“New”); família 2.5 (descontinuada ou restrita).

## Critérios

Termos de dados, disponibilidade no Brasil, qualidade de classificação em pt-BR, saída estruturada, latência, custo e estabilidade.

## Comparação

| Modelo | Status | US$/1M (entrada / saída) | Raciocínio | Observação |
| --- | --- | --- | --- | --- |
| `gemini-3.1-flash-lite` | Stable | 0,25 / 1,50 | Controle não documentado para a versão de texto | Mais barato |
| `gemini-3.5-flash-lite` | Stable | 0,30 / 2,50 | “On (minimal)”, sem opção de desligar | Raciocínio cobrado como saída |
| `gemini-3.6-flash` | Stable | 0,75 / 3,75 (1,50 / 7,50 a partir de 2027) | — | Só se a qualidade exigir |

**Developer API × Vertex AI:** a Developer API paga atende em princípio:

- o Google atua como operador sob DPA e não usa os dados para melhorar produtos;
- o Brasil está na lista de regiões disponíveis.

Ficam pendentes o prazo de retenção dos logs de abuso e o armazenamento “in any country” (DP-01). A Vertex AI só será avaliada se a revisão jurídica exigir controles que a Developer API não ofereça.

## Recomendação

1. Developer API, nível pago, com projetos e chaves separados por ambiente.
2. Pipeline determinístico com uma chamada estruturada (`responseJsonSchema` com enums de IDs), validação Zod, RN-14 e prioridade calculada por código (AI_ARCHITECTURE.md).
3. Modelo escolhido pelo teste comparativo: o mais barato e estável que atinja KPI-04 no golden set de pelo menos 200 itens.
4. Controles de gasto em camadas: cota por organização, teto global, idempotência, teto do projeto no AI Studio e alertas do Cloud Billing.

## Justificativa

Atende ao PRD com o menor custo. A seleção baseada em medição evita escolher modelo por suposição.

## Impactos

Configuração de modelo e preço versionada; golden set no CI; reconciliação mensal de consumo (CC-10).

## Custos

≈ US$ 1 a 1,35 por organização/mês (1.000 chamados), sem raciocínio. Cenário B: ≈ US$ 5 a 7. Cenário C: ≈ US$ 19 a 27.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Tokens de raciocínio elevam o custo | Medição no teste comparativo; tetos |
| Qualidade insuficiente dos Flash-Lite | Ajuste de prompt; Flash só com aprovação |
| Retenção e localização indefinidas nos termos | Dados sintéticos até DP-01; minimização; análise jurídica |
| SDK 3.0.0 muito recente | Fixar versão com pelo menos 2 semanas de publicação e testada |
| Teto do AI Studio é experimental, com latência | Tetos da aplicação como primeira barreira |
