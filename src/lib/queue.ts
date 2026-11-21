import { db } from "./db";
import type { JobKind, Job } from "@/generated/prisma/client";

/** Idempotent enqueue: the same idempotencyKey never creates a second job. */
export async function enqueue(kind: JobKind, targetId: string, idempotencyKey: string) {
  const job = await db.job.upsert({
    where: { idempotencyKey },
    update: {},
    create: { kind, targetId, idempotencyKey },
  });
  const { kickWorker } = await import("./jobs");
  await kickWorker();
  return job;
}

/** Claim one runnable job atomically (safe with multiple workers). */
export async function claimNext(): Promise<Job | null> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE "Job" SET status = 'RUNNING', "lockedAt" = now(), attempts = attempts + 1, "updatedAt" = now()
    WHERE id = (
      SELECT id FROM "Job"
      WHERE status = 'QUEUED' AND "runAfter" <= now()
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id`;
  if (!rows.length) return null;
  return db.job.findUnique({ where: { id: rows[0].id } });
}

/** Jobs left RUNNING by a crashed worker are failed on startup so their records surface the error. */
export async function reapStaleJobs(olderThanMinutes = 20) {
  const stale = await db.job.findMany({
    where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - olderThanMinutes * 60_000) } },
  });
  if (!stale.length) return { count: 0 };
  const msg = "Worker stopped while the job was running";
  await db.job.updateMany({ where: { id: { in: stale.map((j) => j.id) } }, data: { status: "FAILED", lastError: msg } });
  const ids = (k: string) => stale.filter((j) => j.kind === k).map((j) => j.targetId);
  await db.scan.updateMany({
    where: { id: { in: ids("SCAN") }, status: { in: ["QUEUED", "INITIALIZING", "EXPLORING", "INVESTIGATING"] } },
    data: { status: "FAILED", errorMessage: msg, completedAt: new Date() },
  });
  await db.repairAttempt.updateMany({
    where: { id: { in: ids("REPAIR") }, status: { in: ["QUEUED", "PREPARING", "DIAGNOSING", "PATCHING", "TESTING", "VERIFYING"] } },
    data: { status: "FAILED", errorMessage: msg, completedAt: new Date() },
  });
  await db.repairAttempt.updateMany({ where: { id: { in: ids("PUBLISH") }, status: "PUBLISHING" }, data: { status: "READY_FOR_REVIEW", errorMessage: msg } });
  return { count: stale.length };
}

/** Heartbeat so long-running jobs are not mistaken for stale ones. */
export async function heartbeat(jobId: string) {
  await db.job.update({ where: { id: jobId }, data: { lockedAt: new Date() } }).catch(() => {});
}
