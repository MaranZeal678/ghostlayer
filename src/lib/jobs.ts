/**
 * Shared job runner used by both the long-lived local worker (worker/index.ts) and the
 * serverless worker route (/api/worker) on Vercel. Each job is one short agent phase.
 */
import { db } from "./db";
import { emit } from "./events";
import { heartbeat } from "./queue";
import type { Job } from "@/generated/prisma/client";

export async function processJob(job: Job) {
  console.log(`[worker] ▶ ${job.kind} ${job.targetId}`);
  const beat = setInterval(() => void heartbeat(job.id), 60_000);
  try {
    const { runScan, runInvestigate } = await import("@/agents/scan");
    const { runRepair, runVerify } = await import("@/agents/repair");
    const { runPublish } = await import("@/agents/publisher");
    if (job.kind === "SCAN") await runScan(job.targetId);
    else if (job.kind === "INVESTIGATE") await runInvestigate(job.targetId);
    else if (job.kind === "REPAIR") await runRepair(job.targetId);
    else if (job.kind === "VERIFY") await runVerify(job.targetId);
    else if (job.kind === "PUBLISH") await runPublish(job.targetId);
    await db.job.update({ where: { id: job.id }, data: { status: "DONE" } });
    console.log(`[worker] ✓ ${job.kind} ${job.targetId}`);
  } catch (err) {
    const msg = String((err as Error).message ?? err).slice(0, 1000);
    console.error(`[worker] ✗ ${job.kind} ${job.targetId}: ${msg}`);
    await db.job.update({ where: { id: job.id }, data: { status: "FAILED", lastError: msg } });
    if (job.kind === "SCAN" || job.kind === "INVESTIGATE") {
      await db.scan
        .update({ where: { id: job.targetId }, data: { status: job.kind === "INVESTIGATE" ? "PARTIALLY_COMPLETED" : "FAILED", errorMessage: msg, completedAt: new Date() } })
        .catch(() => {});
      await emit({ scanId: job.targetId }, null, "scan.failed", msg).catch(() => {});
    } else if (job.kind === "REPAIR" || job.kind === "VERIFY") {
      await db.repairAttempt.update({ where: { id: job.targetId }, data: { status: "FAILED", errorMessage: msg, completedAt: new Date() } }).catch(() => {});
      await emit({ repairAttemptId: job.targetId }, null, "repair.failed", msg).catch(() => {});
    } else {
      await db.repairAttempt
        .updateMany({ where: { id: job.targetId, status: "PUBLISHING" }, data: { status: "READY_FOR_REVIEW", errorMessage: `Publish failed: ${msg}` } })
        .catch(() => {});
      await emit({ repairAttemptId: job.targetId }, null, "publish.failed", msg).catch(() => {});
    }
  } finally {
    clearInterval(beat);
  }
}

function workerUrl() {
  if (process.env.WORKER_URL) return process.env.WORKER_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/worker`;
  if (process.env.NEXT_PUBLIC_APP_URL) return `${process.env.NEXT_PUBLIC_APP_URL}/api/worker`;
  return null;
}

/** Wake the serverless worker. It replies immediately and runs the job in the background (after()). */
export async function kickWorker() {
  const url = workerUrl();
  if (!url || !process.env.WORKER_SECRET || process.env.WORKER_DISABLE_KICK === "1") return;
  await fetch(url, { method: "POST", headers: { authorization: `Bearer ${process.env.WORKER_SECRET}` }, signal: AbortSignal.timeout(8000) }).catch((e) =>
    console.warn("[worker] kick failed:", String(e).slice(0, 120)),
  );
}
