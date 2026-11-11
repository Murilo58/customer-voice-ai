// Define LOGIN e senha do papel app_runtime (criado NOLOGIN pela migration).
// Executar com a conexão do dono do schema, depois de `prisma migrate deploy`.
// Não remove nem recria o papel: troca a senha (achado da PoC no Neon).
import "dotenv/config";
import pg from "pg";

const url = process.argv.includes("--test") ? process.env.TEST_DATABASE_URL_MIGRATOR : process.env.DATABASE_URL_MIGRATOR;
const password = process.env.APP_RUNTIME_PASSWORD;
if (!url) throw new Error("Defina DATABASE_URL_MIGRATOR (ou TEST_DATABASE_URL_MIGRATOR com --test).");
if (!password || !/^[A-Za-z0-9]{24,128}$/.test(password)) {
  throw new Error("APP_RUNTIME_PASSWORD deve ter de 24 a 128 caracteres alfanuméricos.");
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rows } = await client.query("SELECT rolbypassrls FROM pg_roles WHERE rolname = 'app_runtime'");
  if (rows.length === 0) throw new Error("Papel app_runtime inexistente: execute as migrations antes.");
  if (rows[0].rolbypassrls) throw new Error("app_runtime não pode ter BYPASSRLS.");
  // A senha foi validada como alfanumérica acima; ALTER ROLE não aceita parâmetros.
  await client.query(`ALTER ROLE app_runtime LOGIN NOBYPASSRLS PASSWORD '${password}'`);
  console.log("app_runtime: LOGIN habilitado e senha definida.");
} finally {
  await client.end();
}
