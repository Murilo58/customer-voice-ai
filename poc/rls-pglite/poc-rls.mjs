// PoC 1 (parte local) — RLS com contexto local à transação.
// Escopo: validar o desenho SQL (políticas, set_config local, FKs compostas,
// reuso sequencial de conexão como no PgBouncer em modo transação).
// NÃO valida: pooler real do Neon, Prisma 7 + @prisma/adapter-neon, concorrência
// em funções Vercel. Esses itens ficam para a parte Neon da PoC.
// Dados 100% sintéticos.
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';

const results = [];
const record = (id, name, ok, detail = '') => {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${detail ? '  — ' + detail : ''}`);
};
const expectError = async (fn) => {
  try { await fn(); return null; } catch (e) { return e.message; }
};

const db = new PGlite();

// ---------- Setup (papel de migração, não superusuário) ----------
await db.exec(`
  CREATE ROLE app_migrator NOLOGIN;
  CREATE ROLE app_runtime NOLOGIN NOBYPASSRLS;
  GRANT CREATE, USAGE ON SCHEMA public TO app_migrator;
  GRANT USAGE ON SCHEMA public TO app_runtime;
`);
await db.exec(`SET ROLE app_migrator;`);
await db.exec(`
  CREATE TABLE organizations (
    id uuid PRIMARY KEY,
    name text NOT NULL
  );
  CREATE TABLE contacts (
    organization_id uuid NOT NULL REFERENCES organizations(id),
    id uuid NOT NULL,
    email text NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (organization_id, id),
    UNIQUE (organization_id, email)
  );
  CREATE TABLE tickets (
    organization_id uuid NOT NULL REFERENCES organizations(id),
    id uuid NOT NULL PRIMARY KEY,
    contact_id uuid NOT NULL,
    subject text NOT NULL,
    UNIQUE (organization_id, id),
    FOREIGN KEY (organization_id, contact_id) REFERENCES contacts (organization_id, id)
  );

  -- Contexto: NULLIF evita erro de cast quando a variável existe mas está vazia
  CREATE FUNCTION app_current_org() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT NULLIF(current_setting('app.org_id', true), '')::uuid $$;

  ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
  ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
  ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
  ALTER TABLE tickets FORCE ROW LEVEL SECURITY;

  CREATE POLICY org_self ON organizations
    USING (id = app_current_org()) WITH CHECK (id = app_current_org());
  CREATE POLICY tenant_isolation ON contacts
    USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
  CREATE POLICY tenant_isolation ON tickets
    USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());

  GRANT SELECT, INSERT, UPDATE, DELETE ON organizations, contacts, tickets TO app_runtime;
  GRANT EXECUTE ON FUNCTION app_current_org() TO app_runtime;
