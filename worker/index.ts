/**
 * GhostLayer worker — consumes the durable Postgres job queue.
 * Long-running agent work lives here, never inside an HTTP request; a browser refresh can't cancel a scan.
 * Run: pnpm worker
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const { db } = await import("@/lib/db");
  // The local worker processes jobs itself, so it must not also wake the serverless worker.
  process.env.WORKER_DISABLE_KICK = "1";
  const { claimNext, reapStaleJobs } = await import("@/lib/queue");
  const { processJob } = await import("@/lib/jobs");

  const reaped = await reapStaleJobs();
  if (reaped.count) console.log(`[worker] marked ${reaped.count} stale job(s) failed`);
  console.log("[worker] GhostLayer worker ready — waiting for jobs");

  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
    console.log("[worker] stopping after current job…");
  });

  const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 2);
  let active = 0;

  async function handle(job: NonNullable<Awaited<ReturnType<typeof claimNext>>>) {
    // Pick up credentials added while the worker runs (e.g. GitHub App created via the setup page).
    config({ path: ".env.local", override: true, quiet: true });
    await processJob(job);
  }
  setInterval(() => void reapStaleJobs(5).catch(() => {}), 60_000);

  while (!stopping) {
    if (active >= CONCURRENCY) {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    const job = await claimNext().catch((e) => {
      console.error("[worker] queue error", e);
      return null;
    });
    if (!job) {
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    active++;
    void handle(job).finally(() => active--);
  }
  while (active > 0) await new Promise((r) => setTimeout(r, 500));
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
