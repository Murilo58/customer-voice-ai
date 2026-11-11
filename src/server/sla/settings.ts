import { Prisma, TicketPriority } from "@/generated/prisma/client";
import { isUuid, newId } from "@/lib/security";
import { recordAudit } from "@/server/audit/audit";
import { getDb, type Db } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { DomainError } from "@/server/errors";
import { markOnboarding } from "@/server/organizations/onboarding";
import { requirePermission, type TenantActor } from "@/server/organizations/service";
import { parseWeek, type WeekHours } from "./calendar";

// Calendário (RF-ORG-07: horário comercial e feriados) e metas de SLA por prioridade (RF-SLA-01).
// Alterações valem para chamados criados depois delas (CA-03.3, CA-12.3).

const MAX_TARGET_MINUTES = 60 * 24 * 90;

export async function getSlaSettings(actor: TenantActor, db: Db = getDb()) {
  await requirePermission(actor, "settings.manage", db);
  return withTenant(actor, async (tx) => {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { businessHours: true, timezone: true } });
    return {
      timezone: org.timezone,
      week: parseWeek(org.businessHours),
      holidays: await tx.holiday.findMany({ orderBy: { date: "asc" }, select: { id: true, date: true, name: true } }),
      policies: await tx.slaPolicy.findMany(),
    };
  }, db);
}

export async function updateBusinessHours(actor: TenantActor, input: Record<string, { start: string; end: string } | null>, db: Db = getDb()) {
  await requirePermission(actor, "settings.manage", db);
  const toMin = (v: string) => {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v) ?? (v === "24:00" ? ["", "24", "00"] : null);
    if (!m) throw new DomainError("invalid_business_hours", "");
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const week: WeekHours = {};
  for (const [day, range] of Object.entries(input)) {
    if (!/^[0-6]$/.test(day)) throw new DomainError("invalid_business_hours", "");
    if (!range) continue;
    const start = toMin(range.start);
    const end = toMin(range.end);
    if (end <= start) throw new DomainError("invalid_business_hours", "");
    week[day as keyof WeekHours] = [start, end];
  }
  await withTenant(actor, async (tx) => {
    await tx.organization.update({ where: { id: actor.organizationId }, data: { businessHours: week as Prisma.InputJsonValue } });
    await recordAudit(tx, { organizationId: actor.organizationId, actorType: "user", actorId: actor.userId, action: "calendar.business_hours_updated", details: { week } });
    await markOnboarding(tx, actor.organizationId, "business_hours");
  }, db);
}

export async function addHoliday(actor: TenantActor, input: { date: string; name: string }, db: Db = getDb()) {
  await requirePermission(actor, "settings.manage", db);
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new DomainError("invalid_holiday", "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(`${input.date}T00:00:00Z`)) || new Date(`${input.date}T00:00:00Z`).toISOString().slice(0, 10) !== input.date) {
    throw new DomainError("invalid_holiday", "");
  }
  const id = newId();
  try {
    await withTenant(actor, async (tx) => {
      await tx.holiday.create({ data: { id, organizationId: actor.organizationId, date: new Date(`${input.date}T00:00:00Z`), name } });
      await recordAudit(tx, { organizationId: actor.organizationId, actorType: "user", actorId: actor.userId, action: "calendar.holiday_added", targetType: "holiday", targetId: id, details: { date: input.date, name } });
    }, db);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new DomainError("holiday_exists", "");
    throw e;
  }
  return { id };
}

export async function removeHoliday(actor: TenantActor, holidayId: string, db: Db = getDb()) {
  await requirePermission(actor, "settings.manage", db);
  if (!isUuid(holidayId)) throw new DomainError("invalid_holiday", "");
  await withTenant(actor, async (tx) => {
    const h = await tx.holiday.findUnique({ where: { id: holidayId } });
    if (!h) throw new DomainError("invalid_holiday", "");
    await tx.holiday.delete({ where: { id: holidayId } });
    await recordAudit(tx, { organizationId: actor.organizationId, actorType: "user", actorId: actor.userId, action: "calendar.holiday_removed", targetType: "holiday", targetId: holidayId, details: { date: h.date.toISOString().slice(0, 10) } });
  }, db);
}

export interface PolicyInput {
  firstResponseMinutes: number | null;
  resolutionMinutes: number | null;
  businessHours: boolean;
}

export async function updateSlaPolicies(actor: TenantActor, input: Partial<Record<TicketPriority, PolicyInput>>, db: Db = getDb()) {
  await requirePermission(actor, "settings.manage", db);
  const valid = (v: number | null) => v === null || (Number.isInteger(v) && v > 0 && v <= MAX_TARGET_MINUTES);
  for (const [p, v] of Object.entries(input)) {
    if (!Object.values(TicketPriority).includes(p as TicketPriority) || !v || !valid(v.firstResponseMinutes) || !valid(v.resolutionMinutes)) throw new DomainError("invalid_sla", "");
  }
  await withTenant(actor, async (tx) => {
    for (const [priority, v] of Object.entries(input) as [TicketPriority, PolicyInput][]) {
      await tx.slaPolicy.upsert({
        where: { organizationId_priority: { organizationId: actor.organizationId, priority } },
        create: { organizationId: actor.organizationId, priority, ...v },
        update: v,
      });
    }
    await recordAudit(tx, { organizationId: actor.organizationId, actorType: "user", actorId: actor.userId, action: "sla.policies_updated", details: { policies: input } });
    if (Object.values(input).some((v) => v?.firstResponseMinutes || v?.resolutionMinutes)) await markOnboarding(tx, actor.organizationId, "sla");
  }, db);
}