`);

// Seed como dono (migrator) com contexto definido por organização (FORCE RLS vale para o dono)
const A = randomUUID(), B = randomUUID();
const seed = async (org, name, n) => {
  await db.exec('BEGIN');
  await db.query(`SELECT set_config('app.org_id', $1, true)`, [org]);
  await db.query(`INSERT INTO organizations (id, name) VALUES ($1, $2)`, [org, name]);
  const contacts = [];
  for (let i = 0; i < n; i++) {
    const c = randomUUID(); contacts.push(c);
    await db.query(`INSERT INTO contacts (organization_id, id, email) VALUES ($1,$2,$3)`, [org, c, `c${i}@${name}.test`]);
    await db.query(`INSERT INTO tickets (organization_id, id, contact_id, subject) VALUES ($1,$2,$3,$4)`, [org, randomUUID(), c, `Assunto ${name} ${i}`]);
  }
  await db.exec('COMMIT');
  return contacts;
};
const contactsA = await seed(A, 'orga', 30);
const contactsB = await seed(B, 'orgb', 20);

// T-OWNER: dono da tabela sem contexto também é bloqueado graças ao FORCE
{
  const r = await db.query(`SELECT count(*)::int AS n FROM tickets`);
  record('T-OWNER', 'FORCE RLS: dono da tabela sem contexto não vê linhas', r.rows[0].n === 0, `linhas=${r.rows[0].n}`);
}

// A partir daqui: papel de runtime (como a conexão da aplicação)
await db.exec(`RESET ROLE; SET ROLE app_runtime;`);

const withTenant = async (orgId, fn) => {
  await db.exec('BEGIN');
  try {
    await db.query(`SELECT set_config('app.org_id', $1, true)`, [orgId]);
    const out = await fn();
    await db.exec('COMMIT');
    return out;
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
};
const count = async (table) => (await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;

// T1 isolamento básico
{
  const a = await withTenant(A, () => count('tickets'));
  const b = await withTenant(B, () => count('tickets'));
  record('T1', 'Cada tenant vê apenas seus chamados', a === 30 && b === 20, `A=${a} B=${b}`);
}

// T2 falha fechada (sem contexto)
{
  const n = await count('tickets');
  const err = await expectError(() => db.query(`INSERT INTO contacts (organization_id, id, email) VALUES ($1,$2,'x@x.test')`, [A, randomUUID()]));
  record('T2', 'Sem contexto: zero linhas e insert recusado', n === 0 && !!err, `linhas=${n}; insert=${err ? 'recusado' : 'ACEITO'}`);
}

// T3 filtro esquecido em UPDATE em massa
{
  const updated = await withTenant(A, async () => (await db.query(`UPDATE tickets SET subject = subject || ' *'`)).affectedRows);
  const bTouched = await withTenant(B, async () => (await db.query(`SELECT count(*)::int AS n FROM tickets WHERE subject LIKE '% *'`)).rows[0].n);
  record('T3', 'UPDATE sem WHERE afeta só o tenant do contexto', updated === 30 && bTouched === 0, `afetadas=${updated}; B alteradas=${bTouched}`);
}

// T4 WITH CHECK: gravar linha de outro tenant / mover linha de tenant
{
  const e1 = await expectError(() => withTenant(A, () => db.query(`INSERT INTO contacts (organization_id, id, email) VALUES ($1,$2,'intruso@x.test')`, [B, randomUUID()])));
  const e2 = await expectError(() => withTenant(A, () => db.query(`UPDATE contacts SET organization_id = $1 WHERE id = $2`, [B, contactsA[0]])));
  record('T4', 'WITH CHECK impede inserir ou mover dados para outro tenant', !!e1 && !!e2, `insert=${e1 ? 'recusado' : 'ACEITO'}; update=${e2 ? 'recusado' : 'ACEITO'}`);
}

// T5 FK composta: chamado da org A referenciando contato da org B
{
  const e = await expectError(() => withTenant(A, () => db.query(`INSERT INTO tickets (organization_id, id, contact_id, subject) VALUES ($1,$2,$3,'cruzado')`, [A, randomUUID(), contactsB[0]])));
  record('T5', 'FK composta recusa referência a contato de outro tenant', !!e, e ? e.split('\n')[0] : 'ACEITO');
}

// T6 contexto não sobrevive ao COMMIT (reuso da conexão pelo pooler)
{
  await withTenant(A, () => count('tickets'));
  const after = await count('tickets');
  const setting = (await db.query(`SELECT current_setting('app.org_id', true) AS v`)).rows[0].v;
  record('T6', 'Após COMMIT, a conexão reutilizada não carrega o contexto', after === 0, `linhas=${after}; valor residual=${JSON.stringify(setting)}`);
}

// T6b achado: sem NULLIF, o cast de '' para uuid quebra (falha fechada por erro)
{
  const e = await expectError(() => db.query(`SELECT current_setting('app.org_id', true)::uuid`));
  record('T6b', "Sem NULLIF, valor residual '' gera erro de cast (justifica app_current_org())", !!e, e ? e.split('\n')[0] : 'sem erro');
}

// T7 rollback após erro limpa o contexto
{
  await expectError(() => withTenant(A, async () => { await count('tickets'); throw new Error('falha simulada'); }));
  const after = await count('tickets');
  record('T7', 'Erro no meio da transação: rollback e nenhum contexto residual', after === 0, `linhas=${after}`);
}

// T8 reuso sequencial intenso alternando tenants na mesma conexão
{
  let leaks = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) {
    const org = i % 2 === 0 ? A : B;
    const rows = await withTenant(org, async () => (await db.query(`SELECT DISTINCT organization_id FROM tickets`)).rows);
    if (rows.length !== 1 || rows[0].organization_id !== org) leaks++;
  }
  record('T8', `${N} transações alternando tenants na mesma conexão sem vazamento`, leaks === 0, `vazamentos=${leaks}`);
}

// T9 controle negativo: set_config de SESSÃO (is_local=false) vaza para a próxima transação
{
  await db.exec('BEGIN');
  await db.query(`SELECT set_config('app.org_id', $1, false)`, [A]);
  await db.exec('COMMIT');
  const leaked = await count('tickets');
  await db.query(`SELECT set_config('app.org_id', '', false)`);
  record('T9', 'Controle negativo: contexto de sessão vaza (por isso é proibido)', leaked === 30, `linhas visíveis sem contexto local=${leaked}`);
}

// T10 transação com múltiplas escritas mantém o contexto até o fim
{
  const ok = await withTenant(A, async () => {
    const c = randomUUID();
    await db.query(`INSERT INTO contacts (organization_id, id, email) VALUES ($1,$2,$3)`, [A, c, `novo-${c}@orga.test`]);
    await db.query(`INSERT INTO tickets (organization_id, id, contact_id, subject) VALUES ($1,$2,$3,'multi')`, [A, randomUUID(), c]);
    return (await db.query(`SELECT app_current_org() AS o`)).rows[0].o === A;
  });
  record('T10', 'Várias escritas na mesma transação mantêm o contexto', ok === true);
}

// T11 custo relativo (indicativo apenas; PGlite em processo não representa rede/pooler)
{
  const N = 500;
  let t0 = performance.now();
  for (let i = 0; i < N; i++) await withTenant(A, () => db.query(`SELECT id FROM tickets LIMIT 5`));
  const withCtx = (performance.now() - t0) / N;
  await db.exec(`RESET ROLE; SET ROLE app_migrator;`);
  await db.exec(`ALTER TABLE tickets NO FORCE ROW LEVEL SECURITY;`);
  t0 = performance.now();
  for (let i = 0; i < N; i++) await db.query(`SELECT id FROM tickets WHERE organization_id = $1 LIMIT 5`, [A]);
  const plain = (performance.now() - t0) / N;
  await db.exec(`ALTER TABLE tickets FORCE ROW LEVEL SECURITY; RESET ROLE;`);
  record('T11', 'Sobrecarga local de BEGIN + set_config + COMMIT (indicativo)', true, `com contexto=${withCtx.toFixed(3)} ms; consulta simples=${plain.toFixed(3)} ms`);
}

const failed = results.filter(r => !r.ok).length;
console.log(`\nResumo: ${results.length - failed}/${results.length} aprovados`);
console.log(JSON.stringify({ engine: 'PGlite ' + (await db.query('select version()')).rows[0].version, results }, null, 2));
process.exit(failed ? 1 : 0);
