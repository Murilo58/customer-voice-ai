import { toNextJsHandler } from "better-auth/next-js";
import { getAuth, PUBLIC_AUTH_PATHS } from "@/server/identity/auth";

// Só as rotas da lista ficam expostas por HTTP. Cadastro (apenas por convite), login e 2FA
// passam por server actions auditadas.
function allowed(req: Request): boolean {
  const path = new URL(req.url).pathname.replace(/^\/api\/auth/, "");
  return PUBLIC_AUTH_PATHS.has(path);
}

const notFound = () => new Response("Not Found", { status: 404 });

export async function GET(req: Request) {
  return allowed(req) ? toNextJsHandler(getAuth()).GET(req) : notFound();
}

export async function POST(req: Request) {
  return allowed(req) ? toNextJsHandler(getAuth()).POST(req) : notFound();
}
