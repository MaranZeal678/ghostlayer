/**
 * Scan orchestrator: QUEUED → INITIALIZING → EXPLORING → INVESTIGATING → COMPLETED
 * (FAILED / CANCELLED / PARTIALLY_COMPLETED are terminal). Runs in the worker, never in a web request.
 */
import { db } from "@/lib/db";
import { emit, finishAgentRun, startAgentRun } from "@/lib/events";
import { assertSafeTarget } from "@/lib/url-safety";
import { enqueue } from "@/lib/queue";
import { currentCredentialSources } from "@/lib/credentials";
import type { Prisma } from "@/generated/prisma/client";
import { openSolariBrowser, describeStep } from "./harness";
import { explore, type Anomaly } from "./explorer";
import { reproduce, writeReport, SEVERITY_RANK } from "./investigator";

export async function saveEvidence(data: {
  scanId?: string;
  findingId?: string;
  repairAttemptId?: string;
  type: "SCREENSHOT" | "LOG" | "TRACE" | "REPLAY" | "DIFF" | "TEST_OUTPUT";
  label: string;
  mimeType?: string;
  content?: Buffer | string;
  storageReference?: string;
}) {
  const content =
    data.content === undefined ? undefined : typeof data.content === "string" ? Buffer.from(data.content, "utf8") : data.content;
  const row = await db.evidenceArtifact.create({
    data: {
      scanId: data.scanId,
      findingId: data.findingId,
      repairAttemptId: data.repairAttemptId,
      type: data.type,
      label: data.label.slice(0, 200),
      mimeType: data.mimeType,
      content: content ? new Uint8Array(content) : undefined,
      storageReference: data.storageReference,
    },
  });
  return row.id;
}

const ANOMALY_PRIORITY: Record<Anomaly["kind"], number> = {
  duplicate_mutation: 5,
  page_error: 4,
  failed_request: 4,
  broken_navigation: 3,
  unresponsive_control: 1,
};

/** Explorer job (SCAN): autonomous exploration, then enqueue the Investigator. */
export async function runScan(scanId: string) {
  const scan = await db.scan.findUnique({ where: { id: scanId }, include: { project: true } });
  if (!scan) throw new Error(`Scan ${scanId} not found`);
  if (scan.status === "CANCELLED" || scan.status === "COMPLETED") return;
  const project = scan.project;
  const scope = { scanId };
  const isCancelled = async () =>
    (await db.scan.findUnique({ where: { id: scanId }, select: { status: true } }))?.status === "CANCELLED";
  const saveShot = (label: string, jpeg: Buffer) => saveEvidence({ scanId, type: "SCREENSHOT", label, mimeType: "image/jpeg", content: jpeg });

  const advance = async (status: "INITIALIZING" | "EXPLORING" | "INVESTIGATING", extra: Record<string, unknown> = {}) =>
    (await db.scan.updateMany({ where: { id: scanId, status: { not: "CANCELLED" } }, data: { status, ...extra } })).count > 0;
  if (!(await advance("INITIALIZING", { startedAt: new Date() }))) return;
  await emit(scope, null, "scan.initializing", `Down the rabbit hole: preparing to explore ${project.websiteUrl}`);
  const src = currentCredentialSources();
  await emit(scope, null, "scan.credentials", `Using ${src.openai === "user" ? "your" : "GhostLayer's default"} OpenAI key and ${src.solari === "user" ? "your" : "GhostLayer's default"} Solari key`);

  // Authorization + target safety (re-checked at run time, not only at project creation).
  if (!project.authorizedAt) throw new Error("The project owner has not confirmed authorization to test this website");
  const target = await assertSafeTarget(project.websiteUrl);
  const origin = target.origin;
  const startPath = target.pathname + target.search || "/";

  const maxActions = Math.min(project.maxActions, Number(process.env.SCAN_MAX_ACTIONS ?? 40));
  const deadline = Date.now() + Number(process.env.SCAN_MAX_MINUTES ?? 6) * 60_000;

  // ── Explorer ──────────────────────────────────────────────
  const explorerRun = await startAgentRun(scope, "EXPLORER", `Explore ${origin} with no bug list (budget: ${maxActions} actions)`);
  let session;
  try {
    session = await openSolariBrowser({ scanId, role: "explorer" });
  } catch (err) {
    await finishAgentRun(explorerRun.id, "FAILED", undefined, `Solari browser failed to start: ${String(err).slice(0, 200)}`);
    throw new Error(`Solari cloud browser could not be started: ${String((err as Error).message ?? err).slice(0, 200)}`);
  }
  await db.agentRun.update({ where: { id: explorerRun.id }, data: { externalExecutionId: session.sessionId } });
  await emit({ ...scope, agentRunId: explorerRun.id }, "EXPLORER", "browser.launched", "Solari cloud browser launched (recording on)", {
    solariSessionId: session.sessionId,
  });
  if (!(await advance("EXPLORING"))) {
    await session.close();
    await emit(scope, null, "scan.cancelled", "Scan cancelled by user");
    await db.scan.update({ where: { id: scanId }, data: { completedAt: new Date() } });
    return;
  }

  let result: Awaited<ReturnType<typeof explore>>;
  try {
    const { harness } = await session.newHarness({ origin, reuseDefault: true });
    result = await explore(harness, {
      scanId,
      runId: explorerRun.id,
      startPath,
      maxActions,
      deadline,
      isCancelled,
      saveScreenshot: saveShot,
    });
    if (harness.blockedNavigations.length)
      await emit(scope, "EXPLORER", "guard.blocked", `Blocked ${harness.blockedNavigations.length} off-origin navigation(s)`, {
        urls: harness.blockedNavigations.slice(0, 5),
      });
  } catch (err) {
    await session.close();
    await finishAgentRun(explorerRun.id, "FAILED", undefined, String((err as Error).message ?? err).slice(0, 300));
    throw err;
  }
  await session.close();
  await saveEvidence({
    scanId,
    type: "REPLAY",
    label: "Explorer session recording (Solari replay)",
    storageReference: `solari-replay:${session.sessionId}`,
  });
  await finishAgentRun(
    explorerRun.id,
    "COMPLETED",
    `Explored ${result.pages} page(s), ${result.interactions} interaction(s), ${result.anomalies.length} Cheshire signal(s)`,
  );

  if (await isCancelled()) {
    await emit(scope, null, "scan.cancelled", "Scan cancelled by user");
    await db.scan.update({ where: { id: scanId }, data: { completedAt: new Date() } });
    return;
  }

  // Persist signals and hand off to the Investigator as a separate durable job (keeps each job short).
  await db.scan.update({
    where: { id: scanId },
    data: {
      signals: { anomalies: result.anomalies, pages: result.pages, interactions: result.interactions } as unknown as Prisma.InputJsonValue,
    },
  });
  await enqueue("INVESTIGATE", scanId, `investigate:${scanId}`);
}

