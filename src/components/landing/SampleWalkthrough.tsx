"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Bug,
  Check,
  Compass,
  FileCode,
  GitPullRequestDraft,
  Pause,
  Play,
  Repeat,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "./cn";

type Step = {
  key: string;
  label: string;
  icon: typeof Compass;
  tone: "violet" | "coral" | "amber" | "cyan" | "emerald";
  title: string;
  body: ReactNode;
};

const TONE: Record<Step["tone"], string> = {
  violet: "text-lavender bg-violet/15 border-violet/30",
  coral: "text-coral bg-coral/10 border-coral/30",
  amber: "text-amber bg-amber/10 border-amber/30",
  cyan: "text-cyan bg-cyan/10 border-cyan/30",
  emerald: "text-emerald bg-emerald/10 border-emerald/30",
};

function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("font-mono text-[12px] leading-relaxed", className)}>{children}</div>;
}

const STEPS: Step[] = [
  {
    key: "explore",
    label: "Explore",
    icon: Compass,
    tone: "violet",
    title: "Explorer is wandering the shop",
    body: (
      <Mono className="space-y-1 text-muted">
        <p><span className="text-faint">01</span> open <span className="text-ink">/products</span></p>
        <p><span className="text-faint">02</span> click <span className="text-ink">“Glass Key — $12”</span></p>
        <p><span className="text-faint">03</span> add to cart · open <span className="text-ink">/checkout</span></p>
        <p><span className="text-faint">04</span> fill shipping form · <span className="text-lavender">try odd inputs…</span></p>
      </Mono>
    ),
  },
  {
    key: "discover",
    label: "Discover",
    icon: Bug,
    tone: "coral",
    title: "Something is off: two orders from one click",
    body: (
      <Mono className="space-y-1 text-muted">
        <p className="text-ink">Double-click on “Place order”</p>
        <p><span className="text-emerald">POST</span> /api/orders <span className="text-faint">→</span> 201 <span className="text-faint">#A-1042</span></p>
        <p><span className="text-emerald">POST</span> /api/orders <span className="text-faint">→</span> 201 <span className="text-coral">#A-1043</span></p>
        <p className="pt-1 text-coral">Customer charged twice.</p>
      </Mono>
    ),
  },
  {
    key: "reproduce",
    label: "Reproduce",
    icon: Repeat,
    tone: "amber",
    title: "Investigator reproduced it 3 / 3 times",
    body: (
      <div className="space-y-3">
        <div className="flex gap-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex-1 rounded-lg border border-amber/25 bg-amber/5 px-3 py-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-faint">Run {n}</p>
              <p className="mt-1 font-mono text-[12px] text-amber">2 orders</p>
            </div>
          ))}
        </div>
        <p className="text-[13px] text-muted">Deterministic. Evidence saved: replay, screenshots, network log.</p>
      </div>
    ),
  },
  {
    key: "fix",
    label: "Fix",
    icon: FileCode,
    tone: "cyan",
    title: "Engineer patches it in an isolated sandbox",
    body: (
      <div className="overflow-hidden rounded-lg border border-line bg-bg/70">
        <p className="border-b border-line px-3 py-1.5 font-mono text-[10px] text-faint">components/CheckoutButton.tsx</p>
        <Mono className="px-3 py-2">
          <p className="text-coral/90">- &lt;button onClick=&#123;placeOrder&#125;&gt;</p>
          <p className="text-emerald">+ const [pending, start] = useTransition();</p>
          <p className="text-emerald">+ &lt;button disabled=&#123;pending&#125;</p>
          <p className="text-emerald">+   onClick=&#123;() =&gt; start(placeOrder)&#125;&gt;</p>
        </Mono>
      </div>
    ),
  },
  {
    key: "verify",
    label: "Verify",
    icon: ShieldCheck,
    tone: "emerald",
    title: "Verifier tries to prove the fix wrong — and can’t",
    body: (
      <ul className="space-y-1.5 text-[13px]">
        {[
          ["Build", "passed"],
          ["Existing tests", "42 / 42"],
          ["Double-click replay", "1 order created"],
          ["Regression journeys", "3 / 3 passed"],
        ].map(([k, v]) => (
          <li key={k} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-muted">
              <Check className="h-3.5 w-3.5 text-emerald" aria-hidden /> {k}
            </span>
            <span className="font-mono text-[12px] text-emerald">{v}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    key: "pr",
    label: "PR",
    icon: GitPullRequestDraft,
    tone: "violet",
    title: "Draft pull request opened for review",
    body: (
      <div className="rounded-lg border border-line bg-bg/70 p-3">
        <p className="flex items-center gap-2 text-[13px] text-ink">
          <GitPullRequestDraft className="h-4 w-4 text-faint" aria-hidden />
          fix(checkout): prevent duplicate orders on double submit
        </p>
        <p className="mt-2 font-mono text-[11px] text-faint">
          #128 · Draft · ghostlayer/fix-duplicate-order → main
        </p>
        <p className="mt-2 inline-flex rounded-full border border-amber/30 bg-amber/10 px-2 py-0.5 text-[11px] text-amber">
          Human review required
        </p>
      </div>
    ),
  },
];

const DURATION = 3200;

export function SampleWalkthrough() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const autoplay = !reduce && !paused;

  useEffect(() => {
    if (!autoplay) return;
    const id = window.setTimeout(() => setI((n) => (n + 1) % STEPS.length), DURATION);
    return () => window.clearTimeout(id);
  }, [i, autoplay]);

  const step = STEPS[i];
  const Icon = step.icon;

  return (
    <section
      aria-label="Sample walkthrough, not a live scan"
      className="glass relative w-full overflow-hidden rounded-2xl shadow-2xl shadow-violet/10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* browser chrome */}
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        </div>
        <p className="hidden min-w-0 flex-1 truncate rounded-md bg-bg/60 px-2.5 py-1 font-mono text-[11px] text-faint sm:block lg:hidden xl:block">
          demo-shop.example/checkout
        </p>
        <span className="ml-auto shrink-0 rounded-full border border-amber/30 bg-amber/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber">
          Sample walkthrough · not a live scan
        </span>
      </div>

      <div className="relative min-h-[232px] px-5 pb-4 pt-5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step.key}
            initial={reduce ? false : { opacity: 0, y: 10, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduce ? undefined : { opacity: 0, y: -8, filter: "blur(4px)" }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            aria-live="polite"
          >
            <div className="flex items-center gap-2.5">
              <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-lg border", TONE[step.tone])}>
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </span>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                Step {i + 1} / {STEPS.length}
              </p>
            </div>
            <h3 className="mt-3 text-[15px] font-medium text-ink">{step.title}</h3>
            <div className="mt-3">{step.body}</div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* step rail */}
      <div className="flex items-center gap-2 border-t border-line px-4 py-3">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-faint hover:text-ink"
          aria-label={paused ? "Play walkthrough" : "Pause walkthrough"}
        >
          {paused || reduce ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
        <ol className="flex flex-1 gap-1.5">
          {STEPS.map((s, n) => (
            <li key={s.key} className="flex-1">
              <button
                type="button"
                onClick={() => setI(n)}
                aria-label={`Step ${n + 1}: ${s.label}`}
                aria-current={n === i ? "step" : undefined}
                className="group block w-full py-2"
              >
                <span className="relative block h-1 overflow-hidden rounded-full bg-line">
                  {n < i && <span className="absolute inset-0 bg-lavender/60" />}
                  {n === i && (
                    <motion.span
                      key={`${s.key}-${autoplay}`}
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet to-cyan"
                      initial={{ width: autoplay ? "0%" : "100%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: autoplay ? DURATION / 1000 : 0, ease: "linear" }}
                    />
                  )}
                </span>
                <span
                  className={cn(
                    "mt-1.5 hidden truncate text-left font-mono text-[9.5px] uppercase tracking-wider sm:block",
                    n === i ? "text-ink" : "text-faint group-hover:text-muted",
                  )}
                >
                  {s.label}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
