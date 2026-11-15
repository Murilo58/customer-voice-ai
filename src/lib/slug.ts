// Identificador de organização (usado no endereço /o/{slug}, no e-mail {slug}@ e no prefixo dos chamados).
// Sem dependências de servidor: usado também no navegador (sugestão a partir do nome).

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;

/** Converte texto livre em identificador: minúsculas, sem acentos, espaços e símbolos viram hífen. */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

/** Versão para digitação: igual a slugify, mas mantém o hífen final para o usuário continuar digitando. */
export function slugifyTyping(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .slice(0, 48);
}

/** Orientação para um identificador fora do formato (null quando válido). */
export function slugProblem(slug: string): string | null {
  if (!slug) return "Informe o identificador da organização (ex.: minha-empresa).";
  if (slug.length < 3) return "O identificador precisa ter pelo menos 3 caracteres.";
  if (!SLUG_RE.test(slug)) return "Use apenas letras sem acento, números e hífens, começando e terminando com letra ou número.";
  return null;
}
