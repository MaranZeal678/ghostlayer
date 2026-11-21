/**
 * Repair pipeline: QUEUED → PREPARING → DIAGNOSING → PATCHING → TESTING → VERIFYING → READY_FOR_REVIEW
 * (REJECTED / FAILED / CANCELLED terminal). Engineer and Verifier use separate sandboxes and separate
 * model contexts; the Verifier only sees the bug report and the diff, never the Engineer's reasoning.
 */
import { z } from "zod";
import { structured } from "@/lib/ai";
import { db } from "@/lib/db";
import { emit, finishAgentRun, startAgentRun } from "@/lib/events";
import { scopedRepoToken, githubConfigured } from "@/lib/github";
import { solariSandboxes } from "@/lib/solari";
import type { Prisma, RepairStatus } from "@/generated/prisma/client";
import { saveEvidence } from "./scan";
import { enqueue } from "@/lib/queue";
import {
  cloneRepo,
  ensureNode,
  inspectRepo,
  installCommand,
  openSandbox,
  REPO_DIR,
  runScript,
  sanitize,
  sh,
  type RepoInfo,
  type Sbx,
  type ShResult,
} from "./sandbox";
import { describeStep, openSolariBrowser, type Step } from "./harness";
import { exhibits, replayOnce } from "./investigator";
import type { Anomaly } from "./explorer";

type Finding = NonNullable<Awaited<ReturnType<typeof loadRepair>>>["finding"];
type Repro = { human: string[]; trail: Step[]; trigger: Step; control: Step | null; kind: Anomaly["kind"]; likelyComponents?: string[] };

async function loadRepair(id: string) {
  return db.repairAttempt.findUnique({ where: { id }, include: { finding: true, project: true } });
}

async function setStatus(id: string, status: RepairStatus, extra: Prisma.RepairAttemptUpdateInput = {}) {
  await db.repairAttempt.update({ where: { id }, data: { status, ...extra } });
}

const EditSchema = z.object({
  rootCause: z.string().describe("What in the code causes the bug"),
  rootCauseStatus: z.enum(["confirmed-by-code-reading", "hypothesis"]),
  summary: z.string().describe("One-paragraph summary of the change for a PR description"),
  edits: z
    .array(
      z.object({
        path: z.string().describe("Repo-relative file path"),
        search: z.string().describe("Exact, unique snippet currently in the file (include enough context lines)"),
        replace: z.string().describe("Replacement snippet"),
      }),
    )
    .min(1),
  newFiles: z
    .array(z.object({ path: z.string(), content: z.string() }))
    .describe("New files, e.g. a focused regression test. Empty if none.")
    .default([]),
  prTitle: z.string().describe("Conventional-commit style title, e.g. 'fix: prevent duplicate checkout submissions'"),
  branchSlug: z.string().describe("kebab-case slug for the branch, e.g. 'checkout-duplicate-submit'"),
});
type EditPlan = z.infer<typeof EditSchema>;

const VerdictSchema = z.object({
  concerns: z.array(z.string()).describe("Concrete ways the patch could be incomplete, wrong, or regress behavior. Empty if none found."),
  adversarialIdeas: z.array(z.string()).describe("Inputs or interactions that might still break it"),
  recommendation: z.enum(["approve", "reject", "needs-human"]),
  reasoning: z.string(),
});

