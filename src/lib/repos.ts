import { db } from "./db";
import { HttpError } from "./http";
import { listInstallationRepos } from "./github";

/** Resolve a repo the user may connect: their own active connection + a repo the installation can access. */
export async function resolveAuthorizedRepo(userId: string, connectionId: string, repositoryId: number) {
  const conn = await db.gitHubConnection.findFirst({ where: { id: connectionId, userId, status: "ACTIVE" } });
  if (!conn) throw new HttpError(404, "GitHub connection not found");
  const repos = await listInstallationRepos(conn.installationId);
  const repo = repos.find((r) => r.id === repositoryId);
  if (!repo) throw new HttpError(403, "This repository is not accessible to the GhostLayer GitHub App installation");
  return {
    repositoryId: BigInt(repo.id),
    repositoryOwner: repo.owner,
    repositoryName: repo.name,
    repositoryFullName: repo.fullName,
    defaultBranch: repo.defaultBranch,
    githubInstallationId: conn.installationId,
  };
}
