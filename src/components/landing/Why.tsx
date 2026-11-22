import { Bug, Clock, Shuffle, Wrench } from "lucide-react";
import { Reveal, SectionHeading } from "./primitives";

const POINTS = [
  {
    icon: Bug,
    title: "Tests only cover what you anticipated",
    body: "Unit and end-to-end suites check the paths you already imagined. The bugs that hurt live in the paths you didn’t.",
  },
  {
    icon: Clock,
    title: "Manual QA is slow and doesn’t scale",
    body: "A human clicking through every flow before every deploy is expensive, inconsistent, and always behind the release train.",
  },
  {
    icon: Shuffle,
    title: "Production bugs come from unexpected interactions",
    body: "Double clicks, back buttons, odd inputs, slow networks. Real users wander. Your QA should too.",
  },
  {
    icon: Wrench,
    title: "Finding the bug is only the beginning",
    body: "A ticket is not a fix. GhostLayer reproduces, repairs, and independently verifies before anything reaches you.",
  },
];

export function Why() {
  return (
    <section aria-labelledby="why-title" className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8 md:py-32">
      <SectionHeading
        id="why-title"
        eyebrow="Why GhostLayer?"
        title={
          <>
            Your test suite sees the map.{" "}
            <span className="font-display italic text-lavender">Your users see the territory.</span>
          </>
        }
        lede="Most broken experiences aren’t in the code you tested. They’re in the gaps between features, in sequences nobody wrote down."
      />
      <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
        {POINTS.map((p, i) => (
          <Reveal key={p.title} delay={i * 0.06} className="bg-bg">
            <div className="group h-full bg-surface/40 p-7 transition-colors hover:bg-surface/80 sm:p-8">
              <p.icon className="h-5 w-5 text-lavender/80 transition-colors group-hover:text-cyan" aria-hidden />
              <h3 className="mt-5 text-lg font-medium text-ink">{p.title}</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{p.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
