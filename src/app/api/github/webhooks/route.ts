import { db } from "@/lib/db";
import { githubApp, githubConfigured } from "@/lib/github";

/** Installation/permission sync. Signature is verified before anything is read. */
export async function POST(req: Request) {
  if (!githubConfigured() || !process.env.GITHUB_WEBHOOK_SECRET) return new Response("not configured", { status: 503 });
  const body = await req.text();
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  const ok = await githubApp().webhooks.verify(body, sig).catch(() => false);
  if (!ok) return new Response("bad signature", { status: 401 });
  const event = req.headers.get("x-github-event");
  const payload = JSON.parse(body);
  const installationId = payload.installation?.id ? BigInt(payload.installation.id) : null;
  if (!installationId) return new Response("ok");
  if (event === "installation" && (payload.action === "deleted" || payload.action === "suspend")) {
    await db.gitHubConnection.updateMany({ where: { installationId }, data: { status: payload.action === "deleted" ? "REVOKED" : "SUSPENDED" } });
  } else if (event === "installation" && payload.action === "unsuspend") {
    await db.gitHubConnection.updateMany({ where: { installationId }, data: { status: "ACTIVE" } });
  } else if (event === "installation_repositories" && payload.action === "removed") {
    const ids = (payload.repositories_removed ?? []).map((r: { id: number }) => BigInt(r.id));
    await db.project.updateMany({
      where: { githubInstallationId: installationId, repositoryId: { in: ids } },
      data: { repositoryId: null, repositoryOwner: null, repositoryName: null, repositoryFullName: null, githubInstallationId: null },
    });
  } else if (event === "repository" && payload.action === "deleted") {
    await db.project.updateMany({
      where: { repositoryId: BigInt(payload.repository.id) },
      data: { repositoryId: null, repositoryOwner: null, repositoryName: null, repositoryFullName: null, githubInstallationId: null },
    });
  } else if (event === "repository" && payload.action === "edited" && payload.changes?.default_branch) {
    await db.project.updateMany({ where: { repositoryId: BigInt(payload.repository.id) }, data: { defaultBranch: payload.repository.default_branch } });
  }
  return new Response("ok");
}
