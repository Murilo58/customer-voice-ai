import { Prisma } from "@/generated/prisma/client";
import { newId, normalizeEmail } from "@/lib/security";
import { getDb, type Db } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { DomainError } from "@/server/errors";
import { requirePermission, type TenantActor } from "@/server/organizations/service";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DOMAIN_RE = /^(?=.{3,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

function text(value: string, code: string, min: number, max: number): string {
  const v = value.trim();
  if (v.length < min || v.length > max) throw new DomainError(code, "");
  return v;
}

function optional(value: string | undefined | null, max: number, code: string): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (v.length > max) throw new DomainError(code, "");
  return v;
}

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const isFk = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003";

export interface ContactInput {
  name: string;
  email: string;
  phone?: string | null;
  clientCompanyId?: string | null;
}

function validateContact(input: ContactInput) {
  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email) || email.length > 254) throw new DomainError("invalid_email", "");
  const phone = optional(input.phone, 30, "invalid_phone");
  if (phone && !/^[0-9+()\-\s]{8,30}$/.test(phone)) throw new DomainError("invalid_phone", "");
  return {
    name: text(input.name, "invalid_name", 2, 120),
    email,
    phone,
    clientCompanyId: optional(input.clientCompanyId, 36, "invalid_company"),
  };
}

// ---------- Empresas-cliente (RF-CLI-02) ----------

export async function createCompany(actor: TenantActor, input: { name: string; emailDomain?: string | null }, db: Db = getDb()) {
  await requirePermission(actor, "service.access", db);
  const name = text(input.name, "invalid_name", 2, 120);
  const emailDomain = optional(input.emailDomain?.toLowerCase(), 253, "invalid_domain");
  if (emailDomain && !DOMAIN_RE.test(emailDomain)) throw new DomainError("invalid_domain", "");
  const id = newId();
  await withTenant(actor, (tx) => tx.clientCompany.create({ data: { id, organizationId: actor.organizationId, name, emailDomain } }), db);
  return { id };
}

export async function listCompanies(actor: TenantActor, db: Db = getDb()) {
  await requirePermission(actor, "service.access", db);
  return withTenant(actor, (tx) =>
    tx.clientCompany.findMany({
      where: { anonymizedAt: null },
      select: { id: true, name: true, emailDomain: true, _count: { select: { contacts: true } } },
      orderBy: { name: "asc" },
      take: 500,
    }), db);
}

/** Empresa e seus contatos (CA-18.3). */
export async function getCompany(actor: TenantActor, id: string, db: Db = getDb()) {
  await requirePermission(actor, "service.access", db);
  return withTenant(actor, (tx) =>
    tx.clientCompany.findUnique({
      where: { id },
      select: { id: true, name: true, emailDomain: true, contacts: { select: { id: true, name: true, email: true }, orderBy: { name: "asc" } } },
    }), db);
}

// ---------- Contatos (RF-CLI-01, RF-CLI-04) ----------

export async function createContact(actor: TenantActor, input: ContactInput, db: Db = getDb()) {
  await requirePermission(actor, "service.access", db);
  const data = validateContact(input);
  const id = newId();
  try {
    await withTenant(actor, (tx) => tx.contact.create({ data: { id, organizationId: actor.organizationId, ...data } }), db);
  } catch (e) {
    if (isUnique(e)) throw new DomainError("contact_email_taken", "");
    if (isFk(e)) throw new DomainError("invalid_company", "");
    throw e;
  }
  return { id };
}

export async function updateContact(actor: TenantActor, id: string, input: ContactInput, db: Db = getDb()) {
  await requirePermission(actor, "service.access", db);
  const data = validateContact(input);
  try {
    const r = await withTenant(actor, (tx) => tx.contact.updateMany({ where: { id, anonymizedAt: null }, data }), db);
    if (r.count !== 1) throw new DomainError("contact_not_found", "");
  } catch (e) {
    if (isUnique(e)) throw new DomainError("contact_email_taken", "");
    if (isFk(e)) throw new DomainError("invalid_company", "");
    throw e;
  }
}

export async function listContacts(actor: TenantActor, query = "", db: Db = getDb()) {
  await requirePermission(actor, "service.access", db);
  const q = query.trim().slice(0, 100);
  return withTenant(actor, (tx) =>
    tx.contact.findMany({
      where: {
        anonymizedAt: null,
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q.toLowerCase() } }] } : {}),
      },
      select: { id: true, name: true, email: true, phone: true, company: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
      take: 200,
    }), db);
}

/** Perfil do contato com histórico de chamados, do mais recente ao mais antigo (RF-CLI-04; CA-18.1). */
export async function getContactProfile(actor: TenantActor, id: string, db: Db = getDb()) {
  await requirePermission(actor, "service.access", db);
  return withTenant(actor, async (tx) => {
    const contact = await tx.contact.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, phone: true, clientCompanyId: true, anonymizedAt: true, pseudonymCode: true, company: { select: { id: true, name: true } } },
    });
    if (!contact) return null;
    const tickets = await tx.ticket.findMany({
      where: { contactId: id },
      select: { id: true, number: true, subject: true, status: true, priority: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { number: "desc" }],
      take: 200,
    });
    return { contact, tickets };
  }, db);
}
