/**
 * GitHub Publisher: turns an approved repair into a DRAFT pull request on a new branch.
 * Never touches the default branch, never merges. Idempotent across retries.
 */
import { db } from "@/lib/db";
import { emit, finishAgentRun, startAgentRun } from "@/lib/events";
import { installationOctokit } from "@/lib/github";
import { describeStep, type Step } from "./harness";

export async function runPublish(repairId: string) {
  const repair = await db.repairAttempt.findUnique({
    where: { id: repairId },
    include: { finding: true, project: true, verification: true, pullRequest: true },
  });
  if (!repair) throw new Error("Repair not found");
  if (repair.pullRequest) return repair.pullRequest; // idempotent
  const { project, finding, verification } = repair;
  const scope = { repairAttemptId: repairId, scanId: finding.scanId };
  if (!verification?.approved) throw new Error("Only verified, approved repairs can be published");
  if (!project.githubInstallationId || !project.repositoryOwner || !project.repositoryName)
    throw new Error("Repository is not connected");
  const files = (repair.files ?? []) as { path: string; content: string }[];
  if (!files.length) throw new Error("Repair has no file changes");

  const run = await startAgentRun(scope, "PUBLISHER", `Open a draft PR on ${project.repositoryFullName}`);
  try {
    const octo = await installationOctokit(project.githubInstallationId);
    const owner = project.repositoryOwner;
    const repo = project.repositoryName;
    // Re-confirm authorization at publish time (installation may have lost access).
    const { data: repoData } = await octo.request("GET /repos/{owner}/{repo}", { owner, repo });
    const base = repoData.default_branch;
    const prTitle = ((repair.meta ?? {}) as { prTitle?: string }).prTitle ?? `fix: ${finding.title}`;
    let branch = repair.branchName ?? `ghostlayer/fix-${repair.id.slice(-6)}`;

    // Collision-safe branch: reuse ours if it already points at our commit, else suffix.
    const existing = await octo.request("GET /repos/{owner}/{repo}/git/ref/{ref}", { owner, repo, ref: `heads/${branch}` }).catch((e) => {
      if ((e as { status?: number }).status === 404) return null;
      throw e;
    });
    if (existing && repair.commitSha && existing.data.object.sha === repair.commitSha) {
      /* reuse */
    } else {
      if (existing) branch = `${branch}-${repair.id.slice(-5)}`;
      const baseSha = repair.baseSha ?? (await octo.request("GET /repos/{owner}/{repo}/git/ref/{ref}", { owner, repo, ref: `heads/${base}` })).data.object.sha;
      const { data: baseCommit } = await octo.request("GET /repos/{owner}/{repo}/git/commits/{commit_sha}", { owner, repo, commit_sha: baseSha });
      const tree = await Promise.all(
        files.map(async (f) => {
          const { data: blob } = await octo.request("POST /repos/{owner}/{repo}/git/blobs", { owner, repo, content: f.content, encoding: "utf-8" });
          return { path: f.path, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
        }),
      );
      const { data: newTree } = await octo.request("POST /repos/{owner}/{repo}/git/trees", { owner, repo, base_tree: baseCommit.tree.sha, tree });
      const { data: commit } = await octo.request("POST /repos/{owner}/{repo}/git/commits", {
        owner,
        repo,
        message: `${prTitle}\n\nGhostLayer repair for: ${finding.title}\n${(verification.checks as { cached?: unknown } | null)?.cached ? "Original failure re-proven live; build, tests and patched replays reused from a prior verified run on identical code + patch." : "Verified by independent replay before publishing."}`,
        tree: newTree.sha,
        parents: [baseSha],
      });
      await octo.request("POST /repos/{owner}/{repo}/git/refs", { owner, repo, ref: `refs/heads/${branch}`, sha: commit.sha });
      await db.repairAttempt.update({ where: { id: repairId }, data: { commitSha: commit.sha, branchName: branch } });
      await emit({ ...scope, agentRunId: run.id }, "PUBLISHER", "branch.created", `Committed ${files.length} file(s) to ${branch} (${commit.sha.slice(0, 7)}) — default branch untouched`);
    }

    // Reuse an open PR for this head if a previous attempt created it.
    const open = await octo.request("GET /repos/{owner}/{repo}/pulls", { owner, repo, head: `${owner}:${branch}`, state: "open" });
    let pr = open.data[0];
    if (!pr) {
      const body = buildBody(repair, branch);
      try {
        pr = (await octo.request("POST /repos/{owner}/{repo}/pulls", { owner, repo, title: prTitle, head: branch, base, body, draft: true })).data as typeof pr;
      } catch (err) {
        // Draft PRs are unavailable on some private-repo plans; fall back to a regular PR (still never merged).
        if ((err as { status?: number }).status !== 422) throw err;
        pr = (await octo.request("POST /repos/{owner}/{repo}/pulls", { owner, repo, title: prTitle, head: branch, base, body: `> Opened as a regular PR because draft PRs are not available for this repository.\n\n${body}` })).data as typeof pr;
      }
    }
    const saved = await db.pullRequest.upsert({
      where: { repairAttemptId: repairId },
      update: { githubUrl: pr.html_url, githubNumber: pr.number, status: pr.draft ? "DRAFT" : "OPEN" },
      create: {
        repairAttemptId: repairId,
        projectId: project.id,
        githubNumber: pr.number,
        githubUrl: pr.html_url,
        branchName: branch,
        title: prTitle,
        status: pr.draft ? "DRAFT" : "OPEN",
      },
    });
    await db.repairAttempt.update({ where: { id: repairId }, data: { status: "PR_CREATED" } });
    await db.finding.update({ where: { id: finding.id }, data: { verificationStatus: "PR_OPENED" } });
    await finishAgentRun(run.id, "COMPLETED", `Draft PR #${pr.number} opened`);
    await emit(scope, "PUBLISHER", "pr.opened", `Draft PR #${pr.number} opened: ${pr.html_url}`, { url: pr.html_url, number: pr.number });
    return saved;
  } catch (err) {
    await finishAgentRun(run.id, "FAILED", undefined, String((err as Error).message ?? err).slice(0, 300));
    await db.repairAttempt.update({ where: { id: repairId }, data: { status: "READY_FOR_REVIEW", errorMessage: `Publish failed: ${String((err as Error).message ?? err).slice(0, 300)}` } });
    throw err;
  }
}

type RepairForBody = NonNullable<Awaited<ReturnType<typeof loadForBody>>>;
async function loadForBody(id: string) {
  return db.repairAttempt.findUnique({ where: { id }, include: { finding: true, project: true, verification: true, pullRequest: true } });
}

function check(v: boolean | null | undefined) {
  return v === true ? "✅ passed" : v === false ? "❌ failed" : "➖ not run";
}

function buildBody(repair: RepairForBody, branch: string) {
  const f = repair.finding;
  const repro = f.reproductionSteps as unknown as { human?: string[]; trail?: Step[]; trigger?: Step };
  const stats = f.reproductionStats as { triggerRuns?: number; triggerFailures?: number; controlRuns?: number; controlFailures?: number } | null;
  const v = repair.verification!;
  const vchecks = (v.checks as { checks?: { name: string; passed: boolean | null; detail: string }[]; verdict?: { concerns?: string[] }; cached?: { verifiedAt: string; treeSha: string; diffHash: string } | null } | null) ?? {};
  const tests = (repair.testSummary as { name: string; command: string; exitCode: number }[] | null) ?? [];
  const app = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const steps = repro.human?.length ? repro.human : [...(repro.trail ?? []), ...(repro.trigger ? [repro.trigger] : [])].map(describeStep);
  return `## 👻 GhostLayer repair — ${f.title}

> This draft PR was prepared autonomously by GhostLayer and **requires human review**. It was not merged and will not be merged automatically.

### Issue detected
${f.description}

- **Severity:** ${f.severity} · **Confidence:** ${f.confidence} · **Category:** ${f.category}
- **Affected page:** ${f.affectedUrl}

### How GhostLayer discovered it
GhostLayer's Explorer agent navigated the deployed site in a Solari cloud browser with **no list of known bugs**, exercising user journeys the way a real user would. A rapid-repeated-activation probe produced an anomalous network pattern, which the Investigator agent then replayed in fresh, isolated browser contexts: **${stats?.triggerFailures ?? "?"}/${stats?.triggerRuns ?? "?"} trigger runs failed**, **${(stats?.controlRuns ?? 0) - (stats?.controlFailures ?? 0)}/${stats?.controlRuns ?? 0} normal (control) runs behaved correctly**.

### Reproduction steps
${steps.map((s, i) => `${i + 1}. ${s.replace(/^\s*\d+[.)]\s*/, "")}`).join("\n")}

**Expected:** ${f.expectedBehavior}
**Actual:** ${f.actualBehavior}

### Root cause
${repair.rootCause ?? "See diff."}

### Changes
${repair.patchSummary ?? ""}

${((repair.files ?? []) as { path: string }[]).map((x) => `- \`${x.path}\``).join("\n")}

