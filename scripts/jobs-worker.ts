// Worker de desenvolvimento: processa a outbox em laço (equivalente local da fila + varredor).
// Uso: npm run jobs:work   (Ctrl+C para parar)
import "dotenv/config";
import { defaultJobHandlers, scheduleMaintenance } from "@/server/jobs/handlers";
import { runPendingJobs } from "@/server/jobs/outbox";

const handlers = defaultJobHandlers();
let stop = false;
process.on("SIGINT", () => (stop = true));

while (!stop) {
  await scheduleMaintenance();
  const { claimed, results } = await runPendingJobs(10, handlers);
  if (claimed) console.log(`[jobs] ${claimed} job(s): ${results.join(", ")}`);
  await new Promise((r) => setTimeout(r, 3000));
}
process.exit(0);
