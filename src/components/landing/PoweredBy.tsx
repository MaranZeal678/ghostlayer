import { BrainCircuit, Cloud, GitPullRequest } from "lucide-react";
import { Reveal } from "./primitives";

const STACK = [
  { icon: Cloud, name: "Solari", role: "Cloud browsers for exploration and isolated sandboxes for repairs" },
  { icon: BrainCircuit, name: "OpenAI", role: "Reasoning models behind every agent decision" },
  { icon: GitPullRequest, name: "GitHub App", role: "Scoped repository access and draft pull requests" },
];

export function PoweredBy() {
  return (
    <section aria-labelledby="powered-title" className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
      <Reveal>
        <h2 id="powered-title" className="text-center font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
          Powered by
        </h2>
      </Reveal>
      <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
        {STACK.map((s, i) => (
          <Reveal key={s.name} delay={i * 0.06} className="bg-bg">
            <div className="flex h-full items-start gap-4 bg-surface/30 p-6">
              <s.icon className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
              <div>
                <p className="text-[15px] font-semibold tracking-tight text-ink">{s.name}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.role}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
