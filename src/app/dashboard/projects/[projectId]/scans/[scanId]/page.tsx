import { notFound } from "next/navigation";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ScanView } from "@/components/scan/ScanView";

export const dynamic = "force-dynamic";

export default async function ScanPage({ params }: { params: Promise<{ projectId: string; scanId: string }> }) {
  const user = await pageUser();
  const { projectId, scanId } = await params;
  const scan = await db.scan.findFirst({ where: { id: scanId, projectId, project: { userId: user.id } }, include: { project: true } });
  if (!scan) notFound();
  return <ScanView projectId={projectId} scanId={scanId} projectName={scan.project.name} websiteUrl={scan.project.websiteUrl} repoConnected={Boolean(scan.project.repositoryId)} />;
}
