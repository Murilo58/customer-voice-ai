// PoC 1 (parte Neon) — RLS com Prisma 7 + @prisma/adapter-neon + pooler do Neon (PgBouncer, modo transação).
// Pré-requisitos: projeto Neon GRATUITO e isolado, dados sintéticos, variáveis em .env (ver .env).
// Execução: npx prisma generate && npx tsx poc-neon.ts
// O script cria papéis e tabelas próprios (prefixo poc_) e remove tudo ao final.
import "dotenv/config";
import { randomUUID, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "./generated/prisma/client.js";

const POOLED = process.env.DATABASE_URL;
const DIRECT = process.env.DATABASE_URL_UNPOOLED;
if (!POOLED || !DIRECT) throw new Error("Defina DATABASE_URL e DATABASE_URL_UNPOOLED em .env (projeto Neon de PoC).");
if (!new URL(POOLED).hostname.includes("-pooler")) throw new Error("DATABASE_URL deve ser a conexão pooled (host com -pooler).");

const results: { id: string; name: string; ok: boolean; detail: string }[] = [];
const record = (id: string, name: string, ok: boolean, detail = "") => {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${name}${detail ? "  — " + detail : ""}`);
};
const pct = (arr: number[], p: number) => [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))];

const owner = new PrismaClient({ adapter: new PrismaNeon({ connectionString: DIRECT }) });
// Nome de papel único por execução: o pooler do Neon pode manter conexões de um papel
// homônimo removido em execução anterior (achado registrado no POC_RESULTS).
const RT = "poc_rt_" + randomBytes(4).toString("hex");
const runtimePassword = "Poc" + randomBytes(24).toString("hex");

const setupSql = [
  `DROP TABLE IF EXISTS tickets, contacts, organizations CASCADE`,
  `DROP FUNCTION IF EXISTS app_current_org()`,
  `DO $$ DECLARE r text; BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'poc_app_runtime' OR rolname LIKE 'poc_rt_%' LOOP EXECUTE format('REVOKE ALL ON SCHEMA public FROM %I', r); EXECUTE format('DROP ROLE %I', r); END LOOP; END $$`,
  `CREATE ROLE ${RT} LOGIN NOBYPASSRLS PASSWORD '${runtimePassword}'`,
  `GRANT USAGE ON SCHEMA public TO ${RT}`,
  `CREATE TABLE organizations (id uuid PRIMARY KEY, name text NOT NULL)`,
  `CREATE TABLE contacts (organization_id uuid NOT NULL REFERENCES organizations(id), id uuid PRIMARY KEY, email text NOT NULL, UNIQUE (organization_id, id), UNIQUE (organization_id, email))`,
  `CREATE TABLE tickets (organization_id uuid NOT NULL REFERENCES organizations(id), id uuid PRIMARY KEY, contact_id uuid NOT NULL, subject text NOT NULL, UNIQUE (organization_id, id), FOREIGN KEY (organization_id, contact_id) REFERENCES contacts (organization_id, id))`,
  `CREATE FUNCTION app_current_org() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.org_id', true), '')::uuid $$`,
  `ALTER TABLE organizations ENABLE ROW LEVEL SECURITY`, `ALTER TABLE organizations FORCE ROW LEVEL SECURITY`,
  `ALTER TABLE contacts ENABLE ROW LEVEL SECURITY`, `ALTER TABLE contacts FORCE ROW LEVEL SECURITY`,
  `ALTER TABLE tickets ENABLE ROW LEVEL SECURITY`, `ALTER TABLE tickets FORCE ROW LEVEL SECURITY`,
  `CREATE POLICY org_self ON organizations USING (id = app_current_org()) WITH CHECK (id = app_current_org())`,
  `CREATE POLICY tenant_isolation ON contacts USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org())`,
  `CREATE POLICY tenant_isolation ON tickets USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org())`,
  `GRANT SELECT, INSERT, UPDATE, DELETE ON organizations, contacts, tickets TO ${RT}`,
  `GRANT EXECUTE ON FUNCTION app_current_org() TO ${RT}`,
];

async function main() {
  for (const s of setupSql) await owner.$executeRawUnsafe(s);
  record("N0", "Setup de papéis, tabelas e políticas via SQL no Neon", true);

  const pooledRuntime = new URL(POOLED!);
  pooledRuntime.username = RT;
  pooledRuntime.password = runtimePassword;
  const app = new PrismaClient({ adapter: new PrismaNeon({ connectionString: pooledRuntime.toString(), max: 20 }) });

  const withTenant = <T>(org: string, fn: (tx: any) => Promise<T>) =>
    app.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.org_id', ${org}, true)`;
      return fn(tx);
    });

  // Seed sintético pelo próprio runtime, com contexto
  const A = randomUUID(), B = randomUUID();
  const seed = async (org: string, name: string, n: number) => {
    const contacts: string[] = [];
    await withTenant(org, async (tx) => {
      await tx.organization.create({ data: { id: org, name } });
      for (let i = 0; i < n; i++) {
        const c = randomUUID(); contacts.push(c);
        await tx.contact.create({ data: { organizationId: org, id: c, email: `c${i}@${name}.test` } });
        await tx.ticket.create({ data: { organizationId: org, id: randomUUID(), contactId: c, subject: `Assunto ${i}` } });
      }
    });
    return contacts;
  };
  await seed(A, "orga", 15);
  const contactsB = await seed(B, "orgb", 10);
  record("N1", "Seed sintético por transação interativa com contexto (Prisma 7 + adapter)", true);

  // N2 — fail closed fora de transação, pelo pooler
  const outside = await app.ticket.count();
  record("N2", "Sem contexto (pooler): zero linhas", outside === 0, `linhas=${outside}`);

  // N3 — concorrência real pelo pooler, alternando tenants
  // conc acima do pool do cliente (max 20) testa a fila; conc = 20 isola o comportamento do pooler.
  const runLoad = async (N: number, CONC: number) => {
    let leaks = 0, errors = 0; const lat: number[] = []; const causes: Record<string, number> = {};
    let next = 0;
    const worker = async () => {
      while (next < N) {
        const i = next++;
        const org = i % 2 === 0 ? A : B;
        const t0 = performance.now();
        try {
          const rows: { organizationId: string }[] = await withTenant(org, (tx) =>
            tx.ticket.findMany({ select: { organizationId: true }, distinct: ["organizationId"] }));
          if (rows.length !== 1 || rows[0].organizationId !== org) leaks++;
        } catch (e: any) {
          errors++;
          const cause = `${e?.code ?? "sem código"}: ${String(e?.message ?? e).trim().split(String.fromCharCode(10)).filter(Boolean).pop()?.slice(0, 140)}`;
          causes[cause] = (causes[cause] ?? 0) + 1;
        }
        lat.push(performance.now() - t0);
      }
    };
    await Promise.all(Array.from({ length: CONC }, worker));
    return { leaks, errors, lat, causes };
  };
  const fmt = (r: Awaited<ReturnType<typeof runLoad>>) =>
    `vazamentos=${r.leaks}; erros=${r.errors}; p50=${pct(r.lat, 50).toFixed(1)} ms; p95=${pct(r.lat, 95).toFixed(1)} ms` +
    (r.errors ? `; causas=${JSON.stringify(r.causes)}` : "");
  const r3 = await runLoad(2000, 50);
  record("N3", "2000 transações concorrentes (50 simultâneas) pelo pooler sem vazamento", r3.leaks === 0 && r3.errors === 0, fmt(r3));
  const r3b = await runLoad(2000, 20);
  record("N3b", "Diagnóstico: 2000 transações com concorrência = pool do cliente (20)", r3b.leaks === 0 && r3b.errors === 0, fmt(r3b));

  // N4 — após as transações, o pooler não entrega conexões com contexto residual
  let residual = 0;
  for (let i = 0; i < 200; i++) residual += await app.ticket.count();
  record("N4", "200 consultas sem contexto após a carga: nenhuma linha visível", residual === 0, `linhas somadas=${residual}`);

  // N5 — rollback por erro não deixa contexto residual
  try { await withTenant(A, async (tx) => { await tx.ticket.count(); throw new Error("falha simulada"); }); } catch {}
  const afterRollback = await app.ticket.count();
  record("N5", "Rollback em transação interativa sem contexto residual", afterRollback === 0, `linhas=${afterRollback}`);

  // N6 — WITH CHECK e FK composta pelo runtime
  let e1 = false, e2 = false;
  try { await withTenant(A, (tx) => tx.contact.create({ data: { organizationId: B, id: randomUUID(), email: "x@x.test" } })); } catch { e1 = true; }
  try { await withTenant(A, (tx) => tx.ticket.create({ data: { organizationId: A, id: randomUUID(), contactId: contactsB[0], subject: "cruzado" } })); } catch { e2 = true; }
  record("N6", "WITH CHECK e FK composta recusam escrita cruzada", e1 && e2, `with check=${e1}; fk=${e2}`);

  // N7 — custo: transação com contexto vs consulta simples sem transação
  const plain: number[] = [], ctx: number[] = [];
  for (let i = 0; i < 200; i++) {
    let t0 = performance.now(); await app.ticket.findMany({ take: 5 }); plain.push(performance.now() - t0);
    t0 = performance.now(); await withTenant(A, (tx) => tx.ticket.findMany({ take: 5 })); ctx.push(performance.now() - t0);
  }
  const rtt: number[] = [];
  for (let i = 0; i < 100; i++) { const t0 = performance.now(); await app.$queryRaw`SELECT 1`; rtt.push(performance.now() - t0); }
  record("N7a", "Diagnóstico: ida e volta de rede (SELECT 1 pelo pooler)", true,
    `p50=${pct(rtt, 50).toFixed(1)} ms; p95=${pct(rtt, 95).toFixed(1)} ms`);
  const overhead = pct(ctx, 95) - pct(plain, 95);
  record("N7", "Sobrecarga p95 da transação com contexto ≤ 15 ms", overhead <= 15,
    `p95 simples=${pct(plain, 95).toFixed(1)} ms; p95 com contexto=${pct(ctx, 95).toFixed(1)} ms; diferença=${overhead.toFixed(1)} ms`);

  await app.$disconnect();
}

