import { Camera, Eye, Network, PlayCircle } from "lucide-react";
import { Reveal, SectionHeading } from "./primitives";

const FEATURES = [
  {
    icon: Eye,
    title: "Live browser exploration",
    body: "Watch agents drive a real cloud browser against your deployed site, in real time.",
  },
  {
    icon: Camera,
    title: "Recorded evidence",
    body: "Screenshots, console output, network logs, and session replay captured for every step.",
  },
  {
    icon: Network,
    title: "Traceable findings",
    body: "Every finding links back to the exact action that triggered it — no “trust me” bug reports.",
  },
];

const NET = [
  ["GET", "/checkout", "200", "84ms", "text-muted"],
  ["POST", "/api/orders", "201", "212ms", "text-muted"],
  ["POST", "/api/orders", "201", "198ms", "text-coral"],
  ["GET", "/orders/confirm", "200", "61ms", "text-muted"],
] as const;

export function LookingGlass() {
  return (
    <section aria-labelledby="glass-title" className="relative overflow-hidden border-y border-line bg-surface/20">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 sm:px-8 md:py-32 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <SectionHeading
            id="glass-title"
            eyebrow="The Looking Glass"
            title="See exactly what the agents see."
            lede={
              <>
                The <span className="font-display italic text-lavender">Looking Glass</span> is the live view of your
                site under test. Every step lands on a timeline you can scrub, inspect, and share.
              </>
            }
          />
          <ul className="mt-10 space-y-6">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.06}>
                <li className="flex gap-4">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-cyan">
                    <f.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-[0.9375rem] font-medium text-ink">{f.title}</h3>
                    <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted">{f.body}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ul>
        </div>

        <Reveal delay={0.1}>
          <figure className="glass relative overflow-hidden rounded-2xl" aria-label="Illustration of the Looking Glass evidence view">
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-coral" />
              </span>
              <p className="font-mono text-[0.6875rem] text-muted">Looking Glass · session replay</p>
              <span className="ml-auto font-mono text-[0.625rem] uppercase tracking-wider text-faint">Illustrative</span>
            </div>

            <div className="grid gap-px bg-line sm:grid-cols-[1.4fr_1fr]">
              {/* fake viewport */}
              <div className="bg-bg/80 p-4">
                <div className="rounded-lg border border-line bg-surface/60 p-4">
                  <div className="h-2.5 w-24 rounded bg-line-strong" />
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[0, 1, 2].map((n) => (
                      <div key={n} className="aspect-[4/3] rounded-md bg-gradient-to-br from-surface-2 to-bg" />
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="h-2 w-16 rounded bg-line-strong" />
                    <div className="relative rounded-md bg-violet/80 px-3 py-1.5 text-[0.6875rem] font-medium text-white">
                      Place order
                      <span aria-hidden className="absolute -right-2 -top-2 h-5 w-5 rounded-full border-2 border-cyan/80" />
                      <span aria-hidden className="absolute -right-3 -top-3 h-7 w-7 rounded-full border border-cyan/40" />
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex gap-2" aria-hidden>
                  {[0, 1, 2, 3, 4].map((n) => (
                    <div
                      key={n}
                      className={`h-10 flex-1 rounded border ${n === 3 ? "border-coral/50 bg-coral/10" : "border-line bg-surface/40"}`}
                    />
                  ))}
                </div>
              </div>

              {/* network log */}
              <div className="bg-bg/80 p-4">
                <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-faint">Network</p>
                <ul className="mt-3 space-y-2 font-mono text-[0.6875rem]">
                  {NET.map(([m, p, s, t, c], n) => (
                    <li key={n} className={`flex items-center gap-2 ${c}`}>
                      <span className="w-9 text-faint">{m}</span>
                      <span className="flex-1 truncate">{p}</span>
                      <span>{s}</span>
                      <span className="hidden text-faint sm:inline">{t}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 rounded-md border border-coral/30 bg-coral/5 p-2.5 text-[0.6875rem] leading-relaxed text-coral">
                  Cheshire Signal — suspicious finding: duplicate order created
                </div>
              </div>
            </div>

            {/* scrubber */}
            <div className="flex items-center gap-3 border-t border-line px-4 py-3">
              <PlayCircle className="h-4 w-4 text-muted" aria-hidden />
              <div className="relative h-1 flex-1 rounded-full bg-line">
                <div className="absolute inset-y-0 left-0 w-[64%] rounded-full bg-gradient-to-r from-violet to-cyan" />
                <div className="absolute left-[64%] top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-cyan" />
                <div className="absolute left-[61%] top-1/2 h-2 w-0.5 -translate-y-1/2 bg-coral" />
              </div>
              <span className="font-mono text-[0.625rem] text-faint">00:41 / 01:04</span>
            </div>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}