/** Investigator job: reproduce the Explorer's signals in fresh browser contexts and write findings. */
export async function runInvestigate(scanId: string) {
  const scan = await db.scan.findUnique({ where: { id: scanId }, include: { project: true } });
  if (!scan) throw new Error(`Scan ${scanId} not found`);
  if (["CANCELLED", "COMPLETED", "FAILED", "PARTIALLY_COMPLETED"].includes(scan.status)) return;
  const project = scan.project;
  const scope = { scanId };
  const isCancelled = async () =>
    (await db.scan.findUnique({ where: { id: scanId }, select: { status: true } }))?.status === "CANCELLED";
  const saveShot = (label: string, jpeg: Buffer) => saveEvidence({ scanId, type: "SCREENSHOT", label, mimeType: "image/jpeg", content: jpeg });
  const advance = async (status: "INVESTIGATING") =>
    (await db.scan.updateMany({ where: { id: scanId, status: { not: "CANCELLED" } }, data: { status } })).count > 0;
  const origin = (await assertSafeTarget(project.websiteUrl)).origin;
  const result = (scan.signals ?? { anomalies: [], pages: 0, interactions: 0 }) as unknown as { anomalies: Anomaly[]; pages: number; interactions: number };

  if (!(await advance("INVESTIGATING"))) {
    await emit(scope, null, "scan.cancelled", "Scan cancelled by user");
    await db.scan.update({ where: { id: scanId }, data: { completedAt: new Date() } });
    return;
  }
  const signals = [...result.anomalies].sort((a, b) => ANOMALY_PRIORITY[b.kind] - ANOMALY_PRIORITY[a.kind]).slice(0, 6);
  let findingsCount = 0;
  let investigatorFailed = false;
  if (signals.length) {
    const invRun = await startAgentRun(scope, "INVESTIGATOR", `Independently reproduce ${signals.length} signal(s) in fresh browser contexts`);
    let invSession;
    try {
      invSession = await openSolariBrowser({ scanId, role: "investigator" });
      await db.agentRun.update({ where: { id: invRun.id }, data: { externalExecutionId: invSession.sessionId } });
      for (const a of signals) {
        if (await isCancelled()) break;
        await emit({ ...scope, agentRunId: invRun.id }, "INVESTIGATOR", "repro.started", `Reproducing: ${a.summary}`, {
          steps: [...a.trail, a.trigger].map(describeStep),
        });
        const repro = await reproduce(invSession, origin, a, {
          saveScreenshot: saveShot,
          onRun: (r) =>
            emit({ ...scope, agentRunId: invRun.id }, "INVESTIGATOR", "repro.run", `${r.variant === "trigger" ? "Trigger" : "Control"} #${r.attempt}: ${r.failed ? "FAILURE" : "ok"} — ${r.detail}`, {
              variant: r.variant,
              failed: r.failed,
              evidenceId: r.screenshotId,
            }).then(() => {}),
        });
        if (repro.triggerFailures === 0) {
          await emit({ ...scope, agentRunId: invRun.id }, "INVESTIGATOR", "repro.dismissed", `Could not reproduce (0/${repro.triggerRuns}); signal dismissed`);
          continue;
        }
        let report;
        try {
          report = await writeReport(a, repro, project.websiteUrl);
        } catch (err) {
          report = {
            title: a.summary,
            description: a.summary,
            severity: a.kind === "duplicate_mutation" ? ("HIGH" as const) : ("MEDIUM" as const),
            category: "Other" as const,
            expectedBehavior: "The interaction completes once without errors.",
            actualBehavior: repro.runs.find((r) => r.failed)?.detail ?? a.summary,
            reproductionSteps: [...a.trail, a.trigger].map(describeStep),
            likelyComponents: [],
          };
          await emit(scope, "INVESTIGATOR", "report.fallback", `AI report unavailable; using deterministic summary (${String(err).slice(0, 80)})`);
        }
        const evidenceIds = [a.screenshotId, ...repro.runs.map((r) => r.screenshotId)].filter(Boolean) as string[];
        const finding = await db.finding.upsert({
          where: { scanId_fingerprint: { scanId, fingerprint: a.fingerprint } },
          update: {},
          create: {
            scanId,
            projectId: project.id,
            fingerprint: a.fingerprint,
            title: report.title,
            description: report.description,
            severity: report.severity,
            confidence: repro.confidence,
            category: report.category,
            affectedUrl: new URL(a.pagePath, origin).toString(),
            reproductionSteps: {
              human: report.reproductionSteps,
              trail: a.trail,
              trigger: a.trigger,
              control: a.control ?? null,
              kind: a.kind,
              likelyComponents: report.likelyComponents,
            } as unknown as Prisma.InputJsonValue,
            expectedBehavior: report.expectedBehavior,
            actualBehavior: report.actualBehavior,
            evidenceReferences: evidenceIds,
            reproductionStats: {
              triggerRuns: repro.triggerRuns,
              triggerFailures: repro.triggerFailures,
              controlRuns: repro.controlRuns,
              controlFailures: repro.controlFailures,
              runs: repro.runs,
              explorerObservation: {
                mutations: a.observation.mutations,
                consoleErrors: a.observation.consoleErrors.slice(0, 5),
                pageErrors: a.observation.pageErrors.slice(0, 5),
              },
            } as unknown as Prisma.InputJsonValue,
            verificationStatus: repro.confidence === "CONFIRMED" ? "REPRODUCED" : "NEEDS_REVIEW",
          },
        });
        await db.evidenceArtifact.updateMany({ where: { id: { in: evidenceIds } }, data: { findingId: finding.id } });
        findingsCount++;
        await emit({ ...scope, agentRunId: invRun.id }, "INVESTIGATOR", "finding.created", `${report.severity} · ${report.title} (${repro.triggerFailures}/${repro.triggerRuns} reproductions, ${repro.confidence})`, {
          findingId: finding.id,
          severity: report.severity,
          confidence: repro.confidence,
        });
      }
      await finishAgentRun(invRun.id, "COMPLETED", `${findingsCount} finding(s) confirmed or reproduced`);
    } catch (err) {
      investigatorFailed = true;
      await finishAgentRun(invRun.id, "FAILED", undefined, String((err as Error).message ?? err).slice(0, 300));
    } finally {
      await invSession?.close();
      if (invSession)
        await saveEvidence({ scanId, type: "REPLAY", label: "Investigator session recording (Solari replay)", storageReference: `solari-replay:${invSession.sessionId}` });
    }
  }

  const cancelled = await isCancelled();
  const top = await db.finding.findMany({ where: { scanId } });
  const summary = `Explored ${result.pages} page(s) and ${result.interactions} interaction(s); ${result.anomalies.length} signal(s), ${findingsCount} finding(s).`;
  await db.scan.update({
    where: { id: scanId },
    data: {
      status: cancelled ? "CANCELLED" : investigatorFailed ? "PARTIALLY_COMPLETED" : "COMPLETED",
      completedAt: new Date(),
      findingsCount: top.length,
      executionSummary: summary,
    },
  });
  const worst = top.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0];
  await emit(scope, null, "scan.completed", worst ? `${summary} Most severe: ${worst.title}` : summary);
}