/** POSIX single-quote a string for sh -c (website text and model output are untrusted). */
const q = (s: string) => `'${s.replace(/[\x00-\x1f]/g, "").replace(/'/g, `'\\''`)}'`;

/** A verification outcome that rejects the patch (feeds back to the Engineer) rather than an infrastructure failure. */
class VerifyReject extends Error {}

async function gatherContext(sbx: Sbx, finding: Finding, repro: Repro) {
  const keywords = new Set<string>();
  const add = (s?: string | null) => {
    if (s && s.trim().length >= 3 && s.length < 60) keywords.add(s.trim());
  };
  if (repro.trigger.kind === "click") add(repro.trigger.label);
  const stats = finding.reproductionStats as { explorerObservation?: { mutations?: { path: string }[] } } | null;
  for (const m of stats?.explorerObservation?.mutations ?? []) add(m.path.split("?")[0]);
  if (repro.trigger.kind === "goto") add(repro.trigger.path);
  try {
    const p = new URL(finding.affectedUrl).pathname.split("/").filter(Boolean).pop();
    add(p);
  } catch {
    /* ignore */
  }
  const files = await sh(sbx, "git ls-files | grep -Ev '(^|/)(node_modules|\\.next|dist|build|public)/|lock|\\.(png|jpg|svg|ico|woff2?)$' | head -400", { cwd: REPO_DIR });
  const hits = new Map<string, number>();
  for (const kw of keywords) {
    const g = await sh(sbx, `grep -rIl --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git -F -- ${q(kw)} . | head -20`, { cwd: REPO_DIR });
    for (const f of g.output.split("\n").map((l) => l.replace(/^\.\//, "").trim()).filter(Boolean)) hits.set(f, (hits.get(f) ?? 0) + 1);
  }
  const ranked = [...hits.entries()].filter(([f]) => !/\.(md|lock|json)$/.test(f)).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f]) => f);
  const contents: { path: string; content: string }[] = [];
  for (const f of ranked) contents.push({ path: f, content: (await sbx.files.readText(`${REPO_DIR}/${f}`)).slice(0, 14000) });
  // Show one existing test so new tests match conventions.
  const testFile = files.output.split("\n").find((f) => /\.(test|spec)\.(t|j)sx?$/.test(f));
  if (testFile && !ranked.includes(testFile))
    contents.push({ path: testFile, content: (await sbx.files.readText(`${REPO_DIR}/${testFile}`)).slice(0, 5000) });
  return { fileList: files.output, keywords: [...keywords], candidates: ranked, contents };
}

async function applyPlan(sbx: Sbx, plan: EditPlan) {
  const errors: string[] = [];
  for (const e of plan.edits) {
    const path = `${REPO_DIR}/${e.path.replace(/^\.?\//, "")}`;
    if (e.path.includes("..")) {
      errors.push(`${e.path}: path traversal rejected`);
      continue;
    }
    const text = await sbx.files.readText(path).catch(() => null);
    if (text === null) {
      errors.push(`${e.path}: file not found`);
      continue;
    }
    const count = text.split(e.search).length - 1;
    if (count !== 1) {
      errors.push(`${e.path}: search snippet matched ${count} times (must be exactly 1)`);
      continue;
    }
    await sbx.files.write(path, text.replace(e.search, () => e.replace));
  }
  for (const f of plan.newFiles) {
    if (f.path.includes("..")) {
      errors.push(`${f.path}: path traversal rejected`);
      continue;
    }
    const dir = f.path.split("/").slice(0, -1).join("/");
    if (dir) await sh(sbx, `mkdir -p -- ${q(dir)}`, { cwd: REPO_DIR });
    await sbx.files.write(`${REPO_DIR}/${f.path}`, f.content);
  }
  return errors;
}

async function runChecks(sbx: Sbx, info: RepoInfo) {
  const results: { name: string; result: ShResult }[] = [];
  if (info.hasTestScript) results.push({ name: "tests", result: await sh(sbx, runScript(info.packageManager, "test"), { cwd: REPO_DIR, timeoutMs: 300_000, label: runScript(info.packageManager, "test") }) });
  if (info.hasBuildScript) results.push({ name: "build", result: await sh(sbx, runScript(info.packageManager, "build"), { cwd: REPO_DIR, timeoutMs: 600_000, label: runScript(info.packageManager, "build") }) });
  return results;
}

async function prepareSandbox(repairId: string, role: string, fullName: string, token: string | null, ref?: string) {
  const sbx = await openSandbox({ app: "ghostlayer", repairId, role });
  try {
    const node = await ensureNode(sbx);
    const sha = await cloneRepo(sbx, fullName, token, ref);
    const info = await inspectRepo(sbx);
    const install = await sh(sbx, installCommand(info.packageManager), { cwd: REPO_DIR, timeoutMs: 600_000, label: installCommand(info.packageManager) });
    return { sbx, node, sha, info, install };
  } catch (err) {
    await sbx.kill().catch(() => {});
    throw err;
  }
}

type RepairMeta = { feedback?: string | null; prTitle?: string; branchSlug?: string };

