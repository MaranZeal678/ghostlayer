import "server-only";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "./db";
import { HttpError } from "./http";

/** Resolve the signed-in Clerk user to our User row. Never trusts a client-supplied id. */
export async function requireUser() {
  const { userId } = await auth();
  if (!userId) throw new HttpError(401, "Not signed in");
  const existing = await db.user.findUnique({ where: { clerkUserId: userId } });
  if (existing) return existing;
  const cu = await currentUser();
  return db.user.upsert({
    where: { clerkUserId: userId },
    update: {},
    create: {
      clerkUserId: userId,
      email: cu?.primaryEmailAddress?.emailAddress ?? null,
      displayName: cu?.firstName ?? cu?.username ?? null,
      avatarUrl: cu?.imageUrl ?? null,
    },
  });
}

/** Ownership-scoped loaders. Return 404 (not 403) so ids can't be probed. */
export async function requireProject(userId: string, projectId: string) {
  const p = await db.project.findFirst({ where: { id: projectId, userId } });
  if (!p) throw new HttpError(404, "Project not found");
  return p;
}

export async function requireScan(userId: string, scanId: string) {
  const s = await db.scan.findFirst({ where: { id: scanId, project: { userId } }, include: { project: true } });
  if (!s) throw new HttpError(404, "Scan not found");
  return s;
}

export async function requireFinding(userId: string, findingId: string) {
  const f = await db.finding.findFirst({ where: { id: findingId, project: { userId } }, include: { project: true } });
  if (!f) throw new HttpError(404, "Finding not found");
  return f;
}

export async function requireRepair(userId: string, repairId: string) {
  const r = await db.repairAttempt.findFirst({
    where: { id: repairId, project: { userId } },
    include: { project: true, finding: true, verification: true, pullRequest: true },
  });
  if (!r) throw new HttpError(404, "Repair not found");
  return r;
}

/** For server components: redirect to sign-in instead of throwing. */
export async function pageUser() {
  const user = await requireUser().catch((e) => {
    if (e instanceof HttpError && e.status === 401) return null;
    throw e;
  });
  if (!user) redirect("/sign-in");
  return user;
}
