/**
 * Investigator agent — decides whether an Explorer signal is a real, reproducible bug.
 * Replays the rabbit trail in fresh, isolated browser contexts (trigger N times, control M times)
 * and only promotes a signal to CONFIRMED when the deterministic outcome is consistent.
 */
import { z } from "zod";
import { structured } from "@/lib/ai";
import { describeStep, releaseContext, type BrowserSession, type Observation, type Step } from "./harness";
import { duplicateGroups, type Anomaly } from "./explorer";
import type { FindingConfidence, Severity } from "@/generated/prisma/client";

export interface ReproRun {
  variant: "trigger" | "control";
  attempt: number;
  failed: boolean;
  inconclusive?: boolean;
  detail: string;
  mutations: string[];
  screenshotId?: string;
}

export interface ReproResult {
  runs: ReproRun[];
  triggerRuns: number;
  triggerFailures: number;
  controlRuns: number;
  controlFailures: number;
  confidence: FindingConfidence;
}

/** Does this observation exhibit the anomaly? (Pure, deterministic; shared with the Verifier.) */
export function exhibits(kind: Anomaly["kind"], obs: Observation): { failed: boolean; detail: string } {
  switch (kind) {
    case "duplicate_mutation": {
      const d = duplicateGroups(obs);
      return d.length
        ? { failed: true, detail: `${d[0].count}× ${d[0].endpoint} from a single activation` }
        : { failed: false, detail: `${obs.mutations.length} mutation request(s), no duplicates` };
    }
    case "broken_navigation":
      return (obs.navigationStatus ?? 0) >= 400
        ? { failed: true, detail: `HTTP ${obs.navigationStatus}` }
        : { failed: false, detail: `HTTP ${obs.navigationStatus}` };
    case "page_error":
      return obs.pageErrors.length
        ? { failed: true, detail: obs.pageErrors[0].slice(0, 160) }
        : { failed: false, detail: "no uncaught exceptions" };
    case "failed_request":
      return obs.failedRequests.length
        ? { failed: true, detail: `${obs.failedRequests[0].method} ${obs.failedRequests[0].path} → ${obs.failedRequests[0].status ?? obs.failedRequests[0].failed}` }
        : { failed: false, detail: "all requests succeeded" };
    case "unresponsive_control":
      return !obs.urlChanged && !obs.domChanged && obs.mutations.length === 0
        ? { failed: true, detail: "no navigation, DOM change, or request" }
        : { failed: false, detail: "control responded" };
  }
}

/** Run trail + step in a brand-new browser context; returns the observation of the final step. */
export async function replayOnce(
  session: BrowserSession,
  origin: string,
  trail: Step[],
  step: Step,
  originHeaders?: Record<string, string>,
  extra?: { bootstrapUrl?: string; intercept?: boolean },
) {
  const { harness, context } = await session.newHarness({ origin, originHeaders, ...(extra ?? {}) });
  try {
    const pre = await harness.replay(trail);
    const preError = pre.find((o) => o.error)?.error;
    const obs = await harness.observe(step);
    const shot = await harness.screenshot().catch(() => null);
    const body = await harness.bodyText(600);
    return { obs, shot, body, preError };
  } finally {
    await releaseContext(session.browser, context);
  }
}

