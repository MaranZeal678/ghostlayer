import { Check, CircleDot, Hammer, ListChecks, MousePointerClick, Repeat, RotateCcw, UserCheck } from "lucide-react";
import { cn } from "./cn";
import { Reveal, SectionHeading } from "./primitives";

type Status = "passed" | "confirmed" | "pending";

const CHECKS: { name: string; detail: string; status: Status; value: string; icon: typeof Check }[] = [
  { name: "Build", detail: "Project compiles in the sandbox on the fix branch", status: "passed", value: "Passed", icon: Hammer },
  { name: "Existing tests", detail: "Your own suite, unchanged, still green", status: "passed", value: "42 / 42", icon: ListChecks },
  { name: "Original failure reproduced", detail: "Bug confirmed on the unpatched build first", status: "confirmed", value: "Confirmed 3 / 3", icon: RotateCcw },
  { name: "Original failure resolved", detail: "Same journey, patched build, bug gone", status: "passed", value: "Passed 3 / 3", icon: Check },
  { name: "Browser verification", detail: "Verifier replays the journey in a real browser", status: "passed", value: "Passed", icon: MousePointerClick },
  { name: "Regression checks", detail: "Nearby journeys re-run to catch side effects", status: "passed", value: "5 / 5", icon: Repeat },
  { name: "Human review required", detail: "You decide. Always.", status: "pending", value: "Awaiting you", icon: UserCheck },
];

const STATUS_STYLE: Record<Status, string> = {
  passed: "border-emerald/30 bg-emerald/10 text-emerald",
  confirmed: "border-cyan/30 bg-cyan/10 text-cyan",
  pending: "border-amber/30 bg-amber/10 text-amber",
};

export function Verification() {
  return (
    <section id="verification" aria-labelledby="verify-title" className="relative scroll-mt-20">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 md:py-32">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading
              id="verify-title"
              eyebrow="The Verification Engine"
              title={
                <>
                  Proof, not promises.{" "}
                  <span className="font-display italic text-lavender">Put the fix on trial.</span>
                </>
              }
              lede="The Verifier is a separate agent whose only goal is to show the fix is wrong. Every check is reported on its own — so you can see exactly what was proven, and what wasn’t."
            />
            <Reveal delay={0.15}>
              <div className="mt-8 rounded-xl border border-line bg-surface/40 p-5">
                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                  <CircleDot className="h-4 w-4 text-coral" aria-hidden />
                  Never a single “100% fixed” badge.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Software doesn’t work that way, and neither do we. If any check fails, the work loops back to the
                  Engineer — or stops and tells you why.
                </p>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.1}>
            <div className="glass overflow-hidden rounded-2xl">
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">The Trial · verification report</p>
                <span className="font-mono text-[10px] uppercase tracking-wider text-faint">Example</span>
              </div>
              <ol className="divide-y divide-line">
                {CHECKS.map((c, i) => (
                  <li key={c.name} className="flex items-center gap-4 px-5 py-4">
                    <span className="w-5 font-mono text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-bg/60 text-muted">
                      <c.icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium text-ink">{c.name}</p>
                      <p className="truncate text-sm text-muted">{c.detail}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2.5 py-1 font-mono text-[11px] whitespace-nowrap",
                        STATUS_STYLE[c.status],
                      )}
                    >
                      {c.value}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
