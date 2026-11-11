import type { Prisma } from "@/generated/prisma/client";
import { getDb, type Db } from "./client";

// Único ponto autorizado a definir o contexto de RLS (verificado por scripts/check-security.mjs).
// Sempre set_config(..., true): local à transação. O contexto de sessão vaza entre
// transações no pooler (PoC T9) e é proibido.

export type Tx = Prisma.TransactionClient;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, name: string): void {
  if (!UUID_RE.test(value)) throw new Error(`${name} inválido.`);
}

const TX_OPTIONS = { maxWait: 5_000, timeout: 15_000 } as const;

interface Context {
  orgId?: string;
  userId?: string;
  invitationTokenHash?: string;
  platformAdmin?: boolean;
}

async function withContext<T>(ctx: Context, fn: (tx: Tx) => Promise<T>, db: Db): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT
      set_config('app.org_id', ${ctx.orgId ?? ""}, true),
      set_config('app.user_id', ${ctx.userId ?? ""}, true),
      set_config('app.invitation_token_hash', ${ctx.invitationTokenHash ?? ""}, true),
      set_config('app.platform_admin', ${ctx.platformAdmin ? "true" : ""}, true)`;
    return fn(tx);
  }, TX_OPTIONS);
}

/** Acesso a dados de uma organização. organizationId deve vir da sessão validada no servidor. */
export function withTenant<T>(
  scope: { organizationId: string; userId?: string },
  fn: (tx: Tx) => Promise<T>,
  db: Db = getDb(),
): Promise<T> {
  assertUuid(scope.organizationId, "organizationId");
  if (scope.userId) assertUuid(scope.userId, "userId");
  return withContext({ orgId: scope.organizationId, userId: scope.userId }, fn, db);
}

/** Pré-contexto: leitura dos próprios vínculos (de quais organizações sou membro). */
export function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>, db: Db = getDb()): Promise<T> {
  assertUuid(userId, "userId");
  return withContext({ userId }, fn, db);
}

/** Pré-contexto: leitura de um convite pelo hash do token. */
export function withInvitationToken<T>(tokenHash: string, fn: (tx: Tx) => Promise<T>, db: Db = getDb()): Promise<T> {
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) throw new Error("Hash de token inválido.");
  return withContext({ invitationTokenHash: tokenHash }, fn, db);
}

/** Contexto de Superadmin: verifica platform_admins na mesma transação antes de liberar o contexto. */
export async function withPlatformAdmin<T>(userId: string, fn: (tx: Tx) => Promise<T>, db: Db = getDb()): Promise<T> {
  assertUuid(userId, "userId");
  return db.$transaction(async (tx) => {
    const admin = await tx.platformAdmin.findUnique({ where: { userId } });
    if (!admin) throw new ForbiddenError("Acesso restrito ao Superadmin.");
    await tx.$queryRaw`SELECT set_config('app.platform_admin', 'true', true), set_config('app.user_id', ${userId}, true)`;
    return fn(tx);
  }, TX_OPTIONS);
}

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN";
}
