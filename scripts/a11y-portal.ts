// CA-07.3: verificação automatizada de acessibilidade do portal (WCAG 2.1 A e AA) com axe-core.
// Uso: com a aplicação rodando (npm run dev ou npm start), npm run a11y:portal -- <slug> [BASE_URL]
// Falha se houver violação de impacto crítico ou grave. Limitação: em jsdom, o contraste de cores e o
// leiaute a 360 px não são avaliados pelo axe (ficam como "incompletos"); o leiaute é revisado à parte.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const slug = process.argv[2];
const base = process.argv[3] ?? "http://localhost:3000";
if (!slug) throw new Error("Informe o slug da organização (dados sintéticos).");
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

const pages = [`/p/${slug}`, `/p/${slug}/entrar`, `/p/${slug}/avaliar?t=x&r=1&s=x`, `/p/${slug}/acesso/token-sintetico-de-teste-000000`];
let blocking = 0;

for (const path of pages) {
  const res = await fetch(new URL(path, base));
  const html = await res.text();
  const dom = new JSDOM(html, { url: new URL(path, base).toString(), runScripts: "outside-only", pretendToBeVisual: true });
  dom.window.eval(axeSource);
  const axe = (dom.window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; impact: string; nodes: unknown[]; help: string }[]; incomplete: { id: string }[] }> } }).axe;
  const r = await axe.run(dom.window.document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
  const serious = r.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  blocking += serious.length;
  console.log(`${path} → HTTP ${res.status} · violações: ${r.violations.length} (críticas/graves: ${serious.length}) · incompletos: ${r.incomplete.map((i) => i.id).join(", ") || "nenhum"}`);
  for (const v of r.violations) console.log(`  - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} elemento(s))`);
  dom.window.close();
}
console.log(blocking ? `Resultado: ${blocking} violação(ões) crítica(s) ou grave(s).` : "Resultado: nenhuma violação crítica ou grave (CA-07.3).");
process.exit(blocking ? 1 : 0);
