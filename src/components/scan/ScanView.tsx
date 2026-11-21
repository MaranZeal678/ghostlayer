"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Compass, Microscope, Wrench, Scale, GitPullRequest, Radio, CircleSlash, Loader2, Images, Share2, Orbit, Wifi, WifiOff } from "lucide-react";
import { Badge, Button, Card, label, severityTone, statusTone } from "@/components/ui/primitives";
import { AgentConstellationClient } from "@/components/landing/ThreeClient";
import type { AgentKey, AgentNodeState } from "@/components/three/AgentConstellation";
import { ActivityFeed, AGENT_COLOR } from "@/components/dashboard/ActivityFeed";
import { useEventStream } from "./useEventStream";
import { ExplorationGraph, type GEdge, type GNode } from "./ExplorationGraph";
import { cn } from "@/lib/cn";
import { clock } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Snapshot {
  scan: any;
  agentRuns: any[];
  findings: any[];
  activeRepairs: number;
}

const AGENTS: { key: AgentKey; name: string; role: string; icon: typeof Compass }[] = [
  { key: "EXPLORER", name: "Explorer", role: "Explores the site like a real user", icon: Compass },
  { key: "INVESTIGATOR", name: "Investigator", role: "Proves signals are reproducible bugs", icon: Microscope },
  { key: "ENGINEER", name: "Engineer", role: "Patches code in a Solari sandbox", icon: Wrench },
  { key: "VERIFIER", name: "Verifier", role: "Tries to prove the fix wrong", icon: Scale },
  { key: "PUBLISHER", name: "GitHub Publisher", role: "Opens a draft pull request", icon: GitPullRequest },
];
const STEPS = ["QUEUED", "INITIALIZING", "EXPLORING", "INVESTIGATING", "COMPLETED"];
const TERMINAL = ["COMPLETED", "FAILED", "CANCELLED", "PARTIALLY_COMPLETED"];

function runState(run: any | undefined): AgentNodeState {
  if (!run) return "idle";
  if (run.status === "RUNNING") return "running";
  if (run.status === "COMPLETED") return "completed";
  if (run.status === "FAILED") return "failed";
  return "idle";
}

