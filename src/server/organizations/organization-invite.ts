import { normalizeEmail } from "@/lib/security";
import { getDb, type Db } from "@/server/db/client";
import { appUrl, getEmailSender, type EmailSender } from "@/server/email/sender";
import type { ClaimedJob } from "@/server/jobs/outbox";
import { createOrganizationInvitation } from "./service";

// Convite de organização (RF-ORG-01) com envio do e-mail. Usado pela tela /admin e pelo job abaixo.
// O token só existe em memória: no banco fica o hash; no e-mail, o link. Nada disso é registrado em log.

export async function sendOrganizationInvitation(
  adminUserId: string,
  email: string,
  deps: { sender?: EmailSender; db?: Db } = {},
): Promise<{ invitationId: string; providerId: string | null }> {
  const db = deps.db ?? getDb();
  const inv = await createOrganizationInvitation(adminUserId, email, db);
  try {
    const r = await (deps.sender ?? getEmailSender()).send({
      to: inv.email,
      subject: "Convite para criar sua organização no VoxDesk AI",
      text: `Crie sua organização: ${appUrl(`/criar-organizacao/${inv.token}`)}\nO convite expira em 7 dias.`,
    });
    return { invitationId: inv.id, providerId: r.providerId };
  } catch (e) {
    // Sem entrega, o convite não fica válido (o token já não pode ser recuperado).
    await db.organizationInvitation.updateMany({ where: { id: inv.id, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    throw e;
  }
}

// Job de convite inicial: permite emitir o convite dentro do ambiente de Produção (credenciais de envio da
// Vercel), sem endpoint novo, quando ainda não há Superadmin com acesso ao /admin. O pedido só contém o
// e-mail e o autor; o autor precisa estar em platform_admins (validado por withPlatformAdmin, com auditoria).
// Executar uma única vez (maxAttempts: 1): uma nova tentativa geraria outro convite.
export const ORG_INVITE_JOB = "organization_invitation.send";

export function organizationInviteJobHandler(deps: { sender?: EmailSender; db?: Db } = {}) {
  return async (job: ClaimedJob) => {
    const db = deps.db ?? getDb();
    const p = (job.payload ?? {}) as { email?: unknown; adminUserId?: unknown };
    if (typeof p.email !== "string" || typeof p.adminUserId !== "string") throw new Error("Job de convite inválido.");
    const email = normalizeEmail(p.email);
    if (await db.user.count({ where: { email: { equals: email, mode: "insensitive" } } })) throw new Error("Já existe conta para este e-mail.");
    const pending = await db.organizationInvitation.count({ where: { email, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
    if (pending) throw new Error("Já existe convite pendente para este e-mail.");
    const r = await sendOrganizationInvitation(p.adminUserId, email, { ...deps, db });
    console.info(`[jobs] convite de organização ${r.invitationId} enviado${r.providerId ? ` (e-mail ${r.providerId})` : ""}`);
  };
}