### Verification (actual results)
${tests.length || !vchecks.cached ? "Engineer sandbox checks:" : "Engineer: patch recalled from verified-fix memory (no new sandbox run)."}
${tests.map((t) => `- \`${t.command}\` → exit ${t.exitCode}`).join("\n") || (vchecks.cached ? "" : "- none available")}

${vchecks.cached ? `Independent Verifier: the original failure was re-proven live in a fresh browser for this PR. Build, tests and patched-build replays (♻) are reused from the verified run at ${new Date(vchecks.cached.verifiedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" })} PT on identical code (tree \`${vchecks.cached.treeSha.slice(0, 7)}\`) and an identical patch (\`${vchecks.cached.diffHash.slice(0, 7)}\`):` : "Independent Verifier (fresh sandbox rebuilt from base commit + this diff, fresh browser session):"}
${(vchecks.checks ?? []).map((c) => `- ${check(c.passed)} — **${c.name}**: ${c.detail}`).join("\n")}

| Check | Result |
|---|---|
| Build | ${check(v.buildPassed)}${vchecks.cached ? " ♻" : ""} |
| Existing tests | ${check(v.existingTestsPassed)}${vchecks.cached ? " ♻" : ""} |
| Original failure reproduced before fix | ${check(v.originalFailureReproduced)} |
| Original failure resolved after fix | ${check(v.patchedFlowPassed)}${vchecks.cached ? " ♻" : ""} |
| Normal journey still works | ${check(v.regressionTestsPassed)}${vchecks.cached ? " ♻" : ""} |
| Human review required | ⚠️ yes |
${vchecks.cached ? "\n♻ = reused from the prior verified run on identical code + identical patch.\n" : ""}

### Evidence
${app ? `- Finding, screenshots and session recordings: ${app}/dashboard/projects/${repair.projectId}/findings/${f.id}` : "- See the GhostLayer dashboard"}

### Limitations
- Verified only under the replayed conditions (Chromium, desktop viewport, the recorded journey and variants). Passing checks do not guarantee the absence of other bugs.
${(vchecks.verdict?.concerns ?? []).map((c) => `- Reviewer concern: ${c}`).join("\n")}

<sub>Branch \`${branch}\` · base \`${repair.baseSha?.slice(0, 7) ?? "?"}\` · GhostLayer — find what hides beneath the interface.</sub>
`;
}
