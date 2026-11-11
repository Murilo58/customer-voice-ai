// Envio de e-mail desacoplado. O Resend só será integrado após a PoC 3 (ADR-007).
// Até lá, o provedor "console" registra a mensagem no log do servidor (dados sintéticos).

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Message-ID gerado pela plataforma (associação de respostas no I-4, RN-15) */
  messageId?: string;
  /** Chave de idempotência repassada ao provedor */
  idempotencyKey?: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<{ providerId: string | null }>;
}

class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<{ providerId: string | null }> {
    console.info(`[email:console] para=${message.to} assunto="${message.subject}"\n${message.text}`);
    return { providerId: null };
  }
}

export function getEmailSender(): EmailSender {
  const provider = process.env.EMAIL_PROVIDER ?? "console";
  if (provider === "console") return new ConsoleEmailSender();
  throw new Error(`Provedor de e-mail não disponível: ${provider}. O Resend aguarda a PoC 3.`);
}

export function appUrl(path: string): string {
  return new URL(path, process.env.BETTER_AUTH_URL ?? "http://localhost:3000").toString();
}
