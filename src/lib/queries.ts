import { db } from "./db";
import type { ProjectCardData } from "@/components/dashboard/ProjectCard";

export async function projectCards(userId: string, includeArchived = false): Promise<ProjectCardData[]> {
  const projects = await db.project.findMany({
    where: { userId, ...(includeArchived ? {} : { status: "ACTIVE" }) },
    orderBy: { updatedAt: "desc" },
    include: {
      scans: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, status: true } },
      _count: { select: { pullRequests: true } },
      findings: { where: { verificationStatus: { notIn: ["PR_OPENED"] } }, select: { id: true } },
    },
  });
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    websiteUrl: p.websiteUrl,
    repositoryFullName: p.repositoryFullName,
    lastScanAt: p.scans[0]?.createdAt.toISOString() ?? null,
    lastScanStatus: p.scans[0]?.status ?? null,
    openFindings: p.findings.length,
    prs: p._count.pullRequests,
    status: p.status,
  }));
}
