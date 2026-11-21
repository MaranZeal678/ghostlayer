import { requireRepair, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle } from "@/lib/http";
import { eventStream } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Ctx = { params: Promise<{ repairId: string }> };

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const repair = await requireRepair(user.id, (await params).repairId);
  return eventStream(
    req,
    { repairAttemptId: repair.id },
    async () => {
      const r = await db.repairAttempt.findUnique({ where: { id: repair.id }, include: { verification: true, pullRequest: true, agentRuns: { orderBy: { startedAt: "asc" } } } });
      return { repair: r };
    },
    (snap) => ["PR_CREATED", "REJECTED", "FAILED", "CANCELLED"].includes(((snap.repair as { status?: string }) ?? {}).status ?? ""),
  );
});
