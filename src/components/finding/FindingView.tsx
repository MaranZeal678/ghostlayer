"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, XCircle, MinusCircle, AlertTriangle, Wrench, GitPullRequest, Loader2, ExternalLink, Download, ShieldAlert } from "lucide-react";
import { Badge, Button, Card, label, severityTone, statusTone } from "@/components/ui/primitives";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { useEventStream } from "@/components/scan/useEventStream";
import { BeforeAfter } from "./BeforeAfter";
import { DiffView } from "./DiffView";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */
const REPAIR_STEPS = ["QUEUED", "PREPARING", "DIAGNOSING", "PATCHING", "TESTING", "VERIFYING", "READY_FOR_REVIEW", "PUBLISHING", "PR_CREATED"];

function Check({ name, value, detail }: { name: string; value: boolean | null | undefined; detail?: string }) {
  const Icon = value === true ? CheckCircle2 : value === false ? XCircle : MinusCircle;
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-line px-3 py-2">
      <Icon size={16} className={cn("mt-0.5 shrink-0", value === true ? "text-emerald" : value === false ? "text-coral" : "text-faint")} />
      <div className="min-w-0">
        <div className="text-sm">{name}</div>
        {detail && <div className="truncate text-xs text-muted" title={detail}>{detail}</div>}
      </div>
      <span className={cn("ml-auto text-[11px] whitespace-nowrap", value === true ? "text-emerald" : value === false ? "text-coral" : "text-faint")}>{value === true ? "passed" : value === false ? "failed" : "not run"}</span>
    </div>
  );
}

