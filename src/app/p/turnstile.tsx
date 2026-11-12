import Script from "next/script";
import { turnstileSiteKey } from "@/server/security/turnstile";

/** Desafio anti-bot (Cloudflare Turnstile). Sem chave configurada, o envio é recusado no servidor (falha fechada). */
export function Turnstile() {
  const siteKey = turnstileSiteKey();
  if (!siteKey) return <p className="muted">Verificação anti-bot não configurada: o envio está indisponível.</p>;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <div className="cf-turnstile" data-sitekey={siteKey} data-language="pt-br" style={{ marginTop: 12 }} />
    </>
  );
}
