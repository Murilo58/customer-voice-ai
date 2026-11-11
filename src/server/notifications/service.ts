import { isUuid } from "@/lib/security";
import { getDb, type Db } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { requirePermission, type TenantActor } from "@/server/organizations/service";

// Alertas in-app (RF-SLA-04, RF-CON-03). A política de RLS restringe a leitura aos alertas da própria pessoa.

export async function unreadCount(actor: TenantActor, db: Db = getDb()): Promise<number> {
  return withTenant(actor, (tx) => tx.notification.count({ where: { membershipId: actor.membershipId, readAt: null } }), db);
}

export async function listNotifications(actor: TenantActor, db: Db = getDb()) {
  await requirePermission(actor, "organization.read", db);
  return withTenant(actor, async (tx) => {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { ticketPrefix: true } });
    const rows = await tx.notification.findMany({
      where: { membershipId: actor.membershipId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, type: true, data: true, readAt: true, createdAt: true, ticket: { select: { number: true, subject: true } } },
    });
    return { prefix: org.ticketPrefix, rows };
  }, db);
}

export async function markNotificationsRead(actor: TenantActor, ids: string[] | "all", db: Db = getDb()) {
  await requirePermission(actor, "organization.read", db);
  const valid = ids === "all" ? null : ids.filter(isUuid);
  await withTenant(actor, (tx) =>
    tx.notification.updateMany({ where: { membershipId: actor.membershipId, readAt: null, ...(valid ? { id: { in: valid } } : {}) }, data: { readAt: new Date() } }), db);
}
