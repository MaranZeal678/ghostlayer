import { requireFinding, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle, HttpError, json } from "@/lib/http";
import { enqueue } from "@/lib/queue";
import { githubConfigured } from "@/lib/github";

type Ctx = { params: Promise<{ findingId: string }> };
const ACTIVE = ["QUEUED", "PREPARING", "DIAGNOSING", "PATCHING", "TESTING", "VERIFYING", "PUBLISHING"] as const;

export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const finding = await requireFinding(user.id, (await params).findingId);
  if (!finding.project.repositoryId || !finding.project.githubInstallationId)
    throw new HttpError(400, "Connect a GitHub repository to this project to enable automated repair");
  if (!githubConfigured()) throw new HttpError(400, "The GhostLayer GitHub App is not configured on this server");
  if (finding.confidence !== "CONFIRMED" && finding.confidence !== "REPRODUCED")
    throw new HttpError(400, "Only reproduced findings can be sent to autonomous repair");
  const active = await db.repairAttempt.findFirst({ where: { findingId: finding.id, status: { in: [...ACTIVE] } } });
  if (active) return json({ repair: active, reused: true });
  const done = await db.repairAttempt.findFirst({ where: { findingId: finding.id, status: { in: ["READY_FOR_REVIEW", "PR_CREATED"] } } });
  if (done) return json({ repair: done, reused: true });
  const repair = await db.repairAttempt.create({ data: { findingId: finding.id, projectId: finding.projectId } });
  await enqueue("REPAIR", repair.id, `repair:${repair.id}`);
  return json({ repair }, { status: 201 });
});
