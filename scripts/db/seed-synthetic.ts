// Dados SINTÉTICOS para desenvolvimento local: Superadmin, organização "demo" com Administrador e Atendente.
// Recusa rodar se NODE_ENV=production. As senhas geradas são exibidas uma única vez no terminal.
import "dotenv/config";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { getAuth } from "@/server/identity/auth";
import {
  acceptMemberInvitation,
  createOrganizationFromInvitation,
  createOrganizationInvitation,
  inviteMember,
  resolveActor,
} from "@/server/organizations/service";

if (process.env.NODE_ENV === "production") throw new Error("Seed sintético não roda em produção.");

const pass = () => randomBytes(12).toString("base64url");

async function signUp(name: string, email: string) {
  const password = pass();
  const r = await getAuth().api.signUpEmail({ body: { name, email, password } });
  return { id: r.user.id, email, password };
}

async function main() {
  const slug = `demo-${Date.now().toString(36)}`;
  const superadmin = await signUp("Superadmin Sintético", `superadmin+${slug}@exemplo.test`);
  const migrator = new pg.Client({ connectionString: process.env.DATABASE_URL_MIGRATOR });
  await migrator.connect();
  await migrator.query("INSERT INTO platform_admins (user_id) VALUES ($1)", [superadmin.id]);
  await migrator.end();

  const admin = await signUp("Ana Administradora", `ana+${slug}@exemplo.test`);
  const inv = await createOrganizationInvitation(superadmin.id, admin.email);
  const org = await createOrganizationFromInvitation({ token: inv.token, userId: admin.id, userEmail: admin.email, name: "Loja Demo (sintética)", slug });

  const agent = await signUp("Bruno Atendente", `bruno+${slug}@exemplo.test`);
  const adminActor = await resolveActor(admin.id, org.slug);
  if (!adminActor) throw new Error("Administrador sem vínculo após criar a organização.");
  const agentInv = await inviteMember(adminActor, { email: agent.email, role: "agent" });
  await acceptMemberInvitation({ token: agentInv.token, userId: agent.id, userEmail: agent.email });

  console.log(`\nDados sintéticos criados (organização /o/${slug}). Guarde as senhas; não serão exibidas de novo.`);
  console.table([
    { perfil: "Superadmin (ative 2FA em /conta/seguranca para usar /admin)", email: superadmin.email, senha: superadmin.password },
    { perfil: "Administrador", email: admin.email, senha: admin.password },
    { perfil: "Atendente", email: agent.email, senha: agent.password },
  ]);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
