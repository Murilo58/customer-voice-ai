// Desafio anti-bot do formulário público e da solicitação de link mágico (RSG-11; ADR-009).
// Cloudflare Turnstile, gratuito. Falha fechada: sem configuração ou sem resposta válida, o envio é recusado.

export type TurnstileVerifier = (token: string, ip: string) => Promise<boolean>;

export function turnstileSiteKey(): string | null {
  return process.env.TURNSTILE_SITE_KEY || null;
}

export const verifyTurnstile: TurnstileVerifier = async (token, ip) => {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return false;
    const data = (await r.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
};
