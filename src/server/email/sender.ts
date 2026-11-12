// Envio de e-mail desacoplado (ADR-007). "console" registra a mensagem no log (desenvolvimento);
// "resend" envia pela API do Resend (validado na PoC 3). O Message-ID próprio não é enviado:
// o provedor o substitui na entrega, e a correlação de respostas usa só o token r+ (ADR-007).

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Endereço de resposta r+{token}@ (RN-15a) */
  replyTo?: string;
  /** Chave de idempotência repassada ao provedor */
  idempotencyKey?: string;
  /** Organização dona do e-mail, devolvida nos eventos de entrega (RF-EML-07) */
  organizationId?: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<{ providerId: string | null }>;
}

class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<{ providerId: string | null }> {
    console.info(`[email:console] para=${message.to} assunto="${message.subject}"${message.replyTo ? ` resposta=${message.replyTo}` : ""}\n${message.text}`);
    return { providerId: null };
  }
}

export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<{ providerId: string | null }> {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(message.organizationId ? { tags: [{ name: "org", value: message.organizationId }] } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await r.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    // A mensagem de erro do provedor não contém credenciais; o corpo do e-mail nunca é registrado.
    if (!r.ok) throw new Error(`resend_${r.status}: ${String(data.name ?? data.message ?? "erro").slice(0, 120)}`);
    return { providerId: data.id ?? null };
  }
}

export function getEmailSender(): EmailSender {
  const provider = process.env.EMAIL_PROVIDER ?? "console";
  if (provider === "console") return new ConsoleEmailSender();
  if (provider === "resend") {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!key || !from) throw new Error("EMAIL_PROVIDER=resend exige RESEND_API_KEY e EMAIL_FROM.");
    return new ResendEmailSender(key, from);
  }
  throw new Error(`Provedor de e-mail não disponível: ${provider}.`);
}

export function appUrl(path: string): string {
  return new URL(path, process.env.BETTER_AUTH_URL ?? "http://localhost:3000").toString();
}

/** Domínio de recebimento (ex.: in.<domínio> ou <id>.resend.app). Sem ele, não há endereço de resposta. */
export function inboundDomain(): string | null {
  const d = (process.env.INBOUND_EMAIL_DOMAIN ?? "").trim().toLowerCase();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}
