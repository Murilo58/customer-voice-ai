// Verificação estática das regras de segurança da ADR-002 e da POC_RESULTS (seção 6).
// Uso: node scripts/check-security.mjs [diretório-raiz]
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.argv[2] ?? process.cwd();
const rel = (p) => relative(root, p).split(sep).join("/");

const RULES = [
  { id: "raw-unsafe", re: /\$(queryRaw|executeRaw)Unsafe\b/, msg: "$queryRawUnsafe/$executeRawUnsafe são proibidos (SQL injection)." },
  { id: "session-context", re: /set_config\s*\([^)]*,\s*false\s*\)/, msg: "set_config de sessão (false) vaza contexto no pooler (PoC T9)." },
  { id: "prisma-client", re: /new\s+PrismaClient\s*\(/, allow: ["src/server/db/client.ts"], msg: "Instancie o PrismaClient só em src/server/db/client.ts." },
  { id: "rls-context", re: /set_config\s*\(|app\.org_id/, allow: ["src/server/db/tenant.ts"], msg: "O contexto de RLS só pode ser definido em src/server/db/tenant.ts." },
  { id: "public-secret", re: /NEXT_PUBLIC_[A-Z0-9_]*(SECRET|KEY|TOKEN|PASSWORD)/, msg: "Segredos não podem usar o prefixo NEXT_PUBLIC_." },
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "generated" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

const violations = [];
for (const file of walk(join(root, "src"))) {
  const text = readFileSync(file, "utf8");
  for (const rule of RULES) {
    if (rule.allow?.includes(rel(file))) continue;
    text.split(/\r?\n/).forEach((line, i) => {
      if (rule.re.test(line)) violations.push(`${rel(file)}:${i + 1} [${rule.id}] ${rule.msg}`);
    });
  }
}

// Artefatos de agentes instalados sem solicitação (ex.: prisma init)
for (const artifact of ["skills-lock.json", ".windsurf", ".agents"]) {
  if (existsSync(join(root, artifact))) violations.push(`${artifact} [agent-artifact] Artefato de agente não aprovado no repositório.`);
}
for (const dir of ["src", "prisma", "scripts"]) {
  if (existsSync(join(root, dir, ".claude"))) violations.push(`${dir}/.claude [agent-artifact] Artefato de agente não aprovado.`);
}

if (violations.length) {
  console.error(`Verificação de segurança: ${violations.length} violação(ões)\n` + violations.join("\n"));
  process.exit(1);
}
console.log("Verificação de segurança: OK");