export function ScanView({ projectId, scanId, projectName, websiteUrl, repoConnected }: { projectId: string; scanId: string; projectName: string; websiteUrl: string; repoConnected: boolean }) {
  const router = useRouter();
  const { events, snapshot, connected } = useEventStream<Snapshot>(`/api/scans/${scanId}/events`);
  const [tab, setTab] = useState<"glass" | "graph" | "constellation">("glass");
  const [selectedAgent, setSelectedAgent] = useState<AgentKey | null>(null);
  const [shotIdx, setShotIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const scan = snapshot?.scan;
  const status: string = scan?.status ?? "QUEUED";
  const visible = events.filter((e) => e.eventType !== "repair.meta");

  const latestRun = useMemo(() => {
    const m: Partial<Record<AgentKey, any>> = {};
    for (const r of snapshot?.agentRuns ?? []) m[r.agentType as AgentKey] = r;
    return m;
  }, [snapshot]);
  const states = useMemo(() => {
    const s: Partial<Record<AgentKey, AgentNodeState>> = {};
    for (const a of AGENTS) s[a.key] = runState(latestRun[a.key]);
    const awaitingPublish = snapshot?.findings.some((f) => f.repairs?.[0]?.status === "READY_FOR_REVIEW");
    if (awaitingPublish && s.PUBLISHER === "idle") s.PUBLISHER = "waiting";
    return s;
  }, [latestRun, snapshot]);
  const activeEdge = useMemo<[AgentKey, AgentKey] | null>(() => {
    if (states.INVESTIGATOR === "running") return ["EXPLORER", "INVESTIGATOR"];
    if (states.ENGINEER === "running") return ["INVESTIGATOR", "ENGINEER"];
    if (states.VERIFIER === "running") return ["ENGINEER", "VERIFIER"];
    if (states.PUBLISHER === "running") return ["VERIFIER", "PUBLISHER"];
    return null;
  }, [states]);

  const shots = useMemo(
    () => visible.filter((e) => typeof e.structuredPayload?.evidenceId === "string").map((e) => ({ id: e.structuredPayload!.evidenceId as string, caption: e.message, agent: e.agentType, t: e.timestamp })),
    [visible],
  );
  const shown = shotIdx === null ? shots[shots.length - 1] : shots[shotIdx];
  const lastEvent = (k: AgentKey) => [...visible].reverse().find((e) => e.agentType === k);
  const graph = (scan?.graph ?? { nodes: [], edges: [] }) as { nodes: GNode[]; edges: GEdge[] };
  const activePath = [...visible].reverse().find((e) => e.eventType === "page.visited")?.structuredPayload?.path as string | undefined;

  const signals = visible.filter((e) => e.eventType === "signal.detected").length;
  const reproRuns = visible.filter((e) => e.eventType === "repro.run").length;

  useEffect(() => {
    timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: "smooth" });
  }, [visible.length]);

  async function cancel() {
    setBusy("cancel");
    await fetch(`/api/scans/${scanId}/cancel`, { method: "POST" });
    setBusy(null);
  }
  async function repair(findingId: string) {
    setBusy(findingId);
    const res = await fetch(`/api/findings/${findingId}/repairs`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return alert(d.error ?? "Could not start repair");
    router.push(`/dashboard/projects/${projectId}/findings/${findingId}`);
  }

  const stepIdx = STEPS.indexOf(status);
  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/dashboard/projects/${projectId}`} className="text-xs text-faint hover:text-muted">{projectName} /</Link>
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
            The Looking Glass
            <Badge tone={statusTone(status)}>{label(status)}</Badge>
          </h1>
          <p className="text-sm text-muted">Live autonomous scan of {websiteUrl} · started {scan?.startedAt ? clock(scan.startedAt) : "—"}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("flex items-center gap-1.5 text-xs", connected ? "text-emerald" : "text-faint")}>
            {connected ? <Wifi size={13} /> : <WifiOff size={13} />} {connected ? "Live" : TERMINAL.includes(status) ? "Finished" : "Reconnecting…"}
          </span>
          {!TERMINAL.includes(status) && (
            <Button variant="danger" size="sm" onClick={cancel} disabled={busy === "cancel"}>
              <CircleSlash size={14} /> Cancel scan
            </Button>
          )}
        </div>
      </header>

      {/* Stepper */}
      <div className="glass flex items-center gap-2 overflow-x-auto rounded-2xl px-4 py-3">
        {STEPS.map((s, i) => {
          const done = stepIdx > i || status === "COMPLETED";
          const cur = stepIdx === i && !TERMINAL.includes(status);
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={cn("flex items-center gap-2 rounded-full px-3 py-1 text-xs whitespace-nowrap", cur ? "bg-violet/20 text-ink" : done ? "text-emerald" : "text-faint")}>
                {cur ? <Loader2 size={12} className="animate-spin" /> : <span className={cn("h-1.5 w-1.5 rounded-full", done ? "bg-emerald" : "bg-faint")} />}
                {label(s)}
              </div>
              {i < STEPS.length - 1 && <div className={cn("h-px w-6 md:w-10", done ? "bg-emerald/50" : "bg-line")} />}
            </div>
          );
        })}
        {["FAILED", "CANCELLED", "PARTIALLY_COMPLETED"].includes(status) && <Badge tone={statusTone(status)} className="ml-2">{label(status)}</Badge>}
      </div>
      {scan?.errorMessage && <div className="rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">{scan.errorMessage}</div>}

      {/* Metrics: counts only — total site state space is unknown, so no coverage %. */}
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
        {[
          ["Pages explored", scan?.pagesExplored ?? 0],
          ["Interactions tested", scan?.interactionsTested ?? 0],
          ["Cheshire signals", signals],
          ["Reproduction runs", reproRuns],
          ["Findings", snapshot?.findings.length ?? 0],
          ["Repairs active", snapshot?.activeRepairs ?? 0],
        ].map(([l, v]) => (
          <div key={l as string} className="glass rounded-xl px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-faint">{l}</div>
            <motion.div key={String(v)} initial={{ opacity: 0.4, y: -3 }} animate={{ opacity: 1, y: 0 }} className="font-mono text-xl">{v as number}</motion.div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[260px_1fr_320px]">
        {/* Agents */}
        <Card className="space-y-1 p-3">
          <div className="px-2 pt-1 pb-2 text-xs font-medium uppercase tracking-wider text-faint">The Tea Party · agents</div>
          {AGENTS.map((a) => {
            const st = states[a.key]!;
            const last = lastEvent(a.key);
            return (
              <button key={a.key} onClick={() => { setSelectedAgent(a.key); setTab("constellation"); }} className={cn("w-full rounded-xl p-3 text-left transition-colors", selectedAgent === a.key ? "bg-violet/15" : "hover:bg-white/[0.04]")}>
                <div className="flex items-center gap-2">
                  <a.icon size={15} className={AGENT_COLOR[a.key]} />
                  <span className="text-sm font-medium">{a.name}</span>
                  <span className={cn("ml-auto h-2 w-2 rounded-full", st === "running" ? "animate-pulse bg-cyan" : st === "completed" ? "bg-emerald" : st === "failed" ? "bg-coral" : st === "waiting" ? "bg-amber" : "bg-faint/50")} />
                </div>
                <div className="mt-0.5 text-[11px] text-faint">{a.role}</div>
                <AnimatePresence mode="wait">
                  {last && (
                    <motion.div key={last.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-1.5 line-clamp-2 text-xs text-muted">
                      {last.message}
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </Card>

        {/* Center */}
        <Card className="flex min-h-[460px] flex-col overflow-hidden">
          <div className="flex items-center gap-1 border-b border-line px-3 pt-2">
            {[
              ["glass", "Browser view", Images],
              ["graph", "Rabbit trail graph", Share2],
              ["constellation", "Agent constellation", Orbit],
            ].map(([k, l, Icon]: any) => (
              <button key={k} onClick={() => setTab(k)} className={cn("relative flex items-center gap-1.5 px-3 py-2 text-sm", tab === k ? "text-ink" : "text-muted hover:text-ink")}>
                <Icon size={14} /> {l}
                {tab === k && <motion.span layoutId="scan-tab" className="absolute inset-x-2 -bottom-px h-0.5 bg-cyan" />}
              </button>
            ))}
          </div>
          <div className="relative flex-1 p-3">
            {tab === "glass" && (
              <div className="flex h-full flex-col gap-2">
                {shown ? (
                  <>
                    <div className="relative overflow-hidden rounded-xl border border-line bg-black/40">
                      <div className="flex items-center gap-1.5 border-b border-line bg-surface-2/80 px-3 py-1.5">
                        <span className="h-2 w-2 rounded-full bg-coral/60" /><span className="h-2 w-2 rounded-full bg-amber/60" /><span className="h-2 w-2 rounded-full bg-emerald/60" />
                        <span className="ml-2 truncate font-mono text-[11px] text-muted">{shown.caption}</span>
                        <Badge tone="cyan" className="ml-auto shrink-0">Captured {clock(shown.t)}</Badge>
                      </div>
                      <AnimatePresence mode="wait">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <motion.img key={shown.id} src={`/api/evidence/${shown.id}`} alt={shown.caption} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full" />
                      </AnimatePresence>
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {shots.map((s, i) => (
                        <button key={s.id + i} onClick={() => setShotIdx(i === shots.length - 1 ? null : i)} title={s.caption} className={cn("h-12 w-20 shrink-0 overflow-hidden rounded-md border", shown?.id === s.id ? "border-cyan" : "border-line opacity-60 hover:opacity-100")}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/evidence/${s.id}`} alt="" className="h-full w-full object-cover object-top" />
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-faint">Real screenshots captured by the agents&apos; Solari cloud browsers (not a video stream). Full session recordings are saved as evidence.</p>
                  </>
                ) : (
                  <div className="grid h-full place-items-center text-center text-sm text-muted">
                    <div className="space-y-2">
                      <Radio className="mx-auto animate-pulse text-cyan" />
                      <p>{TERMINAL.includes(status) ? "No screenshots were captured." : "Waiting for the Explorer's first page…"}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            {tab === "graph" && <ExplorationGraph nodes={graph.nodes} edges={graph.edges} activePath={TERMINAL.includes(status) ? null : activePath} />}
            {tab === "constellation" && (
              <div className="space-y-3">
                <AgentConstellationClient states={states} activeEdge={activeEdge} onSelect={setSelectedAgent} selected={selectedAgent} height={340} />
                {selectedAgent && (
                  <div className="rounded-xl border border-line p-3 text-sm">
                    <div className="font-medium">{AGENTS.find((a) => a.key === selectedAgent)?.name}</div>
                    <div className="text-xs text-muted">{latestRun[selectedAgent]?.taskDescription ?? "Not started in this scan"}</div>
                    {latestRun[selectedAgent]?.outputSummary && <div className="mt-1 text-xs text-emerald">{latestRun[selectedAgent].outputSummary}</div>}
                    {latestRun[selectedAgent]?.errorMessage && <div className="mt-1 text-xs text-coral">{latestRun[selectedAgent].errorMessage}</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Findings */}
        <Card className="space-y-2 p-3">
          <div className="px-2 pt-1 pb-1 text-xs font-medium uppercase tracking-wider text-faint">Findings</div>
          {!snapshot?.findings.length && <p className="px-2 text-sm text-muted">{TERMINAL.includes(status) ? "No reproducible bugs found in this scan." : "Findings appear here once the Investigator reproduces them."}</p>}
          <AnimatePresence>
            {snapshot?.findings.map((f) => {
              const r = f.repairs?.[0];
              return (
                <motion.div key={f.id} layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="rounded-xl border border-line p-3">
                  <Link href={`/dashboard/projects/${projectId}/findings/${f.id}`} className="text-sm font-medium hover:text-lavender">{f.title}</Link>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>
                    <Badge tone={statusTone(f.confidence)}>{label(f.confidence)}</Badge>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-faint">{(() => { try { return new URL(f.affectedUrl).pathname; } catch { return f.affectedUrl; } })()} · {(f.reproductionStats as any)?.triggerFailures}/{(f.reproductionStats as any)?.triggerRuns} repro</div>
                  <div className="mt-2">
                    {r ? (
                      <Link href={`/dashboard/projects/${projectId}/findings/${f.id}`}>
                        <Badge tone={statusTone(r.status)}>Repair · {label(r.status)}</Badge>
                        {r.pullRequest && <Badge tone="emerald" className="ml-1">PR #{r.pullRequest.githubNumber}</Badge>}
                      </Link>
                    ) : repoConnected && ["CONFIRMED", "REPRODUCED"].includes(f.confidence) ? (
                      <Button size="sm" variant="secondary" disabled={busy === f.id} onClick={() => repair(f.id)}>
                        {busy === f.id ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />} Repair autonomously
                      </Button>
                    ) : (
                      <span className="text-[11px] text-faint">{repoConnected ? "Needs human review" : "Connect a repo to enable repair"}</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </Card>
      </div>

      {/* Timeline */}
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-medium uppercase tracking-wider text-faint">Activity timeline · the rabbit trail</div>
          <div className="text-xs text-faint">{visible.length} events</div>
        </div>
        <div ref={timelineRef} className="max-h-80 overflow-y-auto pr-2">
          <ActivityFeed compact={false} events={visible.map((e) => ({ id: e.id, agentType: e.agentType, eventType: e.eventType, message: e.message, timestamp: e.timestamp }))} />
        </div>
      </Card>
    </div>
  );
}
