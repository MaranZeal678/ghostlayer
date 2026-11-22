import { gunzipSync } from "node:zlib";
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
    const { credentialsForUser, withCredentials } = await import("@/lib/credentials");
    // Recordings live under the Solari key that made them: the owner's own key if they set one, else the default.
    const bytes = await withCredentials(await credentialsForUser(user.id), () => solariBrowsers().sessions.downloadReplay(sessionId)).catch(() => null);
    if (!bytes) throw new HttpError(404, "Session recording not available (Solari keeps recordings for a limited time)");
    let buf = Buffer.from(bytes);
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf); // recordings may arrive gzip-compressed
    return new Response(buf, {
      headers: {
        "content-type": "application/x-ndjson",
        "content-disposition": `attachment; filename="ghostlayer-${ev.label.toLowerCase().includes("investigator") ? "investigator" : "explorer"}-recording-${ev.id.slice(-6)}.rrweb.ndjson"`,
        "cache-control": "private, max-age=300",
      },
    });
  }
  if (!ev.content) throw new HttpError(404, "Evidence has no content");
  return new Response(Buffer.from(ev.content), {
    headers: { "content-type": ev.mimeType ?? "application/octet-stream", "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" },
  });
});
