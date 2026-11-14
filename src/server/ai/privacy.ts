// Bloqueio técnico de privacidade (DP-01; RIA-17). Até a aprovação jurídica, a IA só processa organizações
// explicitamente autorizadas para testes com dados sintéticos. Vale para triagem e sugestão de resposta,
// independentemente do botão "Ativar" em Configurações (que continua necessário).
//
// AI_SYNTHETIC_ORGS: slugs ou ids separados por vírgula. Vazia ou ausente: nenhuma organização (falha fechada).
// "*" autoriza todas, mas só com o provedor simulado (desenvolvimento e testes): com o Gemini, é ignorado.

export function aiAuthorizedForOrg(org: { id: string; slug: string }, env: Record<string, string | undefined> = process.env): boolean {
  const list = (env.AI_SYNTHETIC_ORGS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.includes(org.slug) || list.includes(org.id)) return true;
  return list.includes("*") && (env.AI_PROVIDER || "simulated") === "simulated";
}
