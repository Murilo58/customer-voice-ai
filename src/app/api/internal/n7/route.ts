import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";

// Medição obrigatória do N7 (ADR-002; decisão do responsável em 10/11/2026): sobrecarga p95 da
// transação com contexto versus consulta simples, executada a partir de uma função na Vercel.
// Desativada (404) se N7_TOKEN não estiver definido. Usa somente uma organização sintética.

export const dynamic = "force-dynamic";

const pct = (arr: number[], p: number) => [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))]!;

function authorized(req: Request): boolean {
  const expected = process.env.N7_TOKEN;
  if (!expected || expected.length < 32) return false;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return new Response("Not Found", { status: 404 });
  const organizationId = new URL(req.url).searchParams.get("orgId") ?? "";
  const n = 200;
  const db = getDb();
  await db.$queryRaw`SELECT 1`; // aquecimento
  const plain: number[] = [];
  const ctx: number[] = [];
  for (let i = 0; i < n; i++) {
    let t0 = performance.now();
    await db.organization.findMany({ take: 5 });
    plain.push(performance.now() - t0);
    t0 = performance.now();
    await withTenant({ organizationId }, (tx) => tx.organization.findMany({ take: 5 }));
    ctx.push(performance.now() - t0);
  }
  const overhead = pct(ctx, 95) - pct(plain, 95);
  return Response.json({
    test: "N7",
    region: process.env.VERCEL_REGION ?? "local",
    driver: process.env.DATABASE_DRIVER ?? "neon",
    iterations: n,
    plainMs: { p50: pct(plain, 50), p95: pct(plain, 95) },
    contextMs: { p50: pct(ctx, 50), p95: pct(ctx, 95) },
    overheadP95Ms: overhead,
    criterionMs: 15,
    pass: overhead <= 15,
    measuredAt: new Date().toISOString(),
  });
}
