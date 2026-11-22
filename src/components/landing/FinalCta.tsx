import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Wordmark } from "./Logo";
import { Reveal } from "./primitives";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[42rem] w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70"
        style={{
          background:
            "repeating-radial-gradient(circle at center, rgba(196,181,253,0.10) 0 1px, transparent 1px 44px), radial-gradient(circle at center, rgba(139,92,246,0.22), transparent 62%)",
          maskImage: "radial-gradient(circle at center, black 30%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(circle at center, black 30%, transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-3xl px-5 py-28 text-center sm:px-8 md:py-40">
        <Reveal>
          <h2 id="cta-title" className="font-display text-5xl leading-[1.02] text-ink sm:text-6xl md:text-7xl">
            Your website has secrets.
            <br />
            <em className="text-gradient pr-2">Let&apos;s find them.</em>
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            Connect a repository and a deployed URL. GhostLayer takes it from there — down the rabbit hole, and back with
            a pull request.
          </p>
        </Reveal>
        <Reveal delay={0.18}>
          <Link
            href="/dashboard"
            className="glow-violet group mt-10 inline-flex items-center gap-2 rounded-xl bg-violet px-6 py-3.5 text-sm font-medium text-white transition hover:bg-[#7c4df0]"
          >
            Enter the Rabbit Hole
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-faint sm:flex-row sm:px-8">
        <Wordmark />
        <p className="font-display text-base italic text-muted">Find what hides beneath the interface.</p>
        <p>Built at Cutie Hack 2026</p>
      </div>
    </footer>
  );
}
