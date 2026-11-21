import { requireScan, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ scanId: string }> };

export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const scan = await requireScan(user.id, (await params).scanId);
  if (["COMPLETED", "FAILED", "CANCELLED", "PARTIALLY_COMPLETED"].includes(scan.status)) return json({ scan });
  const updated = await db.scan.update({ where: { id: scan.id }, data: { status: "CANCELLED" } });
  await db.job.updateMany({ where: { targetId: scan.id, status: "QUEUED" }, data: { status: "CANCELLED" } });
  await emit({ scanId: scan.id }, null, "scan.cancel_requested", "Cancellation requested; agents will stop after their current action");
  return json({ scan: updated });
});
