import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { githubConfigured, listInstallationRepos } from "@/lib/github";

export const GET = handle(async () => {
  const user = await requireUser();
  if (!githubConfigured()) return json({ configured: false, connections: [] });
  const conns = await db.gitHubConnection.findMany({ where: { userId: user.id, status: "ACTIVE" } });
  const connections = await Promise.all(
    conns.map(async (c) => {
      try {
        return { id: c.id, login: c.githubLogin, account: c.installationAccountType, repos: await listInstallationRepos(c.installationId) };
      } catch (e) {
        return { id: c.id, login: c.githubLogin, account: c.installationAccountType, repos: [], error: String((e as Error).message).slice(0, 200) };
      }
    }),
  );
  return json({ configured: true, connections });
});
