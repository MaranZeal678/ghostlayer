import { requireUser } from "@/lib/auth";
import { handle, HttpError } from "@/lib/http";
import { signState } from "@/lib/github";

/**
 * Dev-time helper: registers the GhostLayer GitHub App via GitHub's manifest flow.
 * Renders an auto-submitting form to github.com with minimal permissions.
 */
export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  if (process.env.NODE_ENV === "production") throw new HttpError(404, "Not available");
  const origin = new URL(req.url).origin;
  const org = new URL(req.url).searchParams.get("org");
  // The App serves production (callbacks, webhooks); the one-time credential handoff comes back to this local server.
  const pub = (process.env.GITHUB_APP_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, "");
  const isPublic = pub.startsWith("https://");
  const manifest = {
    name: `GhostLayer ${Math.random().toString(36).slice(2, 6)}`,
    url: pub,
    hook_attributes: { url: `${pub}/api/github/webhooks`, active: isPublic },
    redirect_url: `${origin}/api/github/manifest/callback`,
    callback_urls: [...new Set([`${pub}/api/github/callback`, `${origin}/api/github/callback`])],
    request_oauth_on_install: true,
    public: false,
    default_permissions: { metadata: "read", contents: "write", pull_requests: "write" },
    default_events: isPublic ? ["installation_target", "repository"] : [],
  };
  const action = org
    ? `https://github.com/organizations/${encodeURIComponent(org)}/settings/apps/new`
    : "https://github.com/settings/apps/new";
  const state = signState(user.id);
  const html = `<!doctype html><html><body style="background:#080911;color:#c4b5fd;font-family:system-ui;display:grid;place-items:center;height:100vh">
<form id="f" method="post" action="${action}?state=${encodeURIComponent(state)}">
<input type="hidden" name="manifest" value='${JSON.stringify(manifest).replace(/'/g, "&#39;")}'>
<p>Redirecting to GitHub to register the GhostLayer GitHub App…</p><noscript><button>Continue</button></noscript></form>
<script>document.getElementById('f').submit()</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html" } });
});
