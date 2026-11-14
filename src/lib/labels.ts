import type { Sentiment, TicketChannel, TicketPriority, TicketStatus, TicketType, TriageState } from "@/generated/prisma/client";
import type { TicketView } from "@/server/servicedesk/tickets";

export const TYPE_LABEL: Record<TicketType, string> = {
  complaint: "Reclamação",
  request: "Solicitação",
  question: "Dúvida",
  suggestion: "Sugestão",
  compliment: "Elogio",
};

export const PRIORITY_LABEL: Record<TicketPriority, string> = { low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente" };

export const STATUS_LABEL: Record<TicketStatus, string> = {
  new: "Novo",
  open: "Aberto",
  waiting_customer: "Aguardando cliente",
  waiting_third_party: "Aguardando terceiro",
  resolved: "Resolvido",
  closed: "Fechado",
  cancelled: "Cancelado",
};

export const SENTIMENT_LABEL: Record<Sentiment, string> = { very_negative: "Muito negativo", negative: "Negativo", neutral: "Neutro", positive: "Positivo" };

export const TRIAGE_STATE_LABEL: Record<TriageState, string> = {
  pending: "Aguardando triagem",
  suggested: "Sugestões aguardando revisão",
  reviewed: "Revisada",
  unavailable: "Triagem indisponível",
};

export const EMAIL_STATUS_LABEL: Record<string, string> = {
  queued: "e-mail na fila",
  sent: "e-mail enviado",
  delivered: "e-mail entregue",
  delayed: "entrega atrasada",
  bounced: "e-mail devolvido",
  complained: "marcado como spam",
  failed: "falha no envio",
};

export const VIEW_LABEL: Record<TicketView, string> = {
  mine: "Meus chamados",
  team_unassigned: "Minha equipe sem responsável",
  sla_risk: "SLA em risco",
  triage_review: "Aguardando revisão da triagem",
};

export const CHANNEL_LABEL: Record<TicketChannel, string> = { portal: "Portal", email: "E-mail", manual: "Manual" };

/** Protocolo legível por organização (RN-01): PREFIXO-000123. */
export function formatProtocol(prefix: string, number: number): string {
  return `${prefix}-${String(number).padStart(6, "0")}`;
}

/** Extrai o número de um protocolo digitado ("ACME-000123", "000123" ou "123"). */
export function parseProtocol(input: string): number | null {
  const m = input.trim().match(/^(?:[A-Za-z0-9]{1,12}-)?0*(\d{1,9})$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

export const SLA_STATE_LABEL: Record<string, string> = {
  none: "sem meta",
  ok: "no prazo",
  paused: "pausado",
  risk: "em risco",
  breached: "violado",
  met: "cumprido",
  met_late: "cumprido com atraso",
  cancelled: "fora do SLA (cancelado)",
  on_time: "no prazo",
  at_risk: "em risco",
};

export const METRIC_LABEL: Record<string, string> = { first_response: "Primeira resposta", resolution: "Resolução" };

/** Duração legível (horas e minutos), com sinal para atrasos. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const neg = seconds < 0;
  const total = Math.round(Math.abs(seconds) / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${neg ? "-" : ""}${h ? `${h}h` : ""}${h && m ? " " : ""}${m || !h ? `${m}min` : ""}`;
}

export const ATTACHMENT_STATUS_LABEL: Record<string, string> = {
  pending: "em verificação",
  released: "liberado",
  quarantined: "em quarentena",
  rejected: "recusado",
  deleted: "excluído",
};

export const ATTACHMENT_REASON_LABEL: Record<string, string> = {
  type_blocked: "tipo bloqueado",
  type_not_allowed: "tipo não permitido",
  type_mismatch: "conteúdo não corresponde à extensão",
  too_large: "acima de 4 MB",
  empty: "arquivo vazio ou indisponível",
  too_many_files: "mais de 5 arquivos",
  image_decode_failed: "imagem inválida",
  invalid_utf8: "texto com codificação inválida",
  pdf_invalid: "PDF inválido",
  technical_error: "falha técnica na verificação",
};

export function attachmentReason(reason: string | null): string | null {
  if (!reason) return null;
  if (reason.startsWith("pdf_active")) return "PDF com conteúdo ativo";
  return ATTACHMENT_REASON_LABEL[reason] ?? reason;
}

export const QUARANTINE_REASON_LABEL: Record<string, string> = {
  sender_mismatch: "remetente diferente do contato do chamado",
  auth_failed: "falha na autenticação do remetente (SPF/DKIM/DMARC)",
  invalid_token: "token de resposta inválido ou de outra organização",
  contradictory_links: "vínculos contraditórios",
  loop_protection: "excesso de mensagens do remetente (proteção contra loop)",
  spam: "marcada como spam pelo provedor",
};

/** Formatos aceitos no upload (RSG-12; ADR-008 C2). */
export const ATTACHMENT_ACCEPT = ".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv";
