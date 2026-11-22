"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "./cn";

const EASE = [0.22, 1, 0.36, 1] as const;

export function Reveal({
  children,
  delay = 0,
  className,
  y = 18,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.75, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-lavender/80",
        className,
      )}
    >
      <span aria-hidden className="h-px w-6 bg-gradient-to-r from-transparent to-lavender/60" />
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  id,
  align = "left",
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  id?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      <Reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
      </Reveal>
      <Reveal delay={0.06}>
        <h2 id={id} className="mt-4 text-balance text-3xl font-medium tracking-tight text-ink sm:text-4xl md:text-[2.75rem] md:leading-[1.08]">
          {title}
        </h2>
      </Reveal>
      {lede && (
        <Reveal delay={0.12}>
          <p className="mt-5 text-pretty text-base leading-relaxed text-muted sm:text-lg">{lede}</p>
        </Reveal>
      )}
    </div>
  );
}

/** Theme term with its plain meaning right next to it. */
export function Term({ name, meaning }: { name: string; meaning: string }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <span className="font-display italic text-lavender">{name}</span>
      <span className="text-faint">— {meaning}</span>
    </span>
  );
}