/** Engineer job (REPAIR): one attempt at a patch; hands off to the Verifier job. */
export async function runRepair(repairId: string) {
  const repair = await loadRepair(repairId);
  if (!repair) throw new Error(`Repair ${repairId} not found`);
  if (!["QUEUED", "PREPARING", "DIAGNOSING", "PATCHING", "TESTING"].includes(repair.status)) return;
  const { finding, project } = repair;
  const scope = { repairAttemptId: repairId, scanId: finding.scanId };
  const repro = finding.reproductionSteps as unknown as Repro;
  if (!project.repositoryFullName || !project.repositoryId || !project.githubInstallationId)
    throw new Error("Project has no connected repository; connect GitHub to enable repairs");
  if (!githubConfigured()) throw new Error("GitHub App is not configured");
  const maxAttempts = Number(process.env.REPAIR_MAX_ATTEMPTS ?? 2);
  const origin = new URL(project.websiteUrl).origin;
  const isCancelled = async () => (await db.repairAttempt.findUnique({ where: { id: repairId }, select: { status: true } }))?.status === "CANCELLED";

  const attempt = repair.attempt;
  const meta = (repair.meta ?? {}) as RepairMeta;
  let verifierFeedback: string | null = meta.feedback ?? null;
  if (await isCancelled()) return;
  /** Bounded repair loop across jobs: queue another Engineer attempt with the evidence, or give up. */
  const retryOrReject = async (feedback: string) => {
    if (attempt < maxAttempts) {
      await db.repairAttempt.update({ where: { id: repairId }, data: { attempt: attempt + 1, status: "QUEUED", meta: { ...meta, feedback } as Prisma.InputJsonValue } });
      await emit(scope, null, "repair.retry", `Sending the evidence back to the Engineer for attempt ${attempt + 1} of ${maxAttempts}`);
      await enqueue("REPAIR", repairId, `repair:${repairId}:${attempt + 1}`);
      return;
    }
    await setStatus(repairId, "REJECTED", { completedAt: new Date(), errorMessage: feedback.slice(0, 1000) });
    await emit(scope, null, "repair.exhausted", `No verified fix after ${maxAttempts} attempt(s); human review needed`);
  };
  {
    // ── Engineer ────────────────────────────────────────────
    await setStatus(repairId, "PREPARING");
    const eng = await startAgentRun(scope, "ENGINEER", `Attempt ${attempt}: diagnose and patch "${finding.title}" in ${project.repositoryFullName}`);
    let plan: EditPlan | null = null;
    let diff = "";
    let changed: { path: string; content: string }[] = [];
    let engChecks: { name: string; result: ShResult }[] = [];
    let baseSha = "";
    let sbx: Sbx | null = null;
    try {
      const readToken = await scopedRepoToken(project.githubInstallationId, project.repositoryId, { contents: "read", metadata: "read" });
      await emit(scope, "ENGINEER", "sandbox.provisioning", "Provisioning isolated Solari sandbox (4 vCPU, 8 GB) with a read-only, single-repo token");
      const prep = await prepareSandbox(repairId, "engineer", project.repositoryFullName, readToken);
      sbx = prep.sbx;
      baseSha = prep.sha;
      await db.agentRun.update({ where: { id: eng.id }, data: { externalExecutionId: sbx.id } });
      await setStatus(repairId, "DIAGNOSING", { baseSha });
      await emit(scope, "ENGINEER", "repo.cloned", `Cloned ${project.repositoryFullName}@${baseSha.slice(0, 7)} · Node ${prep.node} · ${prep.info.packageManager} install exit ${prep.install.exitCode}`, {
        sandboxId: sbx.id,
        scripts: Object.keys(prep.info.scripts),
      });
      if (prep.install.exitCode !== 0) throw new Error(`Dependency install failed: ${prep.install.output.slice(-400)}`);

      const ctx = await gatherContext(sbx, finding, repro);
      await emit(scope, "ENGINEER", "source.located", `Searched for ${ctx.keywords.map((k) => `"${k}"`).join(", ")} → ${ctx.candidates.join(", ") || "no direct hits"}`, {
        candidates: ctx.candidates,
      });

      let applyErrors: string[] = [];
      for (let tries = 0; tries < 2; tries++) {
        plan = await structured({
          name: "engineer_patch",
          schema: EditSchema,
          system: `You are the Engineering agent of GhostLayer. Produce the SMALLEST correct fix for a verified bug in this repository.
Rules: targeted change only; keep existing style; no unrelated refactors; do not touch lockfiles or config unless required.
Edits are exact search/replace on current file contents; each "search" must appear EXACTLY ONCE in that file.
${ctx.contents.some((c) => /\.(test|spec)\./.test(c.path)) ? "Add one focused regression test in the repo's existing test framework that fails without the fix and passes with it." : "Add a regression test only if a test framework exists."}
For duplicate-submission bugs, a robust fix guards re-entry synchronously (e.g. a ref-based in-flight guard checked before any await) AND reflects pending state in the UI (disable the control) — React state alone can race with rapid clicks.
Never include secrets. Never weaken validation.`,
          user: JSON.stringify({
            bugReport: {
              title: finding.title,
              description: finding.description,
              expected: finding.expectedBehavior,
              actual: finding.actualBehavior,
              steps: repro.human,
              evidence: (finding.reproductionStats as { runs?: unknown[] } | null)?.runs?.slice(0, 3),
            },
            previousAttemptRejectedBecause: verifierFeedback ?? undefined,
            previousApplyErrors: applyErrors.length ? applyErrors : undefined,
            repo: { packageManager: prep.info.packageManager, scripts: prep.info.scripts, testFramework: prep.info.testFramework },
            fileList: ctx.fileList.split("\n").slice(0, 200),
            candidateFiles: ctx.contents,
          }),
          maxTokens: 8000,
        });
        await setStatus(repairId, "PATCHING", { rootCause: plan.rootCause });
        await emit(scope, "ENGINEER", "patch.proposed", `Root cause (${plan.rootCauseStatus}): ${plan.rootCause}`, {
          files: plan.edits.map((e) => e.path).concat(plan.newFiles.map((f) => `${f.path} (new)`)),
        });
        await sh(sbx, "git checkout -q -- . && git clean -fdq -e node_modules -e .next", { cwd: REPO_DIR });
        applyErrors = await applyPlan(sbx, plan);
        if (!applyErrors.length) break;
        await emit(scope, "ENGINEER", "patch.apply_failed", `Patch did not apply cleanly, revising: ${applyErrors.join("; ").slice(0, 200)}`);
      }
      if (!plan || applyErrors.length) throw new Error(`Patch could not be applied: ${applyErrors.join("; ")}`);

      // Full diff (written to a file, not tail-truncated) for review and for the Verifier to apply.
      await sh(sbx, "git add -A && git diff --cached --no-color > /work/ghostlayer.diff", { cwd: REPO_DIR });
      diff = await sbx.files.readText("/work/ghostlayer.diff");
      const names = (await sh(sbx, "git diff --cached --name-only", { cwd: REPO_DIR })).output.split("\n").map((s) => s.trim()).filter(Boolean);
      if (!names.length) {
        verifierFeedback = "Your previous patch produced no file changes.";
        await finishAgentRun(eng.id, "FAILED", undefined, "Patch produced an empty diff");
        await sbx.kill().catch(() => {});
        sbx = null;
        return retryOrReject(verifierFeedback);
      }
      changed = [];
      for (const n of names) changed.push({ path: n, content: await sbx.files.readText(`${REPO_DIR}/${n}`) });

      await setStatus(repairId, "TESTING", { diff, files: changed as unknown as Prisma.InputJsonValue, patchSummary: plan.summary });
      await emit(scope, "ENGINEER", "checks.started", `Running ${[prep.info.hasTestScript && "tests", prep.info.hasBuildScript && "build"].filter(Boolean).join(" + ") || "no checks available"}`);
      engChecks = await runChecks(sbx, prep.info);
      for (const c of engChecks)
        await emit(scope, "ENGINEER", "check.result", `${c.result.command} → exit ${c.result.exitCode} (${Math.round(c.result.durationMs / 1000)}s)`, {
          name: c.name,
          exitCode: c.result.exitCode,
          tail: c.result.output.slice(-600),
        });
      await saveEvidence({ repairAttemptId: repairId, findingId: finding.id, type: "DIFF", label: `Candidate patch (attempt ${attempt})`, mimeType: "text/x-diff", content: diff });
      await saveEvidence({
        repairAttemptId: repairId,
        findingId: finding.id,
        type: "TEST_OUTPUT",
        label: `Engineer checks (attempt ${attempt})`,
        mimeType: "text/plain",
        content: engChecks.map((c) => `$ ${c.result.command}\nexit ${c.result.exitCode}\n${c.result.output}`).join("\n\n"),
      });
      const failedCheck = engChecks.find((c) => c.result.exitCode !== 0);
      await db.repairAttempt.update({
        where: { id: repairId },
        data: { testSummary: engChecks.map((c) => ({ name: c.name, command: c.result.command, exitCode: c.result.exitCode, durationMs: c.result.durationMs })) as unknown as Prisma.InputJsonValue },
      });
      if (failedCheck) {
        verifierFeedback = `Engineer's own ${failedCheck.name} failed:\n${failedCheck.result.output.slice(-1500)}`;
        await finishAgentRun(eng.id, "FAILED", undefined, `${failedCheck.name} failed (exit ${failedCheck.result.exitCode})`);
        await sbx.kill().catch(() => {});
        sbx = null;
        return retryOrReject(verifierFeedback);
      }
      await finishAgentRun(eng.id, "COMPLETED", `${changed.length} file(s) changed; ${engChecks.map((c) => `${c.name} passed`).join(", ") || "no checks"}`);
    } catch (err) {
      await finishAgentRun(eng.id, "FAILED", undefined, String((err as Error).message ?? err).slice(0, 300));
      await sbx?.kill().catch(() => {});
      throw err;
    }
    await sbx?.kill().catch(() => {});
    sbx = null;
    // Hand the diff artifact to the independent Verifier as its own durable job.
    await db.repairAttempt.update({
      where: { id: repairId },
      data: {
        status: "VERIFYING",
        baseSha,
        diff,
        files: changed as unknown as Prisma.InputJsonValue,
        patchSummary: plan!.summary,
        rootCause: plan!.rootCause,
        meta: { ...meta, feedback: null, prTitle: plan!.prTitle, branchSlug: plan!.branchSlug } as Prisma.InputJsonValue,
      },
    });
    await enqueue("VERIFY", repairId, `verify:${repairId}:${attempt}`);
  }
}