export function FindingView({ finding, evidence, repair: initialRepair, repoConnected }: { finding: any; evidence: any[]; repair: any | null; repoConnected: boolean }) {
  const router = useRouter();
  const [repairId, setRepairId] = useState<string | null>(initialRepair?.id ?? null);
  const { events, snapshot } = useEventStream<{ repair: any }>(repairId ? `/api/repairs/${repairId}/events` : null);
  const repair = snapshot?.repair ?? initialRepair;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [publishRequested, setPublishRequested] = useState(false);
  const status: string | undefined = repair?.status;
  const visibleErr = status && ["PUBLISHING", "PR_CREATED"].includes(status) ? null : err;
  const repro = finding.reproductionSteps ?? {};
  const stats = finding.reproductionStats ?? {};
  const v = repair?.verification;
  const vChecks: { name: string; passed: boolean | null; detail: string }[] = v?.checks?.checks ?? [];
  const concerns: string[] = v?.checks?.verdict?.concerns ?? [];

  const shots = evidence.filter((e) => e.type === "SCREENSHOT" && !["before", "after"].includes(e.label));
  const replays = evidence.filter((e) => e.type === "REPLAY");
  const repairEvidence = (() => {
    const evs = events.filter((e) => e.repairAttemptId === repair?.id);
    const fromEvents = (name: string) => evs.find((e) => e.eventType === "check.result" && (e.structuredPayload as any)?.evidenceId && (e.structuredPayload as any)?.name?.startsWith(name))?.structuredPayload?.evidenceId as string | undefined;
    const refs: string[] = v?.evidenceReferences ?? [];
    return { before: refs[0] ?? fromEvents("Original failure reproduced"), after: refs[1] ?? fromEvents("Original failure resolved") };
  })();

  async function startRepair() {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/findings/${finding.id}/repairs`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(d.error ?? "Could not start repair");
    setRepairId(d.repair.id);
  }
  async function publish() {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/repairs/${repair.id}/publish`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setErr(d.error ?? "Could not publish");
    } else {
      setPublishRequested(true);
      router.refresh();
    }
  }

  const stepIdx = repair ? REPAIR_STEPS.indexOf(repair.status) : -1;
  return (
    <div className="space-y-6">
      <header>
        <Link href={`/dashboard/projects/${finding.projectId}`} className="text-xs text-faint hover:text-muted">{finding.project.name} / Findings /</Link>
        <h1 className="mt-1 flex items-start gap-3 text-2xl font-semibold tracking-tight md:text-3xl">
          <AlertTriangle className={cn("mt-1 shrink-0", severityTone(finding.severity) === "coral" ? "text-coral" : "text-amber")} />
          {finding.title}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={severityTone(finding.severity)}>{finding.severity}</Badge>
          <Badge tone={statusTone(finding.confidence)}>{label(finding.confidence)}</Badge>
          <Badge>{finding.category}</Badge>
          <Badge tone={statusTone(finding.verificationStatus)}>{label(finding.verificationStatus)}</Badge>
          <a href={finding.affectedUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-mono text-xs text-muted hover:text-ink">{finding.affectedUrl} <ExternalLink size={11} /></a>
          <span className="text-xs text-faint">discovered {timeAgo(finding.createdAt)} · <Link className="hover:underline" href={`/dashboard/projects/${finding.projectId}/scans/${finding.scanId}`}>view scan</Link></span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-medium text-faint uppercase tracking-wider">Overview</h2>
            <p className="text-ink/90">{finding.description}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-emerald/20 bg-emerald/5 p-3">
                <div className="text-xs font-medium text-emerald">Expected</div>
                <p className="mt-1 text-sm">{finding.expectedBehavior}</p>
              </div>
              <div className="rounded-xl border border-coral/20 bg-coral/5 p-3">
                <div className="text-xs font-medium text-coral">Actual</div>
                <p className="mt-1 text-sm">{finding.actualBehavior}</p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-medium text-faint uppercase tracking-wider">Reproduction · the rabbit trail</h2>
            <ol className="space-y-1.5">
              {(repro.human ?? []).map((s: string, i: number) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="font-mono text-faint">{String(i + 1).padStart(2, "0")}</span> {s.replace(/^\s*\d+[.)]\s*/, "")}
                </li>
              ))}
            </ol>
            {stats.runs && (
              <div className="mt-4 overflow-hidden rounded-xl border border-line">
                <div className="bg-surface/60 px-3 py-2 text-xs text-muted">
                  Independent replays in fresh browser contexts: <span className="text-coral">{stats.triggerFailures}/{stats.triggerRuns} trigger runs failed</span> · <span className="text-emerald">{(stats.controlRuns ?? 0) - (stats.controlFailures ?? 0)}/{stats.controlRuns ?? 0} control runs normal</span>
                </div>
                {stats.runs.map((r: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 border-t border-line px-3 py-2 text-xs">
                    <Badge tone={r.variant === "trigger" ? "violet" : "slate"}>{r.variant} #{r.attempt}</Badge>
                    {r.failed ? <XCircle size={14} className="text-coral" /> : <CheckCircle2 size={14} className="text-emerald" />}
                    <span className="flex-1 text-muted">{r.detail}</span>
                    <span className="hidden font-mono text-faint md:block">{r.mutations?.join(" · ")}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-medium text-faint uppercase tracking-wider">Evidence</h2>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {shots.map((e) => (
                <button key={e.id} onClick={() => setZoom(e.id)} className="group overflow-hidden rounded-lg border border-line text-left hover:border-line-strong">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/evidence/${e.id}`} alt={e.label} className="aspect-video w-full object-cover object-top" />
                  <div className="truncate px-2 py-1 text-[11px] text-muted">{e.label}</div>
                </button>
              ))}
            </div>
            {replays.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {replays.map((r) => (
                  <a key={r.id} href={`/api/evidence/${r.id}`} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:text-ink">
                    <Download size={12} /> {r.label} (rrweb)
                  </a>
                ))}
              </div>
            )}
          </Card>

          {repair?.diff && (
            <Card className="p-5">
              <h2 className="mb-1 text-sm font-medium text-faint uppercase tracking-wider">Proposed patch</h2>
              {repair.rootCause && <p className="mb-3 text-sm"><span className="text-muted">Root cause:</span> {repair.rootCause}</p>}
              {repair.patchSummary && <p className="mb-3 text-sm text-muted">{repair.patchSummary}</p>}
              <DiffView diff={repair.diff} />
            </Card>
          )}
        </div>

        {/* Repair column */}
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-medium"><Wrench size={15} className="text-amber" /> Autonomous repair</h2>
            {!repair && (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-muted">The Engineer will clone the repository into an isolated Solari sandbox, write a targeted fix and regression test, run the checks, then hand it to an independent Verifier.</p>
                {repoConnected ? (
                  <Button onClick={startRepair} disabled={busy || !["CONFIRMED", "REPRODUCED"].includes(finding.confidence)} className="w-full">
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Wrench size={15} />} Send to the Engineer
                  </Button>
                ) : (
                  <Link href={`/dashboard/projects/${finding.projectId}`} className="text-sm text-lavender underline">Connect a repository to enable repair</Link>
                )}
              </div>
            )}
            {repair && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-1">
                  {REPAIR_STEPS.slice(0, 7).map((s, i) => (
                    <span key={s} className={cn("rounded-full px-2 py-0.5 text-[10px]", stepIdx === i && !["READY_FOR_REVIEW"].includes(s) ? "bg-violet/25 text-ink" : stepIdx > i || ["PR_CREATED", "READY_FOR_REVIEW"].includes(repair.status) ? "bg-emerald/10 text-emerald" : "bg-white/5 text-faint")}>
                      {label(s)}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={statusTone(repair.status)}>{label(repair.status)}</Badge>
                  <span className="text-xs text-faint">attempt {repair.attempt}</span>
                  {!["READY_FOR_REVIEW", "PR_CREATED", "REJECTED", "FAILED"].includes(repair.status) && <Loader2 size={13} className="animate-spin text-cyan" />}
                </div>
                {repair.errorMessage && <p className="text-xs text-coral">{repair.errorMessage}</p>}
                {["REJECTED", "FAILED"].includes(repair.status) && (
                  <Button variant="secondary" size="sm" onClick={startRepair} disabled={busy}>Retry repair</Button>
                )}
              </div>
            )}
          </Card>

          {v && (
            <Card className="space-y-2 p-5">
              <h2 className="flex items-center gap-2 text-sm font-medium">⚖️ The Trial · independent verification</h2>
              <p className="text-xs text-muted">Each check is reported separately. There is no single &ldquo;100% fixed&rdquo; score.</p>
              <Check name="Build" value={v.buildPassed} />
              <Check name="Existing tests" value={v.existingTestsPassed} />
              <Check name="Original failure reproduced (before)" value={v.originalFailureReproduced} detail={vChecks.find((c) => c.name.startsWith("Original failure reproduced"))?.detail} />
              <Check name="Original failure resolved (after)" value={v.patchedFlowPassed} detail={vChecks.find((c) => c.name.startsWith("Original failure resolved"))?.detail} />
              <Check name="Browser regression: normal journey" value={v.regressionTestsPassed} detail={vChecks.find((c) => c.name.startsWith("Normal"))?.detail} />
              <div className="flex items-center gap-2 rounded-lg border border-amber/30 bg-amber/5 px-3 py-2 text-sm text-amber"><ShieldAlert size={15} /> Human review required</div>
              <p className="pt-1 text-xs text-muted">{v.verifierSummary}</p>
              {concerns.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-xs text-amber/90">
                  {concerns.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              )}
            </Card>
          )}

          {repair?.status === "READY_FOR_REVIEW" && !repair.pullRequest && !publishRequested && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="glow-violet space-y-3 p-5">
                <h2 className="text-sm font-medium">Return to Wonderland</h2>
                <p className="text-sm text-muted">The fix passed The Trial. Review the diff, then publish it as a <b>draft</b> pull request on a new branch. GhostLayer never pushes to your default branch or merges.</p>
                <Button onClick={publish} disabled={busy} className="w-full">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <GitPullRequest size={15} />} Approve &amp; open draft PR
                </Button>
              </Card>
            </motion.div>
          )}
          {(repair?.status === "PUBLISHING" || (publishRequested && !repair?.pullRequest)) && (
            <Card className="flex items-center gap-2 p-5 text-sm text-muted"><Loader2 size={15} className="animate-spin" /> Publisher is opening the draft PR…</Card>
          )}
          <AnimatePresence>
            {repair?.pullRequest && (
              <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
                <Card className="space-y-2 border-emerald/30 p-5">
                  <div className="flex items-center gap-2 text-emerald"><GitPullRequest size={16} /> Draft PR #{repair.pullRequest.githubNumber} opened</div>
                  <p className="text-sm">The hidden bug has been found. The fix is ready for review.</p>
                  <a href={repair.pullRequest.githubUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-lavender hover:underline">{repair.pullRequest.githubUrl.replace("https://github.com/", "")} <ExternalLink size={12} /></a>
                  <div className="font-mono text-xs text-faint">{repair.pullRequest.branchName}</div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
          {visibleErr && <div className="rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">{visibleErr}</div>}

          {repairId && (
            <Card className="p-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-faint">Repair timeline</div>
              <div className="max-h-96 overflow-y-auto pr-1">
                <ActivityFeed events={events.filter((e) => e.eventType !== "repair.meta").map((e) => ({ id: e.id, agentType: e.agentType, eventType: e.eventType, message: e.message, timestamp: e.timestamp }))} />
              </div>
            </Card>
          )}
        </div>
      </div>

      {repairEvidence.before && repairEvidence.after && (
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-medium text-faint uppercase tracking-wider">Before &amp; after · same journey, replayed by the Verifier</h2>
          <p className="mb-3 text-xs text-muted">Left: the live (unpatched) site. Right: the patched build running in a Solari sandbox. Drag to compare.</p>
          <BeforeAfter before={`/api/evidence/${repairEvidence.before}`} after={`/api/evidence/${repairEvidence.after}`} />
        </Card>
      )}

      <AnimatePresence>
        {zoom && (
          <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setZoom(null)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/evidence/${zoom}`} alt="" className="max-h-full max-w-full rounded-xl border border-line" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
