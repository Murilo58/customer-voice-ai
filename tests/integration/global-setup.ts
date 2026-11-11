import "dotenv/config";
import pg from "pg";

/** Limpa o banco de testes antes da suíte. Recusa qualquer banco cujo nome não termine em _test. */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL_MIGRATOR;
  if (!url) throw new Error("TEST_DATABASE_URL_MIGRATOR não definida.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ db: string }>("SELECT current_database() AS db");
    if (!rows[0]?.db.endsWith("_test")) throw new Error(`Banco recusado para limpeza: ${rows[0]?.db}`);
    // A auditoria é somente inserção; a limpeza do banco de testes desativa o trigger só durante o TRUNCATE.
    await client.query("BEGIN");
    await client.query("ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_truncate");
    await client.query(`TRUNCATE notifications, sla_events, sla_policies, holidays, outbound_emails, onboarding_checklist, team_members, teams, jobs, platform_ai_budget, ai_quotas, ai_usage_events, triage_reviews, triage_runs, categories, reasons, ticket_events, ticket_messages, tickets, contacts, client_companies, audit_logs, user_invitations, memberships, organizations, organization_invitations,
      platform_admins, two_factors, verifications, accounts, sessions, users CASCADE`);
    await client.query("ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_truncate");
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}
