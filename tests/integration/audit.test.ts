// Auditoria somente inserção (RF-AUD-03) e eventos de plataforma.
import { beforeAll, describe, expect, it } from "vitest";
import { newId } from "@/lib/security";
import { recordAudit, recordAuthEvent } from "@/server/audit/audit";
import { getDb } from "@/server/db/client";
import { withPlatformAdmin, withTenant } from "@/server/db/tenant";
import { createOrganization, createPlatformAdmin, withMigrator } from "./helpers";

let org: Awaited<ReturnType<typeof createOrganization>>;
let admin: Awaited<ReturnType<typeof createPlatformAdmin>>;

beforeAll(async () => {
  admin = await createPlatformAdmin();
  org = await createOrganization(admin);
});

describe("auditoria", () => {
  it("o runtime não consegue alterar nem excluir registros", async () => {
    await expect(withTenant(org.actor, (tx) => tx.auditLog.updateMany({ data: { action: "adulterado" } }))).rejects.toThrow();
    await expect(withTenant(org.actor, (tx) => tx.auditLog.deleteMany({}))).rejects.toThrow();
  });

  it("nem o dono do schema altera, exclui ou trunca (trigger)", async () => {
    await withMigrator(async (c) => {
      await expect(c.query("UPDATE audit_logs SET action = 'x'")).rejects.toThrow(/somente inserção|row-level|0 rows/);
      await expect(c.query("DELETE FROM audit_logs")).rejects.toThrow();
      await expect(c.query("TRUNCATE audit_logs")).rejects.toThrow(/somente inserção/);
    });
  });

  it("mascara dados sensíveis nos detalhes", async () => {
    await withTenant(org.actor, (tx) =>
      recordAudit(tx, { organizationId: org.organizationId, actorType: "system", action: "teste.mascaramento", details: { password: "segredo123", email: "fulano@exemplo.test" } }));
    const row = await withTenant(org.actor, (tx) => tx.auditLog.findFirstOrThrow({ where: { action: "teste.mascaramento" } }));
    expect(row.details).toEqual({ password: "[removido]", email: "f***@exemplo.test" });
  });

  it("eventos de autenticação sem organização: o runtime insere, mas não lê", async () => {
    await recordAuthEvent(getDb(), { action: "auth.login_failed", details: { email: "alguem@exemplo.test" } });
    expect(await getDb().auditLog.count()).toBe(0);
    const seenByAdmin = await withPlatformAdmin(admin.id, (tx) => tx.auditLog.count({ where: { action: "auth.login_failed" } }));
    expect(seenByAdmin).toBeGreaterThan(0);
  });

  it("evento sem organização fora do padrão auth.* exige contexto de Superadmin", async () => {
    await expect(
      getDb().auditLog.create({ data: { id: newId(), organizationId: null, actorType: "system", action: "plataforma.qualquer" } }),
    ).rejects.toThrow();
  });

  it("contexto de Superadmin é negado a quem não está em platform_admins", async () => {
    await expect(withPlatformAdmin(org.owner.id, (tx) => tx.auditLog.count())).rejects.toThrow("Superadmin");
  });

  it("o Superadmin não lê dados de organizações pelo contexto de plataforma", async () => {
    const n = await withPlatformAdmin(admin.id, (tx) => tx.auditLog.count({ where: { organizationId: org.organizationId } }));
    expect(n).toBe(0);
  });
});
