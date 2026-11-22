"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Compass, GitPullRequestDraft, Radar, ShieldCheck, Wrench } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { cn } from "./cn";
import { Reveal, SectionHeading } from "./primitives";

const STAGES = [
  {
    key: "explore",
    name: "Explore",
    icon: Compass,
    agent: "Explorer",
    theme: "The Rabbit Trail",
    plain: "the recorded sequence of every action an agent takes",
    summary:
      "AI browser agents open your deployed site in Solari cloud browsers and use it like curious real users — without being told what’s broken.",
    bullets: [
      "Navigates, fills forms, clicks, goes back, double-submits, resizes",
      "Builds a map of pages, journeys, and state transitions",
      "Every action recorded with screenshots and network traffic",
    ],
    output: "Rabbit Trail of actions + evidence",
  },
  {
    key: "discover",
    name: "Discover",
    icon: Radar,
    agent: "Investigator",
    theme: "Cheshire Signal",
    plain: "a suspicious finding that needs a closer look",
    summary:
      "When something looks off — a console error, a duplicate request, a broken state — the Investigator isolates it and tries to reproduce it deterministically.",
    bullets: [
      "Replays the exact journey multiple times",
      "Separates flaky noise from real, reproducible bugs",
      "Maps the symptom to likely source files in your repo",
    ],
    output: "Reproducible bug report (e.g. 3 / 3 runs)",
  },
  {
    key: "repair",
    name: "Repair",
    icon: Wrench,
    agent: "Engineer",
    theme: "Tea Party",
    plain: "the agents collaborating on one finding",
    summary:
      "The Engineer clones your repository into an isolated Solari sandbox, reads the relevant code, and writes the smallest fix that addresses the root cause.",
    bullets: [
      "Works on a fresh fix branch — never your default branch",
      "Builds the project and runs your existing tests",
      "Explains its reasoning in plain language",
    ],
    output: "Patch on a ghostlayer/fix-* branch",
  },
  {
    key: "verify",
    name: "Verify",
    icon: ShieldCheck,
    agent: "Verifier",
    theme: "The Trial",
    plain: "independent verification of the fix",
    summary:
      "A separate Verifier agent — with no stake in the patch — tries to prove the fix wrong by replaying the original failing journey and nearby flows.",
    bullets: [
      "Confirms the original failure reproduced before the fix",
      "Confirms it no longer happens after the fix",
      "Runs regression journeys; failures loop back to the Engineer",
    ],
    output: "Itemized verification report",
  },
  {
    key: "publish",
    name: "Publish",
    icon: GitPullRequestDraft,
    agent: "GitHub Publisher",
    theme: "Return to Wonderland",
    plain: "a verified fix delivered as a pull request",
    summary:
      "The Publisher opens a draft pull request with the diff, the evidence, and every verification result attached. A human always makes the final call.",
    bullets: [
      "Draft PR with reproduction steps and replay links",
      "Itemized checks — never a single “fixed” badge",
      "Never auto-merges",
    ],
    output: "Draft PR awaiting human review",
  },
];

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();
  const stage = STAGES[active];

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const n = (active + 1) % STAGES.length;
      setActive(n);
      document.getElementById(`stage-tab-${n}`)?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = (active - 1 + STAGES.length) % STAGES.length;
      setActive(n);
      document.getElementById(`stage-tab-${n}`)?.focus();
    }
  };

  return (
    <section id="how" aria-labelledby="how-title" className="relative scroll-mt-20 border-y border-line bg-surface/20">
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      <div className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8 md:py-32">
        <SectionHeading
          id="how-title"
          eyebrow="How it works"
          title="Five stages, from a hunch to a pull request."
          lede="Each stage is handled by a dedicated agent with a narrow job. Select a stage to see what happens inside it."
        />

        <Reveal delay={0.1} className="mt-12">
          <div role="tablist" aria-label="Pipeline stages" className="relative grid grid-cols-5 gap-1 sm:gap-2">
            <div aria-hidden className="absolute left-[10%] right-[10%] top-5 hidden h-px bg-line sm:block" />
            <motion.div
              aria-hidden
              className="absolute left-[10%] top-5 hidden h-px bg-gradient-to-r from-violet to-cyan sm:block"
              animate={{ width: `${(active / (STAGES.length - 1)) * 80}%` }}
              transition={{ duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
            />
            {STAGES.map((s, i) => {
              const on = i === active;
              const done = i < active;
              return (
                <button
                  key={s.key}
                  id={`stage-tab-${i}`}
                  role="tab"
                  type="button"
                  aria-selected={on}
                  aria-controls="stage-panel"
                  tabIndex={on ? 0 : -1}
                  onClick={() => setActive(i)}
                  onKeyDown={onKey}
                  className="group relative flex flex-col items-center gap-2 rounded-xl px-1 py-1 text-center"
                >
                  <span
                    className={cn(
                      "relative z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border transition-all",
                      on
                        ? "border-lavender/60 bg-violet/25 text-ink shadow-[0_0_24px_rgba(139,92,246,0.45)]"
                        : done
                          ? "border-cyan/40 bg-surface text-cyan"
                          : "border-line-strong bg-surface text-faint group-hover:text-muted",
                    )}
                  >
                    <s.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className={cn("text-xs font-medium sm:text-sm", on ? "text-ink" : "text-muted")}>{s.name}</span>
                  <span className="hidden font-mono text-[0.625rem] uppercase tracking-wider text-faint md:block">
                    0{i + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </Reveal>

        <div id="stage-panel" role="tabpanel" aria-labelledby={`stage-tab-${active}`} className="mt-10">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={stage.key}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="glass grid gap-8 rounded-2xl p-6 sm:p-8 md:grid-cols-[1.3fr_1fr]"
            >
              <div>
                <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-faint">
                  Stage 0{active + 1} · {stage.agent}
                </p>
                <h3 className="mt-3 text-2xl font-medium tracking-tight text-ink">{stage.name}</h3>
                <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">{stage.summary}</p>
                <ul className="mt-5 space-y-2.5">
                  {stage.bullets.map((b) => (
                    <li key={b} className="flex gap-3 text-[0.9375rem] text-ink/90">
                      <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col justify-between gap-6 rounded-xl border border-line bg-bg/50 p-5">
                <div>
                  <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-faint">In Wonderland terms</p>
                  <p className="mt-2 font-display text-2xl italic text-lavender">{stage.theme}</p>
                  <p className="mt-1 text-sm text-muted">{stage.plain}</p>
                </div>
                <div>
                  <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-faint">Output</p>
                  <p className="mt-2 text-sm text-ink">{stage.output}</p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
