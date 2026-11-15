// Identificador de organização: sugestão a partir do nome, digitação livre e orientação de formato.
import { describe, expect, it } from "vitest";
import { SLUG_RE, slugify, slugifyTyping, slugProblem } from "@/lib/slug";
import { classifyRecipients } from "@/server/email/inbound/parse";

describe("slugify (sugestão e normalização no servidor)", () => {
  it.each([
    ["Orizon", "orizon"],
    ["  Orizon Projetos  ", "orizon-projetos"],
    ["Ação & Cia. Ltda.", "acao-cia-ltda"],
    ["São João/Matriz_01", "sao-joao-matriz-01"],
    ["--Loja--Demo--", "loja-demo"],
    ["Café 😀 Gourmet", "cafe-gourmet"],
  ])("%s -> %s", (input, out) => {
    expect(slugify(input)).toBe(out);
    expect(SLUG_RE.test(out)).toBe(true);
  });

  it("limita a 48 caracteres sem terminar em hífen", () => {
    const s = slugify(`${"a".repeat(47)} b`);
    expect(s).toBe("a".repeat(47));
    expect(SLUG_RE.test(s)).toBe(true);
  });

  it("nome sem letras ou números não gera identificador válido", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugProblem(slugify("!!!"))).not.toBeNull();
  });

  it("resultado válido serve para endereço, e-mail da organização e prefixo de chamados", () => {
    for (const name of ["Orizon", "Ação & Cia.", "Loja 24h"]) {
      const s = slugify(name);
      expect(encodeURIComponent(s)).toBe(s);
      expect(s.replace(/-/g, "").slice(0, 6).toUpperCase()).toMatch(/^[A-Z0-9]+$/);
      expect(classifyRecipients([`${s}@in.exemplo.test`], "in.exemplo.test")).toEqual([{ kind: "org", slug: s }]);
    }
  });
});

describe("slugifyTyping (campo editável)", () => {
  it("normaliza enquanto digita, mantendo o hífen final", () => {
    expect(slugifyTyping("Orizon ")).toBe("orizon-");
    expect(slugifyTyping("Orizon P")).toBe("orizon-p");
    expect(slugifyTyping("ÉXITO_1")).toBe("exito-1");
    expect(slugifyTyping(" -abc")).toBe("abc");
  });
});

describe("slugProblem (mensagens em vez da validação genérica do navegador)", () => {
  it("orienta conforme o problema", () => {
    expect(slugProblem("")).toMatch(/Informe o identificador/);
    expect(slugProblem("ab")).toMatch(/pelo menos 3/);
    expect(slugProblem("orizon-")).toMatch(/letras sem acento/);
    expect(slugProblem("orizon")).toBeNull();
  });
});
