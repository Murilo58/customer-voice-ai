import { timingSafeEqual } from "node:crypto";
import { defaultJobHandlers, scheduleMaintenance } from "@/server/jobs/handlers";
import { runPendingJobs } from "@/server/jobs/outbox";

// Varredor da outbox (ADR-006): processa jobs pendentes ou com trava expirada.
// Chamado pelo Vercel Cron (cabeçalho Authorization: Bearer CRON_SECRET). Sem segredo: 404.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < 32) return false;
  const got = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
  const exp = Buffer.from(expected);
  return got.length === exp.length && timingSafeEqual(got, exp);
}

async function handle(req: Request) {
  if (!authorized(req)) return new Response("Not Found", { status: 404 });
  await scheduleMaintenance();
  const result = await runPendingJobs(25, defaultJobHandlers());
  return Response.json({ claimed: result.claimed, results: result.results });
}

export const GET = handle;
export const POST = handle;
