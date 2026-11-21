import { requireProject, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle, HttpError, json } from "@/lib/http";
import { enqueue } from "@/lib/queue";

type Ctx = { params: Promise<{ projectId: string }> };
const ACTIVE = ["QUEUED", "INITIALIZING", "EXPLORING", "INVESTIGATING"] as const;

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const project = await requireProject(user.id, (await params).projectId);
  const scans = await db.scan.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, take: 50, omit: { graph: true } });
  return json({ scans });
});

export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const project = await requireProject(user.id, (await params).projectId);
  if (project.status !== "ACTIVE") throw new HttpError(400, "Project is archived");
  if (!project.authorizedAt) throw new HttpError(403, "Confirm authorization to test this website first");
  // One active scan per project: repeated clicks return the running scan instead of starting another.
  const running = await db.scan.findFirst({ where: { projectId: project.id, status: { in: [...ACTIVE] } } });
  if (running) return json({ scan: running, reused: true });
  // Basic rate limit: max 10 scans/hour per user.
  const recent = await db.scan.count({ where: { project: { userId: user.id }, createdAt: { gt: new Date(Date.now() - 3600_000) } } });
  if (recent >= 10) throw new HttpError(429, "Scan limit reached (10 per hour)");
  const scan = await db.scan.create({ data: { projectId: project.id } });
  await enqueue("SCAN", scan.id, `scan:${scan.id}`);
  await db.project.update({ where: { id: project.id }, data: { updatedAt: new Date() } });
  return json({ scan }, { status: 201 });
});
