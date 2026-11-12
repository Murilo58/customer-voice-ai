import type { QuarantineStatus } from "@/generated/prisma/client";
import { formatProtocol } from "@/lib/labels";
import { isUuid, newId } from "@/lib/security";
import { recordAudit } from "@/server/audit/audit";
import { getDb, type Db } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { DomainError } from "@/server/errors";
import { requirePermission, type TenantActor } from "@/server/organizations/service";
import { createCustomerTicket, validName } from "@/server/servicedesk/customer";

// Fila de quarentena (RF-EML-08; RN-17; CA-06.4, CA-06.9). Só Gestores e Administradores.
// Liberação exige justificativa, é auditada e nunca expõe a mensagem ao portal.

export type QuarantineAction = "associate" | "new_ticket" | "discard";

export async function listQuarantine(actor: TenantActor, status: QuarantineStatus = "pending", db: Db = getDb()) {
  await requirePermission(actor, "quarantine.manage", db);
  return withTenant(actor, (tx) =>
    tx.quarantineItem.findMany({
      where: { status },
      select: { id: true, reason: true, status: true, createdAt: true, decidedAt: true, inbound: { select: { fromAddress: true, subject: true, createdAt: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }), db);
}

export async function countPendingQuarantine(actor: TenantActor, db: Db = getDb()) {
  return withTenant(actor, (tx) => tx.quarantineItem.count({ where: { status: "pending" } }), db);
}

export async function getQuarantineItem(actor: TenantActor, id: string, db: Db = getDb()) {
  await requirePermission(actor, "quarantine.manage", db);
  if (!isUuid(id)) return null;
  return withTenant(actor, async (tx) => {
    const item = await tx.quarantineItem.findUnique({
      where: { id },
      include: { inbound: { include: { ticket: { select: { number: true } } } } },
    });
    if (!item) return null;
    const org = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { ticketPrefix: true } });
    return { ...item, linkedProtocol: item.inbound.ticket ? formatProtocol(org.ticketPrefix, item.inbound.ticket.number) : null };
  }, db);
}

export async function decideQuarantine(
  actor: TenantActor,
  id: string,
  input: { action: string; justification: string; ticketNumber?: number | null },
  db: Db = getDb(),
) {
  await requirePermission(actor, "quarantine.manage", db);
  if (!isUuid(id)) throw new DomainError("quarantine_not_found", "");
  const action = input.action as QuarantineAction;
  if (!["associate", "new_ticket", "discard"].includes(action)) throw new DomainError("invalid_action", "");
  const justification = input.justification.trim();
  if (justification.length < 10 || justification.length > 1000) throw new DomainError("justification_required", "");
  return withTenant(actor, async (tx) => {
    const item = await tx.quarantineItem.findUnique({ where: { id }, include: { inbound: true } });
    if (!item) throw new DomainError("quarantine_not_found", "");
    const status: QuarantineStatus = action === "associate" ? "associated" : action === "new_ticket" ? "new_ticket" : "discarded";
    // Decisão única: duas decisões simultâneas não liberam a mensagem duas vezes.
    const done = await tx.quarantineItem.updateMany({
      where: { id, status: "pending" },
      data: { status, decidedBy: actor.membershipId, decidedAt: new Date(), justification },
    });
    if (done.count !== 1) throw new DomainError("quarantine_already_decided", "");
    const inbound = item.inbound;
    let ticketId: string | null = null;
    let jobIds: string[] = [];
    if (action === "associate") {
      const number = Number(input.ticketNumber);
      const ticket = Number.isInteger(number) && number > 0
        ? await tx.ticket.findUnique({ where: { organizationId_number: { organizationId: actor.organizationId, number } }, select: { id: true } })
        : null;
      if (!ticket) throw new DomainError("ticket_not_found", "");
      ticketId = ticket.id;
      // Mensagem interna marcada "remetente não verificado": não aparece no portal nem notifica o contato (CA-06.9).
      // O autor registrado é quem liberou a mensagem; o conteúdo é do remetente externo.
      await tx.ticketMessage.create({
        data: {
          id: newId(), organizationId: actor.organizationId, ticketId, kind: "internal_note", unverifiedSender: true, source: "email", authorMembershipId: actor.membershipId,
          bodyText: inbound.bodyText.slice(0, 20_000) || "(mensagem sem texto)", bodyHtmlSanitized: inbound.bodyHtmlSanitized, inboundMessageId: inbound.id,
        },
      });
      await tx.ticketEvent.create({
        data: { id: newId(), organizationId: actor.organizationId, ticketId, type: "ticket.quarantine_associated", actorType: "user", actorId: actor.userId, data: { quarantineItemId: id, reason: item.reason } },
      });
    } else if (action === "new_ticket") {
      const created = await createCustomerTicket(tx, actor.organizationId, {
        email: inbound.fromAddress, name: validName(inbound.fromName ?? "", inbound.fromAddress), subject: inbound.subject || "(sem assunto)",
        description: inbound.bodyText.slice(0, 20_000) || "(mensagem sem texto)", channel: "email", limitAutoEmail: true,
      }, db);
      ticketId = created.id;
      jobIds = [created.jobId, created.emailJobId].filter((v): v is string => !!v);
    }
    if (ticketId) await tx.inboundMessage.update({ where: { id: inbound.id }, data: { ticketId } });
    await recordAudit(tx, {
      organizationId: actor.organizationId, actorType: "user", actorId: actor.userId, action: `quarantine.${action}`,
      targetType: "quarantine_item", targetId: id, details: { reason: item.reason, ticketId, justification },
    });
    return { ticketId, jobIds };
  }, db);
}
