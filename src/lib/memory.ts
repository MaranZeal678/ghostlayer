/**
 * GhostLayer memory. Two content-addressed stores:
 *  - FixMemory: patches the independent Verifier approved, keyed by repo + git tree + bug fingerprint.
 *    A git tree hash is a hash of the exact file contents, so a Revert commit that restores the same files
 *    hits the same entry, and any real code change misses it.
 *  - AgentMemo: Explorer page plans and Investigator reports, keyed by a hash of the exact model inputs.
 * Set GHOSTLAYER_MEMORY=off to disable both.
 */
import { createHash } from "node:crypto";
import { db } from "./db";
import { installationOctokit } from "./github";
import type { Prisma } from "@/generated/prisma/client";

export const memoryEnabled = () => process.env.GHOSTLAYER_MEMORY !== "off";
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Current default-branch head commit and its tree hash. */
export async function repoHead(installationId: number | bigint, fullName: string) {
  const [owner, repo] = fullName.split("/");
  const octo = await installationOctokit(installationId);
  const { data: r } = await octo.request("GET /repos/{owner}/{repo}", { owner, repo });
  const { data: c } = await octo.request("GET /repos/{owner}/{repo}/commits/{ref}", { owner, repo, ref: r.default_branch });
  return { headSha: c.sha, treeSha: c.commit.tree.sha };
}

export async function treeOf(installationId: number | bigint, fullName: string, sha: string) {
  const [owner, repo] = fullName.split("/");
  const octo = await installationOctokit(installationId);
  const { data } = await octo.request("GET /repos/{owner}/{repo}/git/commits/{commit_sha}", { owner, repo, commit_sha: sha });
  return data.tree.sha;
}

export type CachedVerification = {
  checks: { name: string; passed: boolean | null; detail: string }[];
  verdict: unknown;
  testsOk: boolean | null;
  buildOk: boolean | null;
  patchedOk: boolean | null;
  regressionOk: boolean | null;
  afterShotJpeg?: string;
  verifiedAt: string;
};

export async function recallFix(repositoryFullName: string, treeSha: string, fingerprint: string) {
  if (!memoryEnabled()) return null;
  return db.fixMemory.findUnique({ where: { repositoryFullName_treeSha_fingerprint: { repositoryFullName, treeSha, fingerprint } } });
}

export async function saveFix(data: {
  repositoryFullName: string;
  treeSha: string;
  fingerprint: string;
  diff: string;
  files: unknown;
  rootCause?: string | null;
  patchSummary?: string | null;
  prTitle?: string | null;
  branchSlug?: string | null;
  verification: CachedVerification;
}) {
  if (!memoryEnabled()) return;
  const row = {
    diff: data.diff,
    diffHash: sha256(data.diff),
    files: data.files as Prisma.InputJsonValue,
    rootCause: data.rootCause ?? null,
    patchSummary: data.patchSummary ?? null,
    prTitle: data.prTitle ?? null,
    branchSlug: data.branchSlug ?? null,
    verification: data.verification as unknown as Prisma.InputJsonValue,
  };
  await db.fixMemory.upsert({
    where: { repositoryFullName_treeSha_fingerprint: { repositoryFullName: data.repositoryFullName, treeSha: data.treeSha, fingerprint: data.fingerprint } },
    update: row,
    create: { repositoryFullName: data.repositoryFullName, treeSha: data.treeSha, fingerprint: data.fingerprint, ...row },
  });
}

/** Memoize an expensive, deterministic-enough agent step by a hash of its exact inputs. */
export async function memo<T>(namespace: string, input: unknown, compute: () => Promise<T>): Promise<{ value: T; cached: boolean }> {
  if (!memoryEnabled()) return { value: await compute(), cached: false };
  const key = `${namespace}:${sha256(JSON.stringify(input))}`;
  const hit = await db.agentMemo.findUnique({ where: { key } }).catch(() => null);
  if (hit) {
    void db.agentMemo.update({ where: { key }, data: { hits: { increment: 1 } } }).catch(() => {});
    return { value: hit.value as T, cached: true };
  }
  const value = await compute();
  await db.agentMemo
    .upsert({ where: { key }, update: { value: value as Prisma.InputJsonValue }, create: { key, value: value as Prisma.InputJsonValue } })
    .catch(() => {});
  return { value, cached: false };
}
