import { requireUser } from "@/lib/auth";
import { handle, HttpError } from "@/lib/http";
import { githubConfigured, signState } from "@/lib/github";

export const GET = handle(async () => {
  const user = await requireUser();
  if (!githubConfigured() || !process.env.GITHUB_APP_SLUG) throw new HttpError(400, "GitHub App not configured — set it up first");
  const state = signState(user.id);
  return Response.redirect(`https://github.com/apps/${process.env.GITHUB_APP_SLUG}/installations/new?state=${encodeURIComponent(state)}`, 302);
});
