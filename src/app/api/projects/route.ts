import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle, HttpError, json } from "@/lib/http";
import { assertSafeTarget } from "@/lib/url-safety";
import { CreateProjectSchema } from "@/lib/validators";
import { resolveAuthorizedRepo } from "@/lib/repos";

export const GET = handle(async () => {
  const user = await requireUser();
  const projects = await db.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: { scans: { orderBy: { createdAt: "desc" }, take: 1 }, _count: { select: { findings: true, pullRequests: true } } },
  });
  return json({ projects });
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const body = CreateProjectSchema.parse(await req.json());
  try {
    await assertSafeTarget(body.websiteUrl);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const repo = body.connectionId && body.repositoryId ? await resolveAuthorizedRepo(user.id, body.connectionId, body.repositoryId) : {};
  const project = await db.project.create({
    data: {
      userId: user.id,
      name: body.name,
      description: body.description ?? null,
      websiteUrl: body.websiteUrl,
      authorizedAt: new Date(),
      ...repo,
    },
  });
  return json({ project }, { status: 201 });
});
