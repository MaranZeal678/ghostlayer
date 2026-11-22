import { z } from "zod";
import { requireProject, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle, HttpError, json } from "@/lib/http";
import { isDemoProject, resetDemo } from "@/lib/demo-reset";

type Ctx = { params: Promise<{ projectId: string }> };
const Body = z.object({ clearHistory: z.boolean().default(true) });

/** Owner-only: reset the demo repository (and optionally this project's history) to the seeded-bug baseline. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const project = await requireProject(user.id, (await params).projectId);
  if (!isDemoProject(project)) throw new HttpError(400, "Revert is only available for the configured demo repository");
  const { clearHistory } = Body.parse(await req.json().catch(() => ({})));
  const busy = await db.scan.count({ where: { projectId: project.id, status: { in: ["QUEUED", "INITIALIZING", "EXPLORING", "INVESTIGATING"] } } });
  const busyRepairs = await db.repairAttempt.count({ where: { projectId: project.id, status: { in: ["QUEUED", "PREPARING", "DIAGNOSING", "PATCHING", "TESTING", "VERIFYING", "PUBLISHING"] } } });
  if (busy || busyRepairs) throw new HttpError(409, "A scan or repair is still running for this project. Wait for it to finish (or cancel the scan) and revert again.");
  try {
    const summary = await resetDemo(project, { clearHistory });
    return json({ summary });
  } catch (e) {
    throw new HttpError(502, `Revert failed: ${String((e as Error).message ?? e).slice(0, 200)}`);
  }
});
