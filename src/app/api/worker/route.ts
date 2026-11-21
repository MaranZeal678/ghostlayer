import { after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { claimNext, reapStaleJobs } from "@/lib/queue";
import { kickWorker, processJob } from "@/lib/jobs";

/**
 * Serverless worker: claims ONE job from the durable Postgres queue, acknowledges immediately,
 * and runs the agent phase in after() (bounded by maxDuration). Each phase is designed to finish
 * well inside the limit; when it completes, it wakes the worker again to drain the queue.
 */
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const secret = process.env.WORKER_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return Boolean(secret) && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function POST(req: Request) {
  if (!authorized(req)) return new Response("unauthorized", { status: 401 });
  await reapStaleJobs(6).catch(() => {});
  const job = await claimNext();
  if (!job) return new Response(null, { status: 204 });
  after(async () => {
    await processJob(job);
    await kickWorker();
  });
  return Response.json({ claimed: job.kind, id: job.id }, { status: 202 });
}
