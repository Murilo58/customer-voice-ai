import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { messageFor } from "@/lib/messages";
import { generateToken, hashToken, maskDetails, newId, normalizeEmail, SLUG_RE, slugify } from "@/lib/security";
import { can, invitationState } from "@/server/organizations/permissions";

describe("tokens", () => {
  it("gera token de 256 bits e persiste apenas o hash SHA-256", () => {
    const { token, tokenHash } = generateToken();
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(tokenHash);
    expect(generateToken().token).not.toBe(token);
  });

  it("gera UUIDv7 ordenável", () => {
    const a = newId();
    const b = newId();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(a[14]).toBe("7");
    expect(a < b).toBe(true);
  });
});

describe("normalização", () => {
  it("e-mail em minúsculas e sem espaços", () => expect(normalizeEmail("  Fulano@Exemplo.TEST ")).toBe("fulano@exemplo.test"));
  it("slug a partir do nome", () => {
    expect(slugify("Loja São João & Cia.")).toBe("loja-sao-joao-cia");
    expect(SLUG_RE.test("loja-sao-joao-cia")).toBe(true);
    expect(SLUG_RE.test("-x")).toBe(false);
    expect(SLUG_RE.test("ab")).toBe(false);
  });
});

describe("mascaramento da auditoria", () => {
  it("remove chaves sensíveis e reduz e-mails, inclusive aninhados", () => {
    expect(maskDetails({ password: "x", token: "y", nested: { email: "maria@exemplo.test", otp: "123456" }, role: "agent", errorCode: "E1" })).toEqual({
      password: "[removido]", token: "[removido]", nested: { email: "m***@exemplo.test", otp: "[removido]" }, role: "agent", errorCode: "E1",
    });
  });
});

describe("permissões", () => {
  it("só Administrador gerencia membros e lê auditoria", () => {
    expect(can("admin", "members.manage")).toBe(true);
    expect(can("manager", "members.manage")).toBe(false);
    expect(can("agent", "members.manage")).toBe(false);
    expect(can("agent", "audit.read")).toBe(false);
  });

  it("estado do convite", () => {
    const future = new Date(Date.now() + 60_000);
    const past = new Date(Date.now() - 1);
    expect(invitationState({ expiresAt: future, revokedAt: null })).toBe("valid");
    expect(invitationState({ expiresAt: past, revokedAt: null })).toBe("expired");
    expect(invitationState({ expiresAt: future, acceptedAt: new Date(), revokedAt: null })).toBe("used");
    expect(invitationState({ expiresAt: future, usedAt: new Date(), revokedAt: null })).toBe("used");
    expect(invitationState({ expiresAt: future, revokedAt: new Date() })).toBe("revoked");
  });
});

describe("mensagens", () => {
  it("códigos desconhecidos viram mensagem genérica (sem refletir texto da URL)", () => {
    expect(messageFor("<script>alert(1)</script>")).toBe(messageFor("unexpected"));
    expect(messageFor(undefined)).toBeNull();
  });
});

describe("verificação estática de segurança", () => {
  const run = (root: string) => {
    try {
      execFileSync(process.execPath, ["scripts/check-security.mjs", root], { stdio: "pipe" });
      return 0;
    } catch {
      return 1;
    }
  };

  it("aprova o código atual", () => expect(run(process.cwd())).toBe(0));

  it("reprova contexto de sessão, SQL cru inseguro e artefatos de agentes", () => {
    for (const [file, content] of [
      ["src/a.ts", "await tx.$queryRaw`SELECT set_config('app.org_id', ${id}, false)`;"],
      ["src/b.ts", "await db.$executeRawUnsafe(sql);"],
      ["src/c.ts", "const db = new PrismaClient();"],
    ] as const) {
      const root = mkdtempSync(join(tmpdir(), "cva-sec-"));
      mkdirSync(join(root, "src"));
      writeFileSync(join(root, file), content);
      expect(run(root)).toBe(1);
    }
    const root = mkdtempSync(join(tmpdir(), "cva-sec-"));
    writeFileSync(join(root, "skills-lock.json"), "{}");
    expect(run(root)).toBe(1);
  });
});

describe("protocolo (RN-01)", async () => {
  const { formatProtocol, parseProtocol } = await import("@/lib/labels");
  it("formata e interpreta protocolos", () => {
    expect(formatProtocol("ACME", 123)).toBe("ACME-000123");
    expect(parseProtocol("ACME-000123")).toBe(123);
    expect(parseProtocol("acme-000123")).toBe(123);
    expect(parseProtocol(" 42 ")).toBe(42);
    expect(parseProtocol("0")).toBeNull();
    expect(parseProtocol("texto livre")).toBeNull();
    expect(parseProtocol("1; DROP TABLE")).toBeNull();
  });
});
