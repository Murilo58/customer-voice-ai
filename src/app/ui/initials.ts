/** Iniciais para avatar (primeira e última palavra que começam com letra). */
export function initials(name: string): string {
  const parts = name.split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}
