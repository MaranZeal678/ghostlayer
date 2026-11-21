import { notFound } from "next/navigation";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { FindingView } from "@/components/finding/FindingView";

export const dynamic = "force-dynamic";

export default async function FindingPage({ params }: { params: Promise<{ projectId: string; findingId: string }> }) {
  const user = await pageUser();
  const { projectId, findingId } = await params;
  const finding = await db.finding.findFirst({ where: { id: findingId, projectId, project: { userId: user.id } }, include: { project: { select: { name: true, repositoryId: true } } } });
  if (!finding) notFound();
  const [evidence, repair] = await Promise.all([
    db.evidenceArtifact.findMany({
      where: { OR: [{ findingId }, { scanId: finding.scanId, type: "REPLAY" }] },
      orderBy: { createdAt: "asc" },
      select: { id: true, type: true, label: true, createdAt: true },
    }),
    db.repairAttempt.findFirst({ where: { findingId }, orderBy: { createdAt: "desc" }, include: { verification: true, pullRequest: true } }),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ser = (x: unknown): any => JSON.parse(JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  return <FindingView finding={ser(finding)} evidence={ser(evidence)} repair={ser(repair)} repoConnected={Boolean(finding.project.repositoryId)} />;
}
