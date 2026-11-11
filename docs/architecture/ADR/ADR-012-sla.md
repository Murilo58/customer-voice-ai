# ADR-012 — Cálculo de SLA e alertas

**Status:** Proposta (recomendação condicional, sujeita a revisão detalhada).

## Problema

Calcular prazos de primeira resposta e resolução em horas úteis ou corridas, com pausas, reabertura e troca de prioridade (RN-20 a 24). Também é preciso sinalizar risco e violação uma única vez e registrar violações de forma imutável (RF-SLA-01 a 05).

## Alternativas avaliadas

1. Prazos persistidos no chamado, recalculados nos eventos, mais um cron periódico para alertas e violações.
2. Um timer agendado por chamado (mensagem com atraso na fila).
3. Cálculo exclusivamente na leitura.

## Comparação

| Critério | 1. Persistido + cron | 2. Timer por chamado | 3. Só leitura |
| --- | --- | --- | --- |
| Consulta “SLA em risco” | Índice simples | Índice simples | Cálculo pesado por linha |
| Pausas e mudanças | Recalcula `due_at` | Cancelar e reagendar timers | Simples |
| Alertas únicos | Tabela `sla_alerts` com PK | Risco de duplicação na reentrega | Exige processo à parte |
| Complexidade | Baixa | Média | Baixa, mas incompleta |

## Recomendação (alternativa 1)

| Elemento | Definição |
| --- | --- |
| Calendário | Função pura `addBusinessMinutes(start, minutes, calendar, holidays, tz)` com testes de fim de semana, feriado, fuso e virada de dia (CA-12.1) |
| Persistência | `first_response_due_at` e `resolution_due_at` gravados no chamado. Pausa grava `sla_paused_since`; a retomada soma `sla_paused_seconds` e recalcula (RN-22). Reabertura retoma o tempo restante (RN-21). Troca de prioridade recalcula a partir da criação (RN-24) |
| Situação exibida | Derivada na leitura: no prazo, em risco (≥ 80%) ou violado |
| Cron `sla.tick` | A cada minuto: busca chamados com prazo próximo ou vencido (índices parciais), grava `sla_alerts` (PK única → alerta uma vez, CA-12.2) e `sla_breaches` (somente inserção, CA-12.5), e cria notificações in-app |
| Escopo | O cron usa `app_system` para encontrar candidatos e processa cada organização sob `withTenant` |

## Parâmetros

Limiar de risco de 80% (RN-24, configurável). Frequência de 1 minuto (Pro).

## Limitações

- No Hobby, o cron roda só uma vez por dia (±59 min). Os alertas de SLA só funcionam plenamente com o Pro, o que é um gatilho técnico da ADR-013.
- Em desenvolvimento, o tick é acionado manualmente ou por script local.

## Custos

Uma invocação por minuto ≈ 43.200 por mês, dentro do crédito do Pro.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Erros de fuso e horário de verão | Biblioteca de datas com suporte a timezone e testes |
| Atraso do cron | Tolerância de 1 a 2 minutos aceitável; a situação exibida é calculada na leitura |
