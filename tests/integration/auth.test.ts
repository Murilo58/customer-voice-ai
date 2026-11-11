// Better Auth 1.7.14 + Prisma 7 (validação da ADR-004): IDs, senha, sessões e rotas expostas.
import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { getAuth } from "@/server/identity/auth";
import { GET, POST } from "@/app/api/auth/[...all]/route";

const password = "senha-sintetica-123";

async function signUp() {
  const email = `auth-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@exemplo.test`;
  const r = await getAuth().api.signUpEmail({ body: { name: "Teste Auth", email, password } });
  return { email, id: r.user.id };
}

async function signInCookie(email: string): Promise<string> {
  const { headers } = await getAuth().api.signInEmail({ body: { email, password }, returnHeaders: true });
  const cookie = headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  expect(cookie).toMatch(/cva\.session_token=/);
  return cookie;
}

const session = (cookie: string) => getAuth().api.getSession({ headers: new Headers({ cookie }) });

describe("Better Auth", () => {
  it("cria usuário com UUIDv7 e senha armazenada com hash", async () => {
    const { id } = await signUp();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const account = await getDb().account.findFirstOrThrow({ where: { userId: id, providerId: "credential" } });
    expect(account.password).toBeTruthy();
    expect(account.password).not.toContain(password);
  });

  it("recusa senha errada", async () => {
    const { email } = await signUp();
    await expect(getAuth().api.signInEmail({ body: { email, password: "errada-errada-123" } })).rejects.toThrow();
  });

  it("recusa senha com menos de 12 caracteres", async () => {
    await expect(getAuth().api.signUpEmail({ body: { name: "X", email: `curta-${Date.now()}@exemplo.test`, password: "curta" } })).rejects.toThrow();
  });

  it("CA-02.3: logout em todos os dispositivos invalida duas sessões simultâneas", async () => {
    const { email } = await signUp();
    const c1 = await signInCookie(email);
    const c2 = await signInCookie(email);
    expect(await session(c1)).not.toBeNull();
    expect(await session(c2)).not.toBeNull();
    await getAuth().api.revokeSessions({ headers: new Headers({ cookie: c1 }) });
    expect(await session(c1)).toBeNull();
    expect(await session(c2)).toBeNull();
  });

  it("expõe por HTTP só as rotas permitidas (cadastro público bloqueado)", async () => {
    const signUpReq = new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Intruso", email: "intruso@exemplo.test", password }),
    });
    expect((await POST(signUpReq)).status).toBe(404);
    expect((await POST(new Request("http://localhost:3000/api/auth/sign-in/email", { method: "POST", body: "{}" }))).status).toBe(404);
    expect((await GET(new Request("http://localhost:3000/api/auth/ok"))).status).toBe(200);
    expect(await getDb().user.count({ where: { email: "intruso@exemplo.test" } })).toBe(0);
  });
});
