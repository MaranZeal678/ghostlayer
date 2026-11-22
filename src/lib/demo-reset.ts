import { db } from "./db";
import { installationOctokit } from "./github";

/**
 * Demo reset: return the demo repository (and optionally the project's GhostLayer history) to the seeded-bug baseline
 * so the scan → repair → PR flow can be shown again. History-preserving: never force-pushes; if main has moved,
 * it adds a commit whose tree is the baseline tree.
 */
export function demoConfig() {
  const repo = process.env.DEMO_REPOSITORY ?? "MaranZeal678/mad-hatter-tea-emporium";
  const baselineSha = process.env.DEMO_BASELINE_SHA ?? "9cac922ca9054179085967e57802fd6526b065cc";
  return { repo, baselineSha };
}

export function isDemoProject(p: { repositoryFullName: string | null }) {
  return Boolean(p.repositoryFullName && p.repositoryFullName.toLowerCase() === demoConfig().repo.toLowerCase());
}

export interface ResetSummary {
  closedPullRequests: number[];
  deletedBranches: string[];
  mainRestored: boolean;
  mainHead: string;
  clearedScans: number;
}

export async function resetDemo(project: {
  id: string;
  repositoryOwner: string | null;
  repositoryName: string | null;
  githubInstallationId: bigint | null;
  defaultBranch: string | null;
}, opts: { clearHistory: boolean }): Promise<ResetSummary> {
  if (!project.githubInstallationId || !project.repositoryOwner || !project.repositoryName) throw new Error("Repository is not connected");
  const { baselineSha } = demoConfig();
  const owner = project.repositoryOwner;
  const repo = project.repositoryName;
  const octo = await installationOctokit(project.githubInstallationId);
  const base = project.defaultBranch ?? (await octo.request("GET /repos/{owner}/{repo}", { owner, repo })).data.default_branch;

  // 1. Close GhostLayer's open PRs (never merged by the reset).
  const prs = await octo.paginate("GET /repos/{owner}/{repo}/pulls", { owner, repo, state: "open", per_page: 100 });
  const closedPullRequests: number[] = [];
  for (const pr of prs.filter((p) => p.head.ref.startsWith("ghostlayer/"))) {
    await octo
      .request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
        owner,
        repo,
        issue_number: pr.number,
        body: "🐇 Closed by GhostLayer **revert**. The repository was returned to its seeded-bug baseline so the demo can run again.",
      })
      .catch(() => {});
    await octo.request("PATCH /repos/{owner}/{repo}/pulls/{pull_number}", { owner, repo, pull_number: pr.number, state: "closed" });
    closedPullRequests.push(pr.number);
  }

  // 2. Delete GhostLayer fix branches.
  const refs = await octo
    .request("GET /repos/{owner}/{repo}/git/matching-refs/{ref}", { owner, repo, ref: "heads/ghostlayer/" })
    .then((r) => r.data)
    .catch(() => []);
  const deletedBranches: string[] = [];
  for (const r of refs) {
    const name = r.ref.replace(/^refs\/heads\//, "");
    await octo.request("DELETE /repos/{owner}/{repo}/git/refs/{ref}", { owner, repo, ref: `heads/${name}` }).catch(() => {});
    deletedBranches.push(name);
  }

  // 3. If main moved past the baseline (e.g. a fix PR was merged), restore the baseline tree with a new commit.
  const head = (await octo.request("GET /repos/{owner}/{repo}/git/ref/{ref}", { owner, repo, ref: `heads/${base}` })).data.object.sha;
  let mainHead = head;
  let mainRestored = false;
  if (head !== baselineSha) {
    const [headCommit, baselineCommit] = await Promise.all([
      octo.request("GET /repos/{owner}/{repo}/git/commits/{commit_sha}", { owner, repo, commit_sha: head }),
      octo.request("GET /repos/{owner}/{repo}/git/commits/{commit_sha}", { owner, repo, commit_sha: baselineSha }),
    ]);
    if (headCommit.data.tree.sha !== baselineCommit.data.tree.sha) {
      const { data: commit } = await octo.request("POST /repos/{owner}/{repo}/git/commits", {
        owner,
        repo,
        message: `chore: revert to seeded-bug baseline (${baselineSha.slice(0, 7)})\n\nRestores the tree of ${baselineSha} so GhostLayer can rediscover the seeded bugs.`,
        tree: baselineCommit.data.tree.sha,
        parents: [head],
      });
      await octo.request("PATCH /repos/{owner}/{repo}/git/refs/{ref}", { owner, repo, ref: `heads/${base}`, sha: commit.sha, force: false });
      mainHead = commit.sha;
      mainRestored = true;
    }
  }

  // 4. Optionally clear this project's GhostLayer history (scans cascade to findings, evidence, repairs, PR records).
  let clearedScans = 0;
  if (opts.clearHistory) {
    const scans = await db.scan.findMany({ where: { projectId: project.id }, select: { id: true } });
    const repairs = await db.repairAttempt.findMany({ where: { projectId: project.id }, select: { id: true } });
    const targets = [...scans.map((s) => s.id), ...repairs.map((r) => r.id)];
    await db.job.updateMany({ where: { targetId: { in: targets }, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "CANCELLED", lastError: "Reverted" } });
    clearedScans = (await db.scan.deleteMany({ where: { projectId: project.id } })).count;
  } else {
    // Keep history, but mark the PR records closed so the dashboard matches GitHub.
    await db.pullRequest.updateMany({ where: { projectId: project.id, githubNumber: { in: closedPullRequests } }, data: { status: "CLOSED" } });
  }
  return { closedPullRequests, deletedBranches, mainRestored, mainHead, clearedScans };
}
