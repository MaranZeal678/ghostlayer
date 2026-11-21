import { requireRepair, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle, HttpError, json } from "@/lib/http";
import { enqueue } from "@/lib/queue";

type Ctx = { params: Promise<{ repairId: string }> };

/** Human approval gate: publishing only happens when the signed-in owner clicks Publish. */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const repair = await requireRepair(user.id, (await params).repairId);
  if (repair.pullRequest) return json({ pullRequest: repair.pullRequest, reused: true });
  if (repair.status === "PUBLISHING") return json({ ok: true, pending: true }, { status: 202 });
  if (repair.status !== "READY_FOR_REVIEW" || !repair.verification?.approved)
    throw new HttpError(400, "Only verified repairs awaiting review can be published");
  if (!repair.project.githubInstallationId || !repair.project.repositoryOwner || !repair.project.repositoryName)
    throw new HttpError(400, "Connect the repository before publishing");
  if (!Array.isArray(repair.files) || !repair.files.length) throw new HttpError(400, "Repair has no file changes");
  await db.repairAttempt.update({ where: { id: repair.id }, data: { status: "PUBLISHING", errorMessage: null } });
  // Idempotency key per repair: retries never create a second PR job while one is pending/done.
  const existing = await db.job.findUnique({ where: { idempotencyKey: `publish:${repair.id}` } });
  if (existing && existing.status === "FAILED") await db.job.update({ where: { id: existing.id }, data: { status: "QUEUED", runAfter: new Date() } });
  else await enqueue("PUBLISH", repair.id, `publish:${repair.id}`);
  return json({ ok: true }, { status: 202 });
});
