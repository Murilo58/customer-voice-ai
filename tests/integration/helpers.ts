import pg from "pg";
import { newId } from "@/lib/security";
import { getDb } from "@/server/db/client";
import {
  acceptMemberInvitation,
  createOrganizationFromInvitation,
  createOrganizationInvitation,
  inviteMember,
  resolveActor,
  type TenantActor,
} from "@/server/organizations/service";
import type { MemberRole } from "@/generated/prisma/client";

/** Conexão do dono do schema, só para preparar cenários e verificar o banco por fora da aplicação. */
export async function withMigrator<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL_MIGRATOR });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

let seq = 0;
const unique = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export async function createUser(name = "Usuário Sintético") {
  const id = newId();
  const email = `u-${unique()}@exemplo.test`;
  await getDb().user.create({ data: { id, name, email, emailVerified: true } });
  return { id, email, name };
}

export async function createPlatformAdmin() {
  const user = await createUser("Superadmin Sintético");
  await withMigrator((c) => c.query("INSERT INTO platform_admins (user_id) VALUES ($1)", [user.id]));
  return user;
}

/** Organização criada pelo fluxo real: convite do Superadmin → aceite → Administrador. */
export async function createOrganization(admin: { id: string }) {
  const owner = await createUser("Admin Sintético");
  const slug = `org-${unique()}`;
  const inv = await createOrganizationInvitation(admin.id, owner.email);
  const org = await createOrganizationFromInvitation({ token: inv.token, userId: owner.id, userEmail: owner.email, name: `Org ${slug}`, slug });
  const actor = (await resolveActor(owner.id, slug)) as TenantActor;
  return { ...org, owner, actor };
}

export async function addMember(adminActor: TenantActor, role: MemberRole) {
  const user = await createUser(`Membro ${role}`);
  const inv = await inviteMember(adminActor, { email: user.email, role });
  const accepted = await acceptMemberInvitation({ token: inv.token, userId: user.id, userEmail: user.email });
  const actor: TenantActor = { userId: user.id, organizationId: accepted.organizationId, membershipId: accepted.membershipId, role };
  return { ...user, actor };
}
