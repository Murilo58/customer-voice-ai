import type { ActorType, Prisma } from "@/generated/prisma/client";
import { maskDetails, newId } from "@/lib/security";
import type { Db } from "@/server/db/client";
import type { Tx } from "@/server/db/tenant";

export interface AuditEntry {
  organizationId: string | null;
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

/** Evento de autenticação sem organização (login, falha de login, logout). Política auth_events_insert. */
export async function recordAuthEvent(
  db: Db,
  entry: { action: `auth.${string}`; actorId?: string | null; details?: Record<string, unknown> },
): Promise<void> {
  // createMany não usa RETURNING: o runtime pode inserir o evento, mas não pode lê-lo (política auth_events_insert).
  await db.auditLog.createMany({
    data: {
      id: newId(),
      organizationId: null,
      actorType: entry.actorId ? "user" : "system",
      actorId: entry.actorId ?? null,
      action: entry.action,
      details: maskDetails(entry.details ?? {}) as Prisma.InputJsonValue,
    },
  });
}

/**
 * Registra um evento na mesma transação da operação auditada.
 * A tabela é somente inserção (trigger + privilégios). organizationId nulo só em contexto de Superadmin.
 */
export async function recordAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      id: newId(),
      organizationId: entry.organizationId,
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      details: maskDetails(entry.details ?? {}) as Prisma.InputJsonValue,
      requestId: entry.requestId,
    },
  });
}