/** Verifier job: independently try to prove the Engineer's patch wrong. */
export async function runVerify(repairId: string) {
  const repair = await loadRepair(repairId);
  if (!repair) throw new Error(`Repair ${repairId} not found`);
  if (repair.status !== "VERIFYING") return;
  const { finding, project } = repair;
  const scope = { repairAttemptId: repairId, scanId: finding.scanId };
  const repro = finding.reproductionSteps as unknown as Repro;
  if (!project.repositoryFullName || !project.repositoryId || !project.githubInstallationId) throw new Error("Project has no connected repository");
  const maxAttempts = Number(process.env.REPAIR_MAX_ATTEMPTS ?? 2);
  const origin = new URL(project.websiteUrl).origin;
  const attempt = repair.attempt;
  const meta = (repair.meta ?? {}) as RepairMeta;
  const baseSha = repair.baseSha!;
  const diff = repair.diff ?? "";
  const changed = (repair.files ?? []) as { path: string; content: string }[];
  const plan = { branchSlug: meta.branchSlug ?? "repair", prTitle: meta.prTitle ?? `fix: ${finding.title}`, summary: repair.patchSummary ?? "", rootCause: repair.rootCause ?? "" };
  let verifierFeedback: string | null = null;
  const retryOrReject = async (feedback: string) => {
    if (attempt < maxAttempts) {
      await db.repairAttempt.update({ where: { id: repairId }, data: { attempt: attempt + 1, status: "QUEUED", meta: { ...meta, feedback } as Prisma.InputJsonValue } });
      await emit(scope, null, "repair.retry", `Sending the Verifier's evidence back to the Engineer for attempt ${attempt + 1} of ${maxAttempts}`);
      await enqueue("REPAIR", repairId, `repair:${repairId}:${attempt + 1}`);
      return;
    }
    await setStatus(repairId, "REJECTED", { completedAt: new Date(), errorMessage: feedback.slice(0, 1000) });
    await emit(scope, null, "repair.exhausted", `No verified fix after ${maxAttempts} attempt(s); human review needed`);
  };
  const ver = await startAgentRun(scope, "VERIFIER", `Attempt ${attempt}: try to prove the patch wrong — rebuild from ${baseSha.slice(0, 7)} + diff, replay the failing journey`);
  const checks: VerifyCheck[] = [];
  const record = async (name: string, passed: boolean | null, detail: string, payload?: Record<string, unknown>) => {
    checks.push({ name, passed, detail });
    await emit(scope, "VERIFIER", "check.result", `${passed === null ? "◌" : passed ? "✓" : "✗"} ${name}: ${detail}`, { name, passed, ...payload });
  };
  let vsbx: Sbx | null = null;
  let keepSandbox = false;
  let browser: Awaited<ReturnType<typeof openSolariBrowser>> | null = null;
  try {
    // 1. Original failure still reproduces on the unpatched deployment.
    browser = await openSolariBrowser({ repairId, role: "verifier" });
    await db.agentRun.update({ where: { id: ver.id }, data: { externalExecutionId: browser.sessionId } });
    let before = await replayOnce(browser, origin, repro.trail, repro.trigger);
    if (before.preError || before.obs.error) before = await replayOnce(browser, origin, repro.trail, repro.trigger);
    const beforeEx = exhibits(repro.kind, before.obs);
    const beforeShot = before.shot ? await saveEvidence({ repairAttemptId: repairId, findingId: finding.id, type: "SCREENSHOT", label: "before", mimeType: "image/jpeg", content: before.shot }) : undefined;
    await record("Original failure reproduced (unpatched)", beforeEx.failed, `${origin}: ${beforeEx.detail}`, { evidenceId: beforeShot });
    await browser.close();
    browser = null;

    // 2. Independent rebuild: fresh sandbox, base commit, apply the diff artifact.
    const readToken = await scopedRepoToken(project.githubInstallationId, project.repositoryId, { contents: "read", metadata: "read" });
    const prep = await prepareSandbox(repairId, "verifier", project.repositoryFullName, readToken, baseSha);
    vsbx = prep.sbx;
    await vsbx.files.write("/work/fix.diff", diff.endsWith("\n") ? diff : `${diff}\n`);
    const apply = await sh(vsbx, "git apply --index /work/fix.diff", { cwd: REPO_DIR });
    await record("Patch applies cleanly to base commit", apply.exitCode === 0, apply.exitCode === 0 ? `${baseSha.slice(0, 7)} + ${changed.length} file(s)` : apply.output.slice(-200));
    if (apply.exitCode !== 0) throw new VerifyReject(`Patch does not apply to base commit: ${apply.output.slice(-200)}`);
    if (changed.some((c) => /(^|\/)package\.json$/.test(c.path)))
      await sh(vsbx, installCommand(prep.info.packageManager), { cwd: REPO_DIR, timeoutMs: 600_000 });
    const vChecks = await runChecks(vsbx, prep.info);
    const tests = vChecks.find((c) => c.name === "tests");
    const build = vChecks.find((c) => c.name === "build");
    await record("Existing + new tests pass (independent run)", tests ? tests.result.exitCode === 0 : null, tests ? `${tests.result.command} → exit ${tests.result.exitCode}` : "no test script");
    await record("Build succeeds", build ? build.result.exitCode === 0 : null, build ? `${build.result.command} → exit ${build.result.exitCode}` : "no build script");
    await saveEvidence({
      repairAttemptId: repairId,
      findingId: finding.id,
      type: "TEST_OUTPUT",
      label: `Verifier independent checks (attempt ${attempt})`,
      mimeType: "text/plain",
      content: vChecks.map((c) => `$ ${c.result.command}\nexit ${c.result.exitCode}\n${c.result.output}`).join("\n\n"),
    });
    const state: VerifyState = {
      agentRunId: ver.id,
      checks,
      beforeFailed: beforeEx.failed,
      beforeShot,
      testsOk: tests ? tests.result.exitCode === 0 : null,
      buildOk: build ? build.result.exitCode === 0 : null,
    };

    // 3. Launch the patched app; the browser replays run as their own job (keeps each serverless job short).
    if (build && build.result.exitCode === 0 && prep.info.scripts.start) {
      await vsbx.commands.start("sh", {
        args: ["-c", `PORT=3000 HOSTNAME=0.0.0.0 ${runScript(prep.info.packageManager, "start")} > /work/app.log 2>&1`],
        cwd: REPO_DIR,
        env: { PATH: `/opt/node/bin:/usr/local/bin:/usr/bin:/bin`, NODE_ENV: "production" },
      });
      const ready = await sh(vsbx, "for i in $(seq 1 60); do curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ | grep -q 200 && echo up && exit 0; sleep 1; done; tail -20 /work/app.log; exit 1", { timeoutMs: 90_000 });
      if (ready.exitCode !== 0) {
        await record("Patched app starts", false, ready.output.slice(-200));
        throw new VerifyReject(`Patched app did not start: ${ready.output.slice(-300)}`);
      }
      state.sandboxId = vsbx.id;
      keepSandbox = true;
      await db.repairAttempt.update({ where: { id: repairId }, data: { meta: { ...meta, verify: state } as unknown as Prisma.InputJsonValue } });
      await emit(scope, "VERIFIER", "preview.starting", "Patched app is running in the Verifier's sandbox; replaying the journey against it next");
      await enqueue("VERIFY_REPLAY", repairId, `verify-replay:${repairId}:${attempt}`);
      return;
    }
    await record("Browser verification on patched app", null, "Could not launch patched app (no successful build or start script)");
    return await finalizeVerification({ repair, state, patchedOk: null, regressionOk: null, afterShot: undefined, retryOrReject });
  } catch (err) {
    if (err instanceof VerifyReject) {
      verifierFeedback = `Independent verification rejected the patch: ${err.message}`;
      await finishAgentRun(ver.id, "COMPLETED", "Patch rejected");
      await emit(scope, "VERIFIER", "repair.rejected", verifierFeedback.slice(0, 300));
      return retryOrReject(verifierFeedback);
    }
    await finishAgentRun(ver.id, "FAILED", undefined, String((err as Error).message ?? err).slice(0, 300));
    throw err;
  } finally {
    await browser?.close();
    if (!keepSandbox) await vsbx?.kill().catch(() => {});
  }
}

