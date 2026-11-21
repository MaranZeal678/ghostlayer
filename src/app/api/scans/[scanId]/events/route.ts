import { requireScan, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle } from "@/lib/http";
import { eventStream } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Ctx = { params: Promise<{ scanId: string }> };
const TERMINAL = ["COMPLETED", "FAILED", "CANCELLED", "PARTIALLY_COMPLETED"];

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const scan = await requireScan(user.id, (await params).scanId);
  return eventStream(
    req,
    { scanId: scan.id },
    async () => {
      const [s, agentRuns, findings, repairs] = await Promise.all([
        db.scan.findUnique({ where: { id: scan.id } }),
        db.agentRun.findMany({ where: { OR: [{ scanId: scan.id }, { repairAttempt: { finding: { scanId: scan.id } } }] }, orderBy: { startedAt: "asc" } }),
        db.finding.findMany({ where: { scanId: scan.id }, orderBy: { createdAt: "asc" }, include: { repairs: { orderBy: { createdAt: "desc" }, take: 1, include: { pullRequest: true, verification: true } } } }),
        db.repairAttempt.findMany({ where: { finding: { scanId: scan.id }, status: { notIn: ["PR_CREATED", "REJECTED", "FAILED", "CANCELLED", "READY_FOR_REVIEW"] } }, select: { id: true } }),
      ]);
      return { scan: s, agentRuns, findings, activeRepairs: repairs.length };
    },
    (snap) => {
      const s = (snap.scan as { status?: string; completedAt?: string | null }) ?? {};
      return TERMINAL.includes(s.status ?? "") && Boolean(s.completedAt) && (snap.activeRepairs as number) === 0;
    },
  );
});
