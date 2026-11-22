import { notFound } from "next/navigation";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProjectView } from "@/components/dashboard/ProjectView";
import { isDemoProject } from "@/lib/demo-reset";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await pageUser();
  const { projectId } = await params;
  const project = await db.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!project) notFound();
  const [scans, findings, repairs, prs] = await Promise.all([
    db.scan.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 30, omit: { graph: true } }),
    db.finding.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: { repairs: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true } } },
    }),
    db.repairAttempt.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, createdAt: true, completedAt: true, patchSummary: true, attempt: true, errorMessage: true, finding: { select: { id: true, title: true } }, verification: { select: { approved: true } }, pullRequest: { select: { githubUrl: true, githubNumber: true } } },
    }),
    db.pullRequest.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } }),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ser = (x: unknown): any => JSON.parse(JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  return <ProjectView project={ser(project)} scans={ser(scans)} findings={ser(findings)} repairs={ser(repairs)} prs={ser(prs)} isDemo={isDemoProject(project)} />;
}
