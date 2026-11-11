import type { MemberRole } from "@/generated/prisma/client";

export type Permission =
  | "members.manage"
  | "audit.read"
  | "organization.read"
  | "service.access"
  | "settings.manage"
  | "triage.reprocess"
  /** Atribuir/reatribuir chamados e trocar a equipe (RF-ATD-06) */
  | "tickets.assign"
  /** Dashboard operacional (RF-DSH-01); permitido também na leitura executiva (RF-ORG-10) */
  | "dashboard.read";

const MATRIX: Record<MemberRole, readonly Permission[]> = {
  admin: ["members.manage", "audit.read", "organization.read", "service.access", "settings.manage", "triage.reprocess", "tickets.assign", "dashboard.read"],
  manager: ["organization.read", "service.access", "triage.reprocess", "tickets.assign", "dashboard.read"],
  agent: ["organization.read", "service.access"],
};

/** "service.access" = chamados e contatos. Leitura executiva remove esse acesso (RF-ORG-10). */
export function can(role: MemberRole, permission: Permission, executiveRead = false): boolean {
  if (executiveRead && (permission === "service.access" || permission === "triage.reprocess" || permission === "tickets.assign")) return false;
  return MATRIX[role].includes(permission);
}

export const ROLE_LABEL: Record<MemberRole, string> = {
  admin: "Administrador",
  manager: "Gestor",
  agent: "Atendente",
};

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function invitationState(inv: { expiresAt: Date; acceptedAt?: Date | null; usedAt?: Date | null; revokedAt: Date | null }, now = new Date()):
  "valid" | "expired" | "used" | "revoked" {
  if (inv.revokedAt) return "revoked";
  if (inv.acceptedAt || inv.usedAt) return "used";
  if (inv.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}