try {
  await main();
} catch (e: any) {
  record("ERR", "Execução interrompida", false, String(e?.message ?? e).trim().replace(/\s+/g, " ").slice(0, 400));
} finally {
  // Limpeza: remove tudo o que a PoC criou
  // No Neon, neondb_owner não pode usar DROP OWNED BY em outro papel; por isso REVOKE + DROP ROLE.
  let cleanupErrors = 0;
  for (const s of setupSql.slice(0, 3)) await owner.$executeRawUnsafe(s).catch((e: any) => {
    cleanupErrors++; console.log("ERRO NA LIMPEZA:", String(e?.message ?? e).trim().replace(/\s+/g, " ").slice(0, 300));
  });
  const leftover: any[] = await owner.$queryRawUnsafe(
    `SELECT (SELECT count(*)::int FROM pg_roles WHERE rolname = 'poc_app_runtime' OR rolname LIKE 'poc_rt_%') AS roles,
            (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public') AS tabelas`).catch(() => [{}]);
  record("CLN", "Limpeza: papel e tabelas da PoC removidos", cleanupErrors === 0 && leftover[0]?.roles === 0 && leftover[0]?.tabelas === 0,
    `erros=${cleanupErrors}; papéis restantes=${leftover[0]?.roles}; tabelas restantes=${leftover[0]?.tabelas}`);
  await owner.$disconnect();
  const failed = results.filter((r) => !r.ok).length;
  const out = { executedAt: new Date().toISOString(), prisma: "7.10.1", adapter: "@prisma/adapter-neon 7.10.1", results };
  writeFileSync(`resultado-neon-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 2));
  console.log(`\nResumo: ${results.length - failed}/${results.length} aprovados`);
  process.exit(failed ? 1 : 0);
}
