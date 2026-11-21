import { requireProject, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle, HttpError, json } from "@/lib/http";
import { assertSafeTarget } from "@/lib/url-safety";
import { UpdateProjectSchema } from "@/lib/validators";
import { resolveAuthorizedRepo } from "@/lib/repos";

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const project = await requireProject(user.id, (await params).projectId);
  return json({ project });
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const project = await requireProject(user.id, (await params).projectId);
  const body = UpdateProjectSchema.parse(await req.json());
  if (body.websiteUrl) {
    try {
      await assertSafeTarget(body.websiteUrl);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
  }
  const repo =
    body.connectionId && body.repositoryId
      ? await resolveAuthorizedRepo(user.id, body.connectionId, body.repositoryId)
      : body.disconnectRepository
        ? { repositoryId: null, repositoryOwner: null, repositoryName: null, repositoryFullName: null, defaultBranch: null, githubInstallationId: null }
        : {};
  const updated = await db.project.update({
    where: { id: project.id },
    data: {
      name: body.name,
      description: body.description,
      websiteUrl: body.websiteUrl,
      maxActions: body.maxActions,
      status: body.status,
      ...repo,
    },
  });
  return json({ project: updated });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const project = await requireProject(user.id, (await params).projectId);
  // Cascades remove scans, findings, evidence, repairs and PR records (GitHub PRs themselves are untouched).
  await db.project.delete({ where: { id: project.id } });
  return json({ ok: true });
});
