import { requireScan, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ scanId: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const scan = await requireScan(user.id, (await params).scanId);
  const [agentRuns, findings] = await Promise.all([
    db.agentRun.findMany({ where: { scanId: scan.id }, orderBy: { startedAt: "asc" } }),
    db.finding.findMany({ where: { scanId: scan.id }, orderBy: { createdAt: "asc" } }),
  ]);
  return json({ scan, agentRuns, findings });
});
