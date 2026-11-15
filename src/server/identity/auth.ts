import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { newId } from "@/lib/security";
import { recordAuthEvent } from "@/server/audit/audit";
import { getDb } from "@/server/db/client";
import { appUrl, getEmailSender } from "@/server/email/sender";

// Better Auth só para identidade da equipe (ADR-004). Organizações, vínculos e convites são
// tabelas próprias com RLS (DATA_MODEL 3.1); o plugin de organização não é usado.

function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("BETTER_AUTH_SECRET ausente ou curto (mínimo 32 caracteres).");
  return betterAuth({
    appName: "VoxDesk AI",
    secret,
    baseURL: process.env.BETTER_AUTH_URL,
    database: prismaAdapter(getDb(), { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: true,
      revokeSessionsOnPasswordReset: true,
      // Recuperação de acesso (RF-ORG-03): token de uso único, 30 min; link para página própria.
      resetPasswordTokenExpiresIn: RESET_TTL_SECONDS,
      sendResetPassword: async ({ user, token }) => {
        if (await resetThrottled(user.id)) {
          await recordAuthEvent(getDb(), { action: "auth.password_reset_throttled", actorId: user.id });
          return;
        }
        await getEmailSender().send({
          to: user.email,
          subject: "Redefinição de senha — VoxDesk AI",
          text: `Para definir uma nova senha, acesse: ${appUrl(`/redefinir-senha?token=${encodeURIComponent(token)}`)}
O link vale por 30 minutos e funciona uma única vez. Se você não pediu, ignore esta mensagem.`,
        });
        await recordAuthEvent(getDb(), { action: "auth.password_reset_requested", actorId: user.id });
      },
      onPasswordReset: async ({ user }) => {
        await recordAuthEvent(getDb(), { action: "auth.password_reset_completed", actorId: user.id });
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      // Sem cache em cookie: revogação e desativação valem na próxima requisição (CA-02.2, CA-02.3).
      cookieCache: { enabled: false },
    },
    advanced: {
      database: { generateId: () => newId() },
      cookiePrefix: "cva",
    },
    rateLimit: { enabled: process.env.NODE_ENV === "production", window: 60, max: 30 },
    plugins: [twoFactor({ issuer: "VoxDesk AI" }), nextCookies()],
  });
}

const RESET_TTL_SECONDS = 30 * 60;
const RESET_MAX_PER_HOUR = 3;

/** Limite de pedidos por usuário (os tokens ficam em verifications, inclusive o atual). */
async function resetThrottled(userId: string): Promise<boolean> {
  const recent = await getDb().verification.count({
    where: { identifier: { startsWith: "reset-password:" }, value: userId, createdAt: { gt: new Date(Date.now() - 3_600_000) } },
  });
  return recent > RESET_MAX_PER_HOUR;
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __cvaAuth?: Auth };

/** Inicialização tardia: o build não precisa de banco nem segredo. */
export function getAuth(): Auth {
  globalForAuth.__cvaAuth ??= createAuth();
  return globalForAuth.__cvaAuth;
}

/** Rotas HTTP do Better Auth expostas. Cadastro, login e 2FA passam por server actions auditadas. */
export const PUBLIC_AUTH_PATHS = new Set(["/get-session", "/ok"]);
