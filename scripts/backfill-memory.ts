/** One-off: copy Verifier-approved repairs into the verified-fix memory. */
import { db } from "@/lib/db";
import { saveFix, treeOf } from "@/lib/memory";

const repairs = await db.repairAttempt.findMany({
  where: { verification: { approved: true }, baseSha: { not: null }, diff: { not: null } },
  include: { finding: true, project: true, verification: true },
});
for (const r of repairs) {
  if (!r.project.repositoryFullName || !r.project.githubInstallationId) continue;
  const v = r.verification!;
  const meta = (r.meta ?? {}) as { prTitle?: string; branchSlug?: string };
  const stored = (v.checks ?? {}) as { checks?: { name: string; passed: boolean | null; detail: string }[]; verdict?: unknown };
  const afterId = (v.evidenceReferences as string[] | null)?.[1];
  const after = afterId ? await db.evidenceArtifact.findUnique({ where: { id: afterId }, select: { content: true } }) : null;
  const treeSha = await treeOf(r.project.githubInstallationId, r.project.repositoryFullName, r.baseSha!);
  await saveFix({
    repositoryFullName: r.project.repositoryFullName,
    treeSha,
    fingerprint: r.finding.fingerprint,
    diff: r.diff!,
    files: r.files,
    rootCause: r.rootCause,
    patchSummary: r.patchSummary,
    prTitle: meta.prTitle,
    branchSlug: meta.branchSlug,
    verification: {
      checks: stored.checks ?? [],
      verdict: stored.verdict ?? null,
      testsOk: v.existingTestsPassed,
      buildOk: v.buildPassed,
      patchedOk: v.patchedFlowPassed,
      regressionOk: v.regressionTestsPassed,
      afterShotJpeg: after?.content ? Buffer.from(after.content).toString("base64") : undefined,
      verifiedAt: (v.completedAt ?? new Date()).toISOString(),
    },
  });
  console.log("saved", r.finding.fingerprint, treeSha.slice(0, 7));
}
process.exit(0);
