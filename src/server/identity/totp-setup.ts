import QRCode from "qrcode";

// Apresentação da configuração TOTP gerada pelo Better Auth: QR Code (SVG gerado no servidor, sem serviço
// externo) e a chave para digitação manual. O URI otpauth não é exibido como texto.

/** Extrai a chave (base32) do URI otpauth e a agrupa em blocos de 4 para facilitar a digitação. */
export function manualKeyFromUri(totpURI: string): string {
  const url = new URL(totpURI);
  if (url.protocol !== "otpauth:") throw new Error("URI TOTP inválido.");
  const secret = (url.searchParams.get("secret") ?? "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  if (!secret) throw new Error("URI TOTP sem chave.");
  return secret.match(/.{1,4}/g)!.join(" ");
}

export async function totpSetupView(totpURI: string): Promise<{ qrSvg: string; manualKey: string }> {
  const qrSvg = await QRCode.toString(totpURI, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
  return { qrSvg, manualKey: manualKeyFromUri(totpURI) };
}
