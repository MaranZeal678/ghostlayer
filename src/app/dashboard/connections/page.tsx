import { ShieldCheck, KeyRound, ExternalLink } from "lucide-react";
import { GithubIcon as Github } from "@/components/ui/Logo";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { githubConfigured, listInstallationRepos } from "@/lib/github";
import { Badge, Card, buttonVariants } from "@/components/ui/primitives";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await pageUser();
  const sp = await searchParams;
  const configured = githubConfigured() && Boolean(process.env.GITHUB_APP_SLUG);
  const conns = await db.gitHubConnection.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  const withRepos = await Promise.all(
    conns.map(async (c) => {
      if (!configured || c.status !== "ACTIVE") return { c, repos: [], error: null as string | null };
      try {
        return { c, repos: await listInstallationRepos(c.installationId), error: null };
      } catch (e) {
        return { c, repos: [], error: String((e as Error).message).slice(0, 160) };
      }
    }),
  );
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">GitHub connections</h1>
        <p className="text-sm text-muted">
          Repository access is granted to the GhostLayer GitHub App, separately from how you sign in. Signing in with GitHub never gives GhostLayer write access.
        </p>
      </div>
      {sp.app === "created" && <div className="rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">GitHub App registered and saved to .env.local. Now install it on the repositories GhostLayer may repair.</div>}
      {sp.connected && <div className="rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">Installation verified and connected.</div>}

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/5">
              <Github size={20} />
            </div>
            <div>
              <h2 className="font-medium text-ink">GhostLayer GitHub App</h2>
              <p className="text-sm text-muted">{configured ? `Configured as "${process.env.GITHUB_APP_SLUG}"` : "Not configured on this server yet"}</p>
              <ul className="mt-3 space-y-1 text-xs text-muted">
                <li className="flex items-center gap-2"><ShieldCheck size={12} className="text-emerald" /> Metadata: read · Contents: read &amp; write · Pull requests: read &amp; write</li>
                <li className="flex items-center gap-2"><KeyRound size={12} className="text-lavender" /> Short-lived, single-repo tokens minted per job; sandboxes only get read-only tokens</li>
                <li className="flex items-center gap-2"><ShieldCheck size={12} className="text-emerald" /> Fixes go to new branches as draft PRs — never the default branch, never auto-merged</li>
              </ul>
            </div>
          </div>
          {configured ? (
            <a href="/api/github/install" className={buttonVariants({})}>
              <Github size={16} /> {conns.length ? "Add repositories / installation" : "Connect GitHub"}
            </a>
          ) : process.env.NODE_ENV !== "production" ? (
            <a href="/api/github/manifest" className={buttonVariants({})}>
              Register GitHub App (one click)
            </a>
          ) : (
            <Badge tone="amber">Ask an admin to configure the GitHub App</Badge>
          )}
        </div>
      </Card>

      {withRepos.map(({ c, repos, error }) => (
        <Card key={c.id} className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-ink">{c.installationAccountType.split(":")[1] || c.githubLogin}</div>
              <div className="text-xs text-muted">
                Installation {c.installationId.toString()} · verified for @{c.githubLogin} · {timeAgo(c.createdAt)}
              </div>
            </div>
            <Badge tone={c.status === "ACTIVE" ? "emerald" : "coral"}>{c.status.toLowerCase()}</Badge>
          </div>
          {error && <p className="mt-3 text-sm text-coral">{error}</p>}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {repos.map((r) => (
              <a key={r.id} href={r.htmlUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-line p-3 text-sm hover:border-line-strong">
                <span className="truncate">{r.fullName}</span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {r.private ? "private" : "public"} · {r.defaultBranch} <ExternalLink size={12} />
                </span>
              </a>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