type VerifyCheck = { name: string; passed: boolean | null; detail: string };
type VerifyState = {
  agentRunId: string;
  checks: VerifyCheck[];
  beforeFailed: boolean;
  beforeShot?: string;
  testsOk: boolean | null;
  buildOk: boolean | null;
  sandboxId?: string;
};

/** Verifier replay job: replay the failing journey (and variants) against the patched app in the same sandbox. */
export async function runVerifyReplay(repairId: string) {
  const repair = await loadRepair(repairId);
  if (!repair) throw new Error(`Repair ${repairId} not found`);
  if (repair.status !== "VERIFYING") return;
  const { finding } = repair;
  const scope = { repairAttemptId: repairId, scanId: finding.scanId };
  const repro = finding.reproductionSteps as unknown as Repro;
  const meta = (repair.meta ?? {}) as RepairMeta & { verify?: VerifyState };
  const state = meta.verify;
  if (!state?.sandboxId) throw new Error("Verifier sandbox state missing");
  const maxAttempts = Number(process.env.REPAIR_MAX_ATTEMPTS ?? 2);
  const attempt = repair.attempt;
  const retryOrReject = async (feedback: string) => {
    if (attempt < maxAttempts) {
      await db.repairAttempt.update({ where: { id: repairId }, data: { attempt: attempt + 1, status: "QUEUED", meta: { ...meta, verify: undefined, feedback } as Prisma.InputJsonValue } });
      await emit(scope, null, "repair.retry", `Sending the Verifier's evidence back to the Engineer for attempt ${attempt + 1} of ${maxAttempts}`);
      await enqueue("REPAIR", repairId, `repair:${repairId}:${attempt + 1}`);
      return;
    }
    await setStatus(repairId, "REJECTED", { completedAt: new Date(), errorMessage: feedback.slice(0, 1000) });
    await emit(scope, null, "repair.exhausted", `No verified fix after ${maxAttempts} attempt(s); human review needed`);
  };
  const record = async (name: string, passed: boolean | null, detail: string, payload?: Record<string, unknown>) => {
    state.checks.push({ name, passed, detail });
    await emit(scope, "VERIFIER", "check.result", `${passed === null ? "◌" : passed ? "✓" : "✗"} ${name}: ${detail}`, { name, passed, ...payload });
  };
  let browser: Awaited<ReturnType<typeof openSolariBrowser>> | null = null;
  let vsbx: Sbx | null = null;
  try {
    vsbx = (await solariSandboxes().connect(state.sandboxId)) as Sbx;
    const preview = await vsbx.previewUrl(3000);
    const previewUrl = new URL(preview.url);
    if (previewUrl.pathname !== "/" && previewUrl.pathname !== "") throw new Error(`Unsupported preview URL layout (path prefix ${previewUrl.pathname})`);
    const token = preview.token ?? previewUrl.searchParams.get("slr_token") ?? "";
    // Visiting the preview once with its token sets an auth cookie; later requests need no interception (fast, reliable).
    const bootstrapUrl = previewUrl.searchParams.has("slr_token") ? preview.url : `${previewUrl.origin}/?slr_token=${encodeURIComponent(token)}`;
    let reachable = 0;
    for (let i = 0; i < 10 && !(reachable > 0 && reachable < 400); i++) {
      reachable = await fetch(bootstrapUrl).then((r) => r.status).catch(() => 0);
      if (!(reachable > 0 && reachable < 400)) await new Promise((r) => setTimeout(r, 1500));
    }
    if (!(reachable > 0 && reachable < 400)) throw new Error(`Solari preview for the patched app is unreachable (HTTP ${reachable})`);
    await emit(scope, "VERIFIER", "preview.ready", `Replaying the journey against the patched build via Solari preview ${previewUrl.host}`);
    browser = await openSolariBrowser({ repairId, role: "verifier-replay" });
    const replay = async (step: Step) => {
      // A journey that could not complete is inconclusive, not a verdict: retry once.
      let r = await replayOnce(browser!, previewUrl.origin, repro.trail, step, undefined, { bootstrapUrl, intercept: false });
      if (r.preError || r.obs.error) r = await replayOnce(browser!, previewUrl.origin, repro.trail, step, undefined, { bootstrapUrl, intercept: false });
      return r;
    };
    const runs: (boolean | null)[] = [];
    let afterShot: string | undefined;
    for (let i = 1; i <= 3; i++) {
      const step: Step = repro.trigger.kind === "click" ? { ...repro.trigger, count: i === 3 ? 3 : repro.trigger.count } : repro.trigger;
      const r = await replay(step);
      const ex = exhibits(repro.kind, r.obs);
      const inconclusive = Boolean(r.preError || r.obs.error);
      const okMutations = r.obs.mutations.filter((m) => (m.status ?? 0) > 0 && (m.status ?? 0) < 400).length;
      const ok = inconclusive
        ? null
        : !ex.failed &&
          r.obs.pageErrors.length === 0 &&
          (repro.kind !== "duplicate_mutation" || okMutations === 1) &&
          (repro.trigger.kind !== "goto" || ((r.obs.navigationStatus ?? 0) > 0 && (r.obs.navigationStatus ?? 0) < 400));
      runs.push(ok);
      if (!afterShot && ok && r.shot) afterShot = await saveEvidence({ repairAttemptId: repairId, findingId: finding.id, type: "SCREENSHOT", label: "after", mimeType: "image/jpeg", content: r.shot });
      await emit(
        scope,
        "VERIFIER",
        "replay.run",
        `Patched replay #${i} (${describeStep(step)}): ${ok === null ? "inconclusive" : ok ? "no failure" : "STILL FAILS"} — ${inconclusive ? `journey did not complete: ${(r.preError ?? r.obs.error ?? "").slice(0, 80)}` : ex.detail}`,
        { evidenceId: ok ? afterShot : undefined },
      );
    }
    const conclusive = runs.filter((x) => x !== null) as boolean[];
    const patchedOk = conclusive.length >= 2 ? conclusive.every(Boolean) : conclusive.some((x) => !x) ? false : null;
    await record("Original failure resolved (patched, replays incl. triple-click)", patchedOk, `${conclusive.filter(Boolean).length}/${conclusive.length} conclusive replays clean (${runs.length - conclusive.length} inconclusive)`, { evidenceId: afterShot });
    let regressionOk: boolean | null = null;
    if (repro.control) {
      const c = await replay(repro.control);
      const okMut = c.obs.mutations.filter((m) => (m.status ?? 0) > 0 && (m.status ?? 0) < 400);
      regressionOk = c.preError || c.obs.error ? null : c.obs.mutations.length === 1 && okMut.length === 1 && c.obs.pageErrors.length === 0;
      await record("Normal single-click journey still works", regressionOk, `${c.obs.mutations.length} request(s): ${c.obs.mutations.map((m) => `${m.method} ${m.path} → ${m.status ?? m.failed}`).join(", ") || "none"}`);
    } else {
      const c = await replay({ kind: "goto", path: repro.trail.find((s) => s.kind === "goto")?.path ?? "/" });
      regressionOk = c.preError || c.obs.error ? null : c.obs.pageErrors.length === 0 && (c.obs.navigationStatus ?? 0) < 400;
      await record("Journey still completes on patched build", regressionOk, c.preError ?? c.obs.error ?? `HTTP ${c.obs.navigationStatus}`);
    }
    return await finalizeVerification({ repair, state, patchedOk, regressionOk, afterShot, retryOrReject });
  } catch (err) {
    await finishAgentRun(state.agentRunId, "FAILED", undefined, String((err as Error).message ?? err).slice(0, 300));
    throw err;
  } finally {
    await browser?.close();
    await vsbx?.kill().catch(() => {});
  }
}

