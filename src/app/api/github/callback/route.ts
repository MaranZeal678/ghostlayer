import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { githubApp, userCanAccessInstallation, verifyState } from "@/lib/github";

/**
 * GitHub App install callback (request_oauth_on_install). We exchange the code for a user token and confirm
 * via GET /user/installations that THIS GitHub user can access the installation before linking it.
 */
export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const installationId = Number(url.searchParams.get("installation_id"));
  const state = url.searchParams.get("state");
  if (!code || !installationId) throw new HttpError(400, "Missing code or installation_id");
  // Installations started outside GhostLayer have no signed state: restart through our install flow instead of linking.
  if (!state) return Response.redirect(new URL("/api/github/install", url.origin), 302);
  if (verifyState(state) !== user.id) throw new HttpError(403, "Invalid state");
  const { authentication } = await githubApp().oauth.createToken({ code });
  const { match, me } = await userCanAccessInstallation(authentication.token, installationId);
  if (!match) throw new HttpError(403, "Your GitHub account cannot access that installation");
  const account = match.account as { login?: string; type?: string; name?: string } | null;
  await db.gitHubConnection.upsert({
    where: { userId_installationId: { userId: user.id, installationId: BigInt(installationId) } },
    update: { status: "ACTIVE", githubLogin: me.login, githubAccountId: String(me.id) },
    create: {
      userId: user.id,
      installationId: BigInt(installationId),
      githubLogin: me.login,
      githubAccountId: String(me.id),
      installationAccountType: `${account?.type ?? "User"}:${account?.login ?? account?.name ?? ""}`,
    },
  });
  return Response.redirect(new URL("/dashboard/connections?connected=1", url.origin), 302);
});
