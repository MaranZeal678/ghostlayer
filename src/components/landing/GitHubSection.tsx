import { Ban, GitBranch, GitPullRequestDraft, KeyRound } from "lucide-react";
import { Reveal, SectionHeading } from "./primitives";

const RULES = [
  {
    icon: KeyRound,
    title: "GitHub App, scoped permissions",
    body: "Install on the repositories you choose. GhostLayer asks only for what it needs to read code and open pull requests.",
  },
  {
    icon: GitBranch,
    title: "Fix branches, never your default branch",
    body: "Every repair lives on its own ghostlayer/fix-* branch. Nothing is ever pushed to main.",
  },
  {
    icon: GitPullRequestDraft,
    title: "Draft pull requests",
    body: "PRs open as drafts with the diff, reproduction steps, evidence, and every verification check attached.",
  },
  {
    icon: Ban,
    title: "Never auto-merges",
    body: "A human reviews and merges. GhostLayer prepares the work; you stay in control of what ships.",
  },
];

export function GitHubSection() {
  return (
    <section aria-labelledby="github-title" className="relative border-y border-line bg-surface/20">
      <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 md:py-32">
        <SectionHeading
          id="github-title"
          eyebrow="GitHub integration"
          title={
            <>
              <span className="font-display italic text-lavender">Return to Wonderland</span> — through your normal review.
            </>
          }
          lede="Verified fixes come home as pull requests you already know how to review. No new workflow, no surprise commits."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {RULES.map((r, i) => (
            <Reveal key={r.title} delay={i * 0.06} className="h-full">
              <div className="h-full rounded-2xl border border-line bg-bg/50 p-6 transition-colors hover:border-line-strong">
                <r.icon className="h-5 w-5 text-lavender" aria-hidden />
                <h3 className="mt-5 text-[0.9375rem] font-medium text-ink">{r.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{r.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
