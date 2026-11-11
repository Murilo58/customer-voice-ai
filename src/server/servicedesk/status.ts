import type { TicketStatus } from "@/generated/prisma/client";

// Ciclo de status (RN-05; CA-10.2). Função pura, sem banco.
// Novo → Aberto (ao ser assumido ou respondido) → Aguardando cliente / Aguardando terceiro → Aberto
// → Resolvido → Fechado (automático após o prazo de RN-07). Resolvido → Aberto na reabertura.
// Cancelado a partir de Novo ou Aberto, com motivo obrigatório.

export type StatusActor = "user" | "system";

const USER_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  new: ["open", "cancelled"],
  open: ["waiting_customer", "waiting_third_party", "resolved", "cancelled"],
  waiting_customer: ["open"],
  waiting_third_party: ["open"],
  resolved: ["open"],
  closed: [],
  cancelled: [],
};

/** Transições exclusivas do sistema: fechamento automático (RN-07). */
const SYSTEM_TRANSITIONS: Partial<Record<TicketStatus, readonly TicketStatus[]>> = {
  resolved: ["closed"],
};

export function canTransition(from: TicketStatus, to: TicketStatus, by: StatusActor = "user"): boolean {
  if (USER_TRANSITIONS[from].includes(to)) return true;
  return by === "system" && (SYSTEM_TRANSITIONS[from] ?? []).includes(to);
}

export function allowedTransitions(from: TicketStatus): readonly TicketStatus[] {
  return USER_TRANSITIONS[from];
}

/** Chamado ativo: ainda exige atendimento (visões e filas). */
export const ACTIVE_STATUSES: readonly TicketStatus[] = ["new", "open", "waiting_customer", "waiting_third_party"];

/** Prazo de reabertura após a resolução (RN-07, padrão de 7 dias corridos). */
export const REOPEN_WINDOW_DAYS = 7;

/**
 * RN-06: só resolve com tipo e categoria confirmados por humano — sugestão aceita ou corrigida,
 * ou valor preenchido manualmente (sem sugestão pendente para o campo).
 */
export function resolutionBlockers(t: { type: string | null; categoryId: string | null; pendingReviewFields: string[] }): string[] {
  const blockers: string[] = [];
  if (!t.type || t.pendingReviewFields.includes("type")) blockers.push("type");
  if (!t.categoryId || t.pendingReviewFields.includes("category")) blockers.push("category");
  return blockers;
}