/** Adversarial review + verdict. Approval requires every deterministic check; the model can only veto. */
async function finalizeVerification(args: {
  repair: NonNullable<Awaited<ReturnType<typeof loadRepair>>>;
  state: VerifyState;
  patchedOk: boolean | null;
  regressionOk: boolean | null;
  afterShot: string | undefined;
  retryOrReject: (feedback: string) => Promise<void>;
}) {
  const { repair, state, patchedOk, regressionOk, afterShot, retryOrReject } = args;
  const { finding } = repair;
  const repairId = repair.id;
  const scope = { repairAttemptId: repairId, scanId: finding.scanId };
  const meta = (repair.meta ?? {}) as RepairMeta;
  const checks = state.checks;
  let verdict: z.infer<typeof VerdictSchema> | null = null;
  try {
    verdict = await structured({
      name: "verifier_review",
      schema: VerdictSchema,
      system: `You are the Verification agent of GhostLayer. Your job is to PROVE THIS FIX WRONG if you can. You did not write it; do not trust any claims about it.
Look for: race conditions still possible, guards that never reset (control stuck disabled after success OR after an error), changed behavior for normal users, missing error handling, tests that don't actually exercise the bug. Be concrete; do not invent problems the diff cannot have.`,
      user: JSON.stringify({ bug: { title: finding.title, expected: finding.expectedBehavior, actual: finding.actualBehavior }, diff: (repair.diff ?? "").slice(0, 12000), deterministicChecks: checks }),
      maxTokens: 2500,
    });
    await emit(scope, "VERIFIER", "review.completed", `Adversarial review: ${verdict.recommendation}${verdict.concerns.length ? ` — ${verdict.concerns[0]}` : " — no concrete defects found"}`, {
      concerns: verdict.concerns,
      ideas: verdict.adversarialIdeas,
    });
  } catch (err) {
    await emit(scope, "VERIFIER", "review.unavailable", `AI review unavailable: ${String(err).slice(0, 100)}`);
  }
  const approved = state.beforeFailed && patchedOk === true && regressionOk === true && state.testsOk !== false && state.buildOk !== false && verdict?.recommendation !== "reject";
  await db.verificationResult.upsert({ where: { repairAttemptId: repairId }, update: {}, create: { repairAttemptId: repairId, verifierSummary: "pending" } });
  await db.verificationResult.update({
    where: { repairAttemptId: repairId },
    data: {
      buildPassed: state.buildOk,
      existingTestsPassed: state.testsOk,
      originalFailureReproduced: state.beforeFailed,
      patchedFlowPassed: patchedOk,
      regressionTestsPassed: regressionOk,
      humanReviewRequired: true,
      approved,
      verifierSummary: approved
        ? `The original failure reproduced on the unpatched site and did not occur in the patched build's replays (incl. triple-click). Tests and build passed in an independent sandbox. ${verdict?.concerns.length ? `Open concerns: ${verdict.concerns.join("; ")}` : ""}`.trim()
        : `Rejected: ${checks.filter((c) => c.passed === false).map((c) => c.name).join(", ") || verdict?.reasoning || "verification incomplete"}`,
      checks: { checks, verdict } as unknown as Prisma.InputJsonValue,
      evidenceReferences: [state.beforeShot, afterShot].filter(Boolean) as string[],
      completedAt: new Date(),
    },
  });
  await finishAgentRun(state.agentRunId, "COMPLETED", approved ? "Patch approved for human review" : "Patch rejected");
  if (approved) {
    const slug = (meta.branchSlug ?? "repair").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "repair";
    await setStatus(repairId, "READY_FOR_REVIEW", { completedAt: new Date(), branchName: `ghostlayer/fix-${slug}` });
    await db.finding.update({ where: { id: finding.id }, data: { verificationStatus: "FIX_VERIFIED" } });
    await emit(scope, null, "repair.ready", "Return to Wonderland: the fix passed The Trial and is ready for your review");
    return;
  }
  const feedback = `Independent verification rejected the patch: ${checks.filter((c) => c.passed !== true).map((c) => `${c.name} (${c.detail})`).join("; ")}${verdict?.concerns.length ? `. Reviewer concerns: ${verdict.concerns.join("; ")}` : ""}`;
  await emit(scope, "VERIFIER", "repair.rejected", feedback.slice(0, 300));
  return retryOrReject(feedback);
}
