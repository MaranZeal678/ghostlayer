import { App, Octokit } from "octokit";
import { createHmac, timingSafeEqual } from "node:crypto";

export function githubConfigured() {
  return Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
}

let app: App | null = null;
export function githubApp() {
  if (!githubConfigured()) throw new Error("GitHub App is not configured (GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY)");
  app ??= new App({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    oauth:
      process.env.GITHUB_APP_CLIENT_ID && process.env.GITHUB_APP_CLIENT_SECRET
        ? { clientId: process.env.GITHUB_APP_CLIENT_ID, clientSecret: process.env.GITHUB_APP_CLIENT_SECRET }
        : undefined,
    webhooks: process.env.GITHUB_WEBHOOK_SECRET ? { secret: process.env.GITHUB_WEBHOOK_SECRET } : undefined,
  });
  return app;
}

export async function installationOctokit(installationId: number | bigint) {
  return githubApp().getInstallationOctokit(Number(installationId));
}

/**
 * Mint a short-lived installation token narrowed to ONE repository and the given permissions.
 * The sandbox only ever receives a read-only token; write tokens stay in the worker.
 */
export async function scopedRepoToken(
  installationId: number | bigint,
  repositoryId: number | bigint,
  permissions: Record<string, "read" | "write">,
) {
  const { data } = await githubApp().octokit.request("POST /app/installations/{installation_id}/access_tokens", {
    installation_id: Number(installationId),
    repository_ids: [Number(repositoryId)],
    permissions,
  });
  return data.token;
}

export async function listInstallationRepos(installationId: number | bigint) {
  const octo = await installationOctokit(installationId);
  const repos = await octo.paginate("GET /installation/repositories", { per_page: 100 });
  return repos.map((r) => ({
    id: r.id,
    name: r.name,
    owner: r.owner.login,
    fullName: r.full_name,
    private: r.private,
    language: r.language,
    defaultBranch: r.default_branch,
    htmlUrl: r.html_url,
    updatedAt: r.updated_at,
  }));
}

/** Confirm (with the user's own OAuth token) that this GitHub user can access the installation. */
export async function userCanAccessInstallation(userToken: string, installationId: number) {
  const octo = new Octokit({ auth: userToken });
  const installs = await octo.paginate("GET /user/installations", { per_page: 100 });
  const match = installs.find((i) => i.id === installationId);
  const { data: me } = await octo.request("GET /user");
  return { match, me };
}

/** HMAC-signed state for the install round-trip (binds the callback to the Clerk user who started it). */
export function signState(payload: string) {
  const secret = process.env.CLERK_SECRET_KEY ?? "dev";
  const ts = Date.now().toString(36);
  const mac = createHmac("sha256", secret).update(`${payload}.${ts}`).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${ts}.${mac}`;
}

export function verifyState(state: string, maxAgeMs = 30 * 60_000): string | null {
  const [p, ts, mac] = state.split(".");
  if (!p || !ts || !mac) return null;
  const payload = Buffer.from(p, "base64url").toString();
  const expected = createHmac("sha256", process.env.CLERK_SECRET_KEY ?? "dev").update(`${payload}.${ts}`).digest("base64url");
  if (expected.length !== mac.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
  if (Date.now() - parseInt(ts, 36) > maxAgeMs) return null;
  return payload;
}
