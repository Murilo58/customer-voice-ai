// CA-14.3 (RNF-04): mede o p95 do dashboard numa base sintética de referência — 50 mil chamados em 90 dias.
// Uso (somente banco NÃO produtivo): npm run perf:dashboard -- [--keep]
// Cria uma organização sintética pelo dono do schema, mede como app_runtime (RLS ativo) e remove tudo ao final.
import "dotenv/config";
import pg from "pg";
import { getDashboard } from "@/server/dashboard/metrics";
import { newId } from "@/lib/security";

const TICKETS = 50_000;
const RUNS = 20;
const url = process.env.DATABASE_URL_MIGRATOR;
if (!url) throw new Error("Defina DATABASE_URL_MIGRATOR.");
const c = new pg.Client({ connectionString: url });
await c.connect();
const orgId = newId(), userId = newId(), membershipId = newId(), contactId = newId(), teamId = newId(), categoryId = newId();
const slug = `perf-${Date.now().toString(36)}`;

async function cleanup() {
  // Limpeza da base sintética pelo dono do schema; o trigger de imutabilidade fica desativado só durante a remoção.
  await c.query("ALTER TABLE sla_events DISABLE TRIGGER sla_events_no_update_delete");
  for (const table of ["sla_events", "ticket_events", "tickets", "contacts", "categories", "teams", "memberships", "audit_logs", "organizations"]) {
    await c.query(`DELETE FROM ${table} WHERE ${table === "organizations" ? "id" : "organization_id"} = $1`, [orgId]);
  }
  await c.query("DELETE FROM users WHERE id = $1", [userId]);
  await c.query("ALTER TABLE sla_events ENABLE TRIGGER sla_events_no_update_delete");
}

try {
  const db = (await c.query("SELECT current_database() AS d")).rows[0].d as string;
  if (/prod/i.test(db)) throw new Error("Banco com nome de produção: abortado.");
  console.log(`Banco ${db}: criando ${TICKETS} chamados sintéticos…`);
  await c.query("INSERT INTO users (id, name, email, email_verified, updated_at) VALUES ($1, 'Perf Sintético', $2, true, now())", [userId, `${slug}@exemplo.test`]);
  await c.query("INSERT INTO organizations (id, slug, name, ticket_prefix) VALUES ($1, $2, 'Perf Sintética', 'PERF')", [orgId, slug]);
  await c.query("INSERT INTO memberships (organization_id, id, user_id, role, updated_at) VALUES ($1, $2, $3, 'admin', now())", [orgId, membershipId, userId]);
  await c.query("INSERT INTO contacts (organization_id, id, name, email, updated_at) VALUES ($1, $2, 'Contato Perf', $3, now())", [orgId, contactId, `c-${slug}@exemplo.test`]);
  await c.query("INSERT INTO teams (organization_id, id, name) VALUES ($1, $2, 'Equipe Perf')", [orgId, teamId]);
  await c.query("INSERT INTO categories (organization_id, id, name) VALUES ($1, $2, 'Categoria Perf')", [orgId, categoryId]);
  await c.query(`
    INSERT INTO tickets (organization_id, id, number, contact_id, subject, description, channel, type, priority, status, team_id, category_id,
      created_at, updated_at, first_responded_at, resolved_at, first_response_business_secs, resolution_business_secs, sla_snapshot, sla_intervals, cancel_reason, cancelled_at)
    SELECT $1, gen_random_uuid(), g, $2, 'Assunto sintético ' || g, 'Descrição sintética', (ARRAY['manual','portal','email'])[1 + g % 3]::ticket_channel,
      (ARRAY['complaint','request','question','suggestion','compliment'])[1 + g % 5]::ticket_type,
      (ARRAY['low','medium','high','urgent'])[1 + g % 4]::ticket_priority,
      CASE WHEN g % 10 < 6 THEN 'resolved' WHEN g % 10 < 8 THEN 'open' WHEN g % 10 = 8 THEN 'new' ELSE 'cancelled' END::ticket_status,
      CASE WHEN g % 2 = 0 THEN $3::uuid END, CASE WHEN g % 3 = 0 THEN $4::uuid END,
      ts, ts, CASE WHEN g % 10 < 8 THEN ts + make_interval(mins => 10 + g % 300) END,
      CASE WHEN g % 10 < 6 THEN ts + make_interval(hours => 1 + g % 72) END,
      CASE WHEN g % 10 < 8 THEN 600 + g % 9000 END, CASE WHEN g % 10 < 6 THEN 3600 + g % 90000 END,
      '{"timezone":"America/Sao_Paulo","week":{},"policies":{"medium":{"firstResponseMinutes":60,"resolutionMinutes":480,"businessHours":false}}}'::jsonb, '[]'::jsonb, CASE WHEN g % 10 = 9 THEN 'Sintético' END, CASE WHEN g % 10 = 9 THEN ts + interval '1 hour' END
    FROM generate_series(1, ${TICKETS}) g, LATERAL (SELECT now() - make_interval(secs => (g::double precision / ${TICKETS}) * 90 * 86400) AS ts) x`,
    [orgId, contactId, teamId, categoryId]);
  await c.query("INSERT INTO sla_events (organization_id, id, ticket_id, metric, kind, occurred_at) SELECT organization_id, gen_random_uuid(), id, 'first_response', 'breach', created_at + interval '1 hour' FROM tickets WHERE organization_id = $1 AND number % 7 = 0", [orgId]);
  await c.query("UPDATE organizations SET ticket_seq = $2 WHERE id = $1", [orgId, TICKETS]);
  await c.query("ANALYZE tickets; ANALYZE sla_events");

  const actor = { userId, organizationId: orgId, membershipId, role: "admin" as const };
  const day = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + offset * 86_400_000));
  const filters = { from: day(-89), to: day(0) };
  const first = await getDashboard(actor, filters); // aquecimento (conexão e planos)
  console.log(`Recebidos no período: ${first.received} · backlog ${first.backlog} · resolvidos ${first.resolved}`);
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    await getDashboard(actor, i % 2 ? { ...filters, teamId } : filters);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const p = (q: number) => times[Math.min(times.length - 1, Math.ceil(q * times.length) - 1)]!;
  console.log(`Execuções: ${RUNS} · p50 ${p(0.5).toFixed(0)} ms · p95 ${p(0.95).toFixed(0)} ms · máx ${times.at(-1)!.toFixed(0)} ms · meta p95 ≤ 3000 ms: ${p(0.95) <= 3000 ? "ATENDIDA" : "NÃO ATENDIDA"}`);
} catch (e) {
  console.error("Falha na medição:", (e as Error).message);
  process.exitCode = 1;
} finally {
  if (!process.argv.includes("--keep")) await cleanup();
  await c.end();
  process.exit(process.exitCode ?? 0);
}
