"use server";

import { redirect } from "next/navigation";
import type { TicketPriority } from "@/generated/prisma/client";
import { requireActor, requirePlatformAdmin } from "@/server/identity/session";
import { markNotificationsRead } from "@/server/notifications/service";
import { setExecutiveRead } from "@/server/organizations/service";
import { setGlobalBudget, setOrganizationQuota, setOrganizationStatus } from "@/server/platform/backoffice";
import { addHoliday, removeHoliday, updateBusinessHours, updateSlaPolicies, type PolicyInput } from "@/server/sla/settings";
import { PRIORITIES } from "@/server/sla/service";
import { backWithError, field } from "./helpers";

const settingsPath = (slug: string) => `/o/${slug}/configuracoes`;

export async function updateBusinessHoursAction(slug: string, form: FormData): Promise<void> {
  const { actor } = await requireActor(slug);
  const week: Record<string, { start: string; end: string } | null> = {};
  for (let d = 0; d <= 6; d++) week[d] = field(form, `on_${d}`) === "1" ? { start: field(form, `start_${d}`), end: field(form, `end_${d}`) } : null;
  try {
    await updateBusinessHours(actor, week);
  } catch (e) {
    backWithError(settingsPath(slug), e);
  }
  redirect(`${settingsPath(slug)}?ok=calendario#calendario`);
}

export async function addHolidayAction(slug: string, form: FormData): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await addHoliday(actor, { date: field(form, "date"), name: field(form, "name") });
  } catch (e) {
    backWithError(settingsPath(slug), e);
  }
  redirect(`${settingsPath(slug)}#calendario`);
}

export async function removeHolidayAction(slug: string, holidayId: string): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await removeHoliday(actor, holidayId);
  } catch (e) {
    backWithError(settingsPath(slug), e);
  }
  redirect(`${settingsPath(slug)}#calendario`);
}

/** Metas em horas no formulário; armazenadas em minutos. */
export async function updateSlaPoliciesAction(slug: string, form: FormData): Promise<void> {
  const { actor } = await requireActor(slug);
  const hours = (name: string) => {
    const v = field(form, name).replace(",", ".").trim();
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 60) : NaN;
  };
  const input: Partial<Record<TicketPriority, PolicyInput>> = {};
  for (const p of PRIORITIES) {
    input[p] = { firstResponseMinutes: hours(`frt_${p}`), resolutionMinutes: hours(`res_${p}`), businessHours: field(form, `biz_${p}`) === "1" };
  }
  try {
    await updateSlaPolicies(actor, input);
  } catch (e) {
    backWithError(settingsPath(slug), e);
  }
  redirect(`${settingsPath(slug)}?ok=sla#sla`);
}

export async function markNotificationsReadAction(slug: string, form: FormData): Promise<void> {
  const { actor } = await requireActor(slug);
  const ids = form.getAll("id").filter((v): v is string => typeof v === "string");
  await markNotificationsRead(actor, ids.length ? ids : "all");
  redirect(`/o/${slug}/alertas`);
}

export async function setExecutiveReadAction(slug: string, membershipId: string, enabled: boolean): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await setExecutiveRead(actor, membershipId, enabled);
  } catch (e) {
    backWithError(`/o/${slug}/membros`, e);
  }
  redirect(`/o/${slug}/membros`);
}

// ---------- Superadmin ----------

export async function setOrganizationStatusAction(organizationId: string, status: "active" | "suspended"): Promise<void> {
  const admin = await requirePlatformAdmin();
  try {
    await setOrganizationStatus(admin.id, organizationId, status);
  } catch (e) {
    backWithError("/admin", e);
  }
  redirect("/admin");
}

export async function setOrganizationQuotaAction(organizationId: string, form: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  try {
    await setOrganizationQuota(admin.id, organizationId, Number(field(form, "limit")));
  } catch (e) {
    backWithError("/admin", e);
  }
  redirect("/admin");
}

export async function setGlobalBudgetAction(form: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  try {
    await setGlobalBudget(admin.id, Number(field(form, "limit").replace(",", ".")));
  } catch (e) {
    backWithError("/admin", e);
  }
  redirect("/admin");
}
