import { promises as fs } from "node:fs";
import path from "node:path";
import { requireUser } from "@/lib/auth";
import { handle, HttpError } from "@/lib/http";
import { verifyState } from "@/lib/github";

/** Completes the manifest flow and stores the App credentials in .env.local (dev only; never sent to the browser). */
export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  if (process.env.NODE_ENV === "production") throw new HttpError(404, "Not available");
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code) throw new HttpError(400, "Missing code");
  if (!state || verifyState(state) !== user.id) throw new HttpError(403, "Invalid state");
  const res = await fetch(`https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: "POST",
    headers: { accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new HttpError(502, `GitHub conversion failed (${res.status})`);
  const app = (await res.json()) as { id: number; slug: string; client_id: string; client_secret: string; pem: string; webhook_secret: string | null };
  const values: Record<string, string> = {
    GITHUB_APP_ID: String(app.id),
    GITHUB_APP_SLUG: app.slug,
    GITHUB_APP_CLIENT_ID: app.client_id,
    GITHUB_APP_CLIENT_SECRET: app.client_secret,
    GITHUB_APP_PRIVATE_KEY: `"${app.pem.trim().replace(/\n/g, "\\n")}"`,
    GITHUB_WEBHOOK_SECRET: app.webhook_secret ?? "",
  };
  const envPath = path.join(process.cwd(), ".env.local");
  let text = await fs.readFile(envPath, "utf8").catch(() => "");
  for (const [k, v] of Object.entries(values)) {
    const line = `${k}=${v}`;
    text = new RegExp(`^${k}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${k}=.*$`, "m"), () => line) : `${text.trimEnd()}\n${line}\n`;
    process.env[k] = k === "GITHUB_APP_PRIVATE_KEY" ? app.pem : v;
  }
  await fs.writeFile(envPath, text, { mode: 0o600 });
  return Response.redirect(new URL("/dashboard/connections?app=created", url.origin), 302);
});
