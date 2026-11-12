import { Prisma, type TicketChannel } from "@/generated/prisma/client";
import { newId, normalizeEmail } from "@/lib/security";
import type { Db } from "@/server/db/client";
import type { Tx } from "@/server/db/tenant";
import { queueEmail } from "@/server/email/outbound";
import { DomainError } from "@/server/errors";
import { recordAttachments, type PreparedFile } from "@/server/attachments/service";
import { hitRateLimit, RATE_RULES } from "@/server/security/rate-limit";
import { rateKey } from "@/server/security/tokens";
import { insertTicket } from "./tickets";

// Abertura pelo cliente (portal e e-mail): contato identificado ou criado (CA-05.4, CA-06.1),
// chamado com triagem e confirmação por e-mail (RF-POR-02, RF-EML-01).

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validEmail(value: string): string {
  const email = normalizeEmail(value);
  if (!EMAIL_RE.test(email) || email.length > 254) throw new DomainError("invalid_email", "");
  return email;
}

export function validName(value: string, fallbackEmail?: string): string {
  const name = value.replace(/\s+/g, " ").trim().slice(0, 120);
  if (name.length >= 2) return name;
  if (fallbackEmail) return fallbackEmail.split("@")[0]!.slice(0, 120).padEnd(2, "_");
  throw new DomainError("invalid_name", "");
}

/** Reutiliza o contato ativo com o mesmo e-mail na organização; senão, cria (corrida tratada pelo índice único). */
export async function findOrCreateContact(tx: Tx, organizationId: string, email: string, name: string) {
  const existing = await tx.contact.findFirst({ where: { email, anonymizedAt: null }, select: { id: true } });
  if (existing) return { id: existing.id, created: false };
  const id = newId();
  try {
    await tx.$executeRaw`SAVEPOINT contact_insert`;
    await tx.contact.create({ data: { id, organizationId, name, email } });
    await tx.$executeRaw`RELEASE SAVEPOINT contact_insert`;
    return { id, created: true };
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT contact_insert`;
    const again = await tx.contact.findFirst({ where: { email, anonymizedAt: null }, select: { id: true } });
    if (!again) throw e;
    return { id: again.id, created: false };
  }
}

export interface CustomerTicketInput {
  email: string;
  name: string;
  subject: string;
  description: string;
  channel: Extract<TicketChannel, "portal" | "email">;
  files?: PreparedFile[];
  /** E-mail não verificado: no máximo 1 e-mail automático por hora ao endereço (RN-16) */
  limitAutoEmail?: boolean;
}

export async function createCustomerTicket(tx: Tx, organizationId: string, input: CustomerTicketInput, db?: Db) {
  const contact = await findOrCreateContact(tx, organizationId, input.email, input.name);
  const created = await insertTicket(tx, organizationId, {
    contactId: contact.id, subject: input.subject, description: input.description, channel: input.channel, createdBy: { type: "contact", contactId: contact.id },
  });
  const attachments = input.files?.length ? await recordAttachments(tx, organizationId, { ticketId: created.id, messageId: null }, input.channel === "portal" ? "contact" : "email", input.files) : null;
  const allowed = !input.limitAutoEmail || (await hitRateLimit(rateKey("auto_email", organizationId, input.email), RATE_RULES.autoEmail, db));
  const emailJobId = allowed
    ? await queueEmail(tx, { organizationId, ticketId: created.id, template: "ticket_created", to: input.email, idempotencyKey: `created:${created.id}` })
    : null;
  return { ...created, contactId: contact.id, emailJobId, rejected: attachments?.rejected ?? [] };
}
