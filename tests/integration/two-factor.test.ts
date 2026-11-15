// Ativação do 2FA pelo Better Auth (plugin twoFactor): configuração pendente não vale como 2FA ativo, reiniciar
// substitui a chave e os códigos pendentes, e os códigos de recuperação só são lidos após a confirmação.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { getAuth } from "@/server/identity/auth";
import { manualKeyFromUri, totpSetupView } from "@/server/identity/totp-setup";

const password = "senha-sintetica-123";

/** TOTP (RFC 6238, SHA-1, 6 dígitos, 30 s) calculado a partir da chave base32 exibida ao usuário. */
function totp(base32: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of base32.replace(/\s/g, "")) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function signedInUser() {
  const email = `tfa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@exemplo.test`;
  const r = await getAuth().api.signUpEmail({ body: { name: "Teste 2FA", email, password } });
  return { id: r.user.id, email, headers: await signIn(email) };
}

async function signIn(email: string): Promise<Headers> {
  const { headers } = await getAuth().api.signInEmail({ body: { email, password }, returnHeaders: true });
  return new Headers({ cookie: headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") });
}

async function enable(headers: Headers) {
  const r = await getAuth().api.enableTwoFactor({ body: { password }, headers });
  if (r.method !== "totp") throw new Error("esperado TOTP");
  return r;
}

const state = async (userId: string) => ({
  user: await getDb().user.findUniqueOrThrow({ where: { id: userId }, select: { twoFactorEnabled: true } }),
  tf: await getDb().twoFactor.findFirst({ where: { userId }, select: { verified: true, secret: true, backupCodes: true } }),
});

describe("apresentação da configuração TOTP", () => {
  it("gera QR Code SVG e chave manual em blocos, sem expor o URI", async () => {
    const uri = "otpauth://totp/VoxDesk%20AI:a%40exemplo.test?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=VoxDesk%20AI";
    const v = await totpSetupView(uri);
    expect(v.qrSvg).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
    expect(v.qrSvg).not.toContain("otpauth");
    expect(v.manualKey).toBe("JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP");
    expect(() => manualKeyFromUri("https://exemplo.test/?secret=ABC")).toThrow();
  });
});

describe("ativação do 2FA (Better Auth)", () => {
  it("configuração pendente não ativa o 2FA: login segue sem segundo fator", async () => {
    const u = await signedInUser();
    await enable(u.headers);
    const s = await state(u.id);
    expect(s.user.twoFactorEnabled).toBe(false);
    expect(s.tf?.verified).toBe(false);
    const login = await getAuth().api.signInEmail({ body: { email: u.email, password } });
    expect("twoFactorRedirect" in login && login.twoFactorRedirect).toBeFalsy();
  });

  it("reiniciar substitui a chave e os códigos pendentes; o código da chave antiga deixa de valer", async () => {
    const u = await signedInUser();
    const first = await enable(u.headers);
    const before = await state(u.id);
    const second = await enable(u.headers);
    const after = await state(u.id);
    expect(after.tf!.secret).not.toBe(before.tf!.secret);
    expect(after.tf!.backupCodes).not.toBe(before.tf!.backupCodes);
    expect(second.backupCodes.some((c) => first.backupCodes.includes(c))).toBe(false);
    const oldKey = manualKeyFromUri(first.totpURI);
    await expect(getAuth().api.verifyTOTP({ body: { code: totp(oldKey) }, headers: u.headers })).rejects.toThrow();
    expect((await state(u.id)).user.twoFactorEnabled).toBe(false);
  });

  it("código correto ativa; os códigos de recuperação lidos depois são os da configuração ativa", async () => {
    const u = await signedInUser();
    const r = await enable(u.headers);
    const good = totp(manualKeyFromUri(r.totpURI));
    await expect(getAuth().api.verifyTOTP({ body: { code: good === "000000" ? "111111" : "000000" }, headers: u.headers })).rejects.toThrow();
    expect((await state(u.id)).user.twoFactorEnabled).toBe(false);
    await getAuth().api.verifyTOTP({ body: { code: good }, headers: u.headers });
    const s = await state(u.id);
    expect(s.user.twoFactorEnabled).toBe(true);
    expect(s.tf?.verified).toBe(true);
    const codes = await getAuth().api.viewBackupCodes({ body: { userId: u.id } });
    expect([...codes.backupCodes].sort()).toEqual([...r.backupCodes].sort());
    const login = await getAuth().api.signInEmail({ body: { email: u.email, password } });
    expect("twoFactorRedirect" in login && login.twoFactorRedirect).toBe(true);
  });

  it("com 2FA ativo, não é possível gerar outra chave sem desativar", async () => {
    const u = await signedInUser();
    const r = await enable(u.headers);
    const v = await getAuth().api.verifyTOTP({ body: { code: totp(manualKeyFromUri(r.totpURI)) }, headers: u.headers, returnHeaders: true });
    const rotated = new Headers({ cookie: v.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") });
    expect((await getAuth().api.getSession({ headers: rotated }))?.user.id).toBe(u.id);
    await expect(enable(rotated)).rejects.toThrow(/already enabled/i);
    expect((await state(u.id)).tf?.verified).toBe(true);
  });
});