export async function reproduce(
  session: BrowserSession,
  origin: string,
  anomaly: Anomaly,
  opts: {
    triggerRuns?: number;
    controlRuns?: number;
    onRun?: (r: ReproRun) => Promise<void>;
    saveScreenshot: (label: string, jpeg: Buffer) => Promise<string>;
  },
): Promise<ReproResult> {
  const runs: ReproRun[] = [];
  const triggerRuns = opts.triggerRuns ?? 3;
  const controlRuns = anomaly.control ? (opts.controlRuns ?? 2) : 0;
  const plan: { variant: "trigger" | "control"; step: Step }[] = [];
  for (let i = 0; i < triggerRuns; i++) plan.push({ variant: "trigger", step: anomaly.trigger });
  for (let i = 0; i < controlRuns; i++) plan.push({ variant: "control", step: anomaly.control! });
  let attemptT = 0;
  let attemptC = 0;
  for (const p of plan) {
    const attempt = p.variant === "trigger" ? ++attemptT : ++attemptC;
    // A journey that could not be completed is not evidence either way: retry once, then mark inconclusive.
    let r = await replayOnce(session, origin, anomaly.trail, p.step);
    if (r.preError || r.obs.error) r = await replayOnce(session, origin, anomaly.trail, p.step);
    const { obs, shot, preError } = r;
    const inconclusive = Boolean(preError || obs.error);
    let { failed, detail } = exhibits(anomaly.kind, obs);
    if (p.variant === "control" && anomaly.kind === "duplicate_mutation") {
      // A healthy control submits exactly once.
      failed = obs.mutations.length !== 1;
      detail = `${obs.mutations.length} mutation request(s) from a single click`;
    }
    if (inconclusive) {
      failed = false;
      detail = `inconclusive — journey did not complete (${(preError ?? obs.error ?? "").slice(0, 80)})`;
    }
    const screenshotId = shot
      ? await opts.saveScreenshot(`${p.variant === "trigger" ? "Reproduction" : "Control"} #${attempt}: ${describeStep(p.step)}`, shot)
      : undefined;
    const run: ReproRun = {
      variant: p.variant,
      attempt,
      failed,
      inconclusive,
      detail,
      mutations: obs.mutations.map((m) => `${m.method} ${m.path} → ${m.status ?? m.failed ?? "pending"}`),
      screenshotId,
    };
    runs.push(run);
    await opts.onRun?.(run);
  }
  const triggerFailures = runs.filter((r) => r.variant === "trigger" && r.failed).length;
  const controlFailures = runs.filter((r) => r.variant === "control" && r.failed).length;
  const triggerConclusive = runs.filter((r) => r.variant === "trigger" && !r.inconclusive).length;
  const controlConclusive = runs.filter((r) => r.variant === "control" && !r.inconclusive).length;
  let confidence: FindingConfidence = "SUSPECTED";
  if (triggerConclusive >= 2 && triggerFailures === triggerConclusive && controlFailures === 0 && (controlRuns === 0 || controlConclusive >= 1))
    confidence = anomaly.kind === "unresponsive_control" ? "NEEDS_REVIEW" : "CONFIRMED";
  else if (triggerFailures >= Math.ceil(triggerRuns / 2)) confidence = "REPRODUCED";
  return { runs, triggerRuns, triggerFailures, controlRuns, controlFailures, confidence };
}

const ReportSchema = z.object({
  title: z.string().describe("Concise bug title, e.g. 'Double-clicking Place order creates duplicate orders'"),
  description: z.string().describe("2-4 sentences: what happens and why it matters to users/business"),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  category: z.enum(["Duplicate operation", "Broken navigation", "Runtime error", "Failed request", "Unresponsive control", "Other"]),
  expectedBehavior: z.string(),
  actualBehavior: z.string(),
  reproductionSteps: z.array(z.string()).describe("Numbered human-readable steps a developer can follow"),
  likelyComponents: z.array(z.string()).describe("Guesses at UI components/handlers/endpoints involved; mark as hypotheses"),
});
export type BugReport = z.infer<typeof ReportSchema>;

export async function writeReport(anomaly: Anomaly, repro: ReproResult, siteUrl: string): Promise<BugReport> {
  const steps = [...anomaly.trail, anomaly.trigger].map(describeStep);
  return structured({
    name: "bug_report",
    schema: ReportSchema,
    system: `You are the Investigator agent of GhostLayer. Write a precise, factual bug report from deterministic reproduction evidence.
Only state facts supported by the evidence; label guesses as hypotheses. Severity guide: duplicate payments/orders or data loss = HIGH/CRITICAL; broken links = LOW/MEDIUM; uncaught errors that break a flow = HIGH.`,
    user: JSON.stringify({
      site: siteUrl,
      signal: anomaly.summary,
      kind: anomaly.kind,
      page: anomaly.pagePath,
      recordedSteps: steps,
      reproduction: {
        triggerRuns: repro.triggerRuns,
        triggerFailures: repro.triggerFailures,
        controlRuns: repro.controlRuns,
        controlFailures: repro.controlFailures,
        runs: repro.runs.map((r) => ({ variant: r.variant, failed: r.failed, detail: r.detail, requests: r.mutations })),
      },
      consoleErrors: anomaly.observation.consoleErrors.slice(0, 5),
    }),
    maxTokens: 2500,
  });
}

export const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
