"use client";

import { Compass, GitPullRequestDraft, Radar, ShieldCheck, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { AgentKey, AgentNodeState } from "@/components/three/AgentConstellation";
import { AgentConstellationClient } from "./ThreeClient";
import { cn } from "./cn";
import { Reveal, SectionHeading } from "./primitives";

type Frame = { states: Partial<Record<AgentKey, AgentNodeState>>; edge: [AgentKey, AgentKey] | null };

/** Decorative, locally simulated run — includes one trip around the repair loop. */
const FRAMES: Frame[] = [
  { states: { EXPLORER: "running" }, edge: null },
  { states: { EXPLORER: "completed", INVESTIGATOR: "running" }, edge: ["EXPLORER", "INVESTIGATOR"] },
  { states: { EXPLORER: "completed", INVESTIGATOR: "completed", ENGINEER: "running" }, edge: ["INVESTIGATOR", "ENGINEER"] },
  {
    states: { EXPLORER: "completed", INVESTIGATOR: "completed", ENGINEER: "waiting", VERIFIER: "running" },
    edge: ["ENGINEER", "VERIFIER"],
  },
  {
    states: { EXPLORER: "completed", INVESTIGATOR: "completed", ENGINEER: "running", VERIFIER: "failed" },
    edge: ["VERIFIER", "ENGINEER"],
  },
  {
    states: { EXPLORER: "completed", INVESTIGATOR: "completed", ENGINEER: "completed", VERIFIER: "running" },
    edge: ["ENGINEER", "VERIFIER"],
  },
  {
    states: { EXPLORER: "completed", INVESTIGATOR: "completed", ENGINEER: "completed", VERIFIER: "completed", PUBLISHER: "running" },
    edge: ["VERIFIER", "PUBLISHER"],
  },
  {
    states: { EXPLORER: "completed", INVESTIGATOR: "completed", ENGINEER: "completed", VERIFIER: "completed", PUBLISHER: "completed" },
    edge: null,
  },
];

const AGENTS: { key: AgentKey; name: string; icon: typeof Compass; role: string; detail: string }[] = [
  {
    key: "EXPLORER",
    name: "Explorer",
    icon: Compass,
    role: "Wanders your app like a real user",
    detail: "Drives a Solari cloud browser through your deployed site with no script and no hints, recording the Rabbit Trail — every click, input, and response.",
  },
  {
    key: "INVESTIGATOR",
    name: "Investigator",
    icon: Radar,
    role: "Turns a hunch into a reproducible bug",
    detail: "Picks up Cheshire Signals (suspicious findings), replays the journey until it reproduces reliably, and traces the symptom to likely source files.",
  },
  {
    key: "ENGINEER",
    name: "Engineer",
    icon: Wrench,
    role: "Writes the smallest correct fix",
    detail: "Works inside an isolated Solari sandbox on a fresh fix branch. Builds the project, runs existing tests, and explains what changed and why.",
  },
  {
    key: "VERIFIER",
    name: "Verifier",
    icon: ShieldCheck,
    role: "Tries to prove the fix wrong",
    detail: "Independent from the Engineer. Replays the original failing journey plus regression flows. If anything fails, the work goes back for another pass.",
  },
  {
    key: "PUBLISHER",
    name: "GitHub Publisher",
    icon: GitPullRequestDraft,
    role: "Hands you a reviewable draft PR",
    detail: "Opens a draft pull request through the GitHub App with the diff, evidence, and every verification result. Never merges on its own.",
  },
];

export function Agents() {
  const reduce = useReducedMotion();
  const [frame, setFrame] = useState(0);
  const [selected, setSelected] = useState<AgentKey>("EXPLORER");

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 2200);
    return () => window.clearInterval(id);
  }, [reduce]);

  const current = reduce ? FRAMES[FRAMES.length - 2] : FRAMES[frame];
  const agent = AGENTS.find((a) => a.key === selected)!;

  return (
    <section id="agents" aria-labelledby="agents-title" className="relative scroll-mt-20">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 md:py-32">
        <SectionHeading
          id="agents-title"
          eyebrow="Meet the agents"
          title={
            <>
              A <span className="font-display italic text-lavender">Tea Party</span> of specialists.
            </>
          }
          lede="Five agents, each with one job, passing work along a chain — with a repair loop when the Verifier isn’t convinced."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
          <Reveal className="glass relative overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">Agent network</p>
              <span className="rounded-full border border-line-strong px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">
                Demo simulation
              </span>
            </div>
            <div className="bg-[radial-gradient(40rem_20rem_at_50%_40%,rgba(139,92,246,0.12),transparent)]">
              <AgentConstellationClient
                states={current.states}
                activeEdge={current.edge}
                selected={selected}
                onSelect={setSelected}
                height={360}
              />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-5 py-3 text-[11px] text-faint">
              {[
                ["bg-faint", "Idle"],
                ["bg-lavender", "Running"],
                ["bg-emerald", "Completed"],
                ["bg-coral", "Failed"],
                ["bg-amber", "Waiting"],
              ].map(([c, l]) => (
                <span key={l} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", c)} /> {l}
                </span>
              ))}
              <span className="ml-auto hidden sm:inline">Drag to rotate · click a node</span>
            </div>
          </Reveal>

          <div className="flex flex-col gap-2">
            <ul className="flex flex-col gap-2" aria-label="Agents">
              {AGENTS.map((a, i) => {
                const on = a.key === selected;
                return (
                  <li key={a.key}>
                    <Reveal delay={i * 0.05}>
                      <button
                        type="button"
                        onClick={() => setSelected(a.key)}
                        aria-pressed={on}
                        className={cn(
                          "flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-all",
                          on
                            ? "border-lavender/40 bg-surface-2/80 shadow-[0_0_0_1px_rgba(139,92,246,0.2)]"
                            : "border-line bg-surface/30 hover:border-line-strong hover:bg-surface/60",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                            on ? "border-violet/40 bg-violet/20 text-lavender" : "border-line text-faint",
                          )}
                        >
                          <a.icon className="h-4 w-4" aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[15px] font-medium text-ink">{a.name}</span>
                          <span className="block text-sm text-muted">{a.role}</span>
                          {on && <span className="mt-2 block text-sm leading-relaxed text-ink/80">{a.detail}</span>}
                        </span>
                      </button>
                    </Reveal>
                  </li>
                );
              })}
            </ul>
            <p className="sr-only" aria-live="polite">
              Selected agent: {agent.name}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
