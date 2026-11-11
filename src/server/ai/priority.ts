import type { TicketPriority } from "@/generated/prisma/client";

// Prioridade sugerida por regras determinísticas (RN-10; RF-TRI-03). A IA não produz a prioridade.

const ORDER: TicketPriority[] = ["low", "medium", "high", "urgent"];
const max = (a: TicketPriority, b: TicketPriority) => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

export type PriorityRule = "organization_rule" | "escalation_risk" | "urgency" | "sentiment";

export interface PriorityInput {
  /** Regras explícitas da organização (prioridade padrão da categoria e do motivo). */
  organizationRules: (TicketPriority | null | undefined)[];
  escalationRisk: boolean;
  urgency: "low" | "medium" | "high";
  sentiment: "very_negative" | "negative" | "neutral" | "positive";
}

export function suggestPriority(input: PriorityInput): { priority: TicketPriority; rules: PriorityRule[] } {
  const orgRules = input.organizationRules.filter((p): p is TicketPriority => !!p);
  const rules: PriorityRule[] = [];
  let priority: TicketPriority;
  if (orgRules.length) {
    // (1) Regra explícita da organização prevalece sobre urgência e sentimento.
    priority = orgRules.reduce(max);
    rules.push("organization_rule");
  } else {
    // (3) A urgência define o valor-base.
    priority = input.urgency;
    rules.push("urgency");
    // (4) O sentimento sozinho nunca eleva acima de Média.
    if (input.sentiment === "very_negative" && priority === "low") {
      priority = "medium";
      rules.push("sentiment");
    }
  }
  // (2) Risco de escalada externa eleva no mínimo para Alta.
  if (input.escalationRisk && ORDER.indexOf(priority) < ORDER.indexOf("high")) {
    priority = "high";
    rules.push("escalation_risk");
  }
  return { priority, rules };
}
