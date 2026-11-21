import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";

type Ctx = { params: Promise<{ evidenceId: string }> };

/** Authenticated evidence access: the artifact must belong (via scan/finding/repair) to the caller's project. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const id = (await params).evidenceId;
  const ev = await db.evidenceArtifact.findFirst({
    where: {
      id,
      OR: [{ scan: { project: { userId: user.id } } }, { finding: { project: { userId: user.id } } }, { repairAttempt: { project: { userId: user.id } } }],
    },
  });
  if (!ev) throw new HttpError(404, "Evidence not found");
  if (ev.storageReference?.startsWith("solari-replay:")) {
    const sessionId = ev.storageReference.slice("solari-replay:".length);
    const { solariBrowsers } = await import("@/lib/solari");
    const bytes = await solariBrowsers().sessions.downloadReplay(sessionId).catch(() => null);
    if (!bytes) throw new HttpError(404, "Replay not available yet (or expired)");
    return new Response(Buffer.from(bytes), { headers: { "content-type": "application/x-ndjson", "cache-control": "private, max-age=300" } });
  }
  if (!ev.content) throw new HttpError(404, "Evidence has no content");
  return new Response(Buffer.from(ev.content), {
    headers: { "content-type": ev.mimeType ?? "application/octet-stream", "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" },
  });
});
