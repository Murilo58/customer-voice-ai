import { getDb, type Db } from "@/server/db/client";
import { withTenant, type Tx } from "@/server/db/tenant";
import { requirePermission, type TenantActor } from "./service";

// Checklist de configuração inicial (RF-ORG-11; CA-03.4). Cada item é marcado como concluído na mesma
// transação em que a configuração correspondente é salva; pode ser concluído em qualquer ordem.

export const CHECKLIST = [
  { item: "organization_data", label: "Dados da organização (nome e fuso horário)", path: "configuracoes#organizacao" },
  { item: "business_hours", label: "Horário comercial e feriados", path: "configuracoes#calendario" },
  { item: "teams", label: "Equipes", path: "equipes" },
  { item: "taxonomy", label: "Categorias e motivos (com modelo sugerido)", path: "configuracoes#categorias" },
  { item: "sla", label: "Política de SLA", path: "configuracoes#sla" },
  { item: "inbound_email", label: "E-mail de entrada", availableIn: "I-4" },
  { item: "invite_team", label: "Convite da equipe", path: "membros" },
] as const;

export type ChecklistItem = (typeof CHECKLIST)[number]["item"];

export async function markOnboarding(tx: Tx, organizationId: string, item: ChecklistItem): Promise<void> {
  await tx.onboardingItem.createMany({ data: { organizationId, item }, skipDuplicates: true });
}

export async function getChecklist(actor: TenantActor, db: Db = getDb()) {
  await requirePermission(actor, "settings.manage", db);
  const done = await withTenant(actor, (tx) => tx.onboardingItem.findMany({ select: { item: true, completedAt: true } }), db);
  const at = new Map(done.map((d) => [d.item, d.completedAt]));
  const items = CHECKLIST.map((c) => ({ ...c, completedAt: at.get(c.item) ?? null }));
  return { items, completed: items.filter((i) => i.completedAt).length, total: items.length };
}
