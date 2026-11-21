"use client";

import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ArrowDown, ArrowRight } from "lucide-react";
import { RabbitHoleClient } from "./ThreeClient";
import { SampleWalkthrough } from "./SampleWalkthrough";

const EASE = [0.22, 1, 0.36, 1] as const;

function Line({ children, delay }: { children: React.ReactNode; delay: number }) {
  const reduce = useReducedMotion();
  return (
    <span className="block overflow-hidden pb-[0.08em]">
      <motion.span
        className="block"
        initial={reduce ? false : { y: "105%", opacity: 0 }}
        animate={{ y: "0%", opacity: 1 }}
        transition={{ duration: 0.9, delay, ease: EASE }}
      >
        {children}
      </motion.span>
    </span>
  );
}

export function Hero() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const fade = useTransform(scrollY, [0, 520], [1, 0.15]);
  const lift = useTransform(scrollY, [0, 520], [0, -60]);

  return (
    <section aria-labelledby="hero-title" className="relative isolate min-h-[100svh] overflow-hidden pt-16">
      {/* 3D portal */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <RabbitHoleClient className="absolute inset-0 lg:left-[28%]" />
        <div className="absolute inset-0 bg-bg/60 lg:bg-transparent lg:bg-[linear-gradient(90deg,rgba(8,9,17,0.95)_0%,rgba(8,9,17,0.7)_35%,rgba(8,9,17,0.1)_65%,transparent_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-bg" />
      </div>

      <motion.div
        style={reduce ? undefined : { opacity: fade, y: lift }}
        className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 sm:px-8 md:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10 lg:pt-24"
      >
        <div>
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-3 py-1 text-xs text-muted backdrop-blur"
          >
            <span className="relative flex h-1.5 w-1.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan" />
            </span>
            Autonomous QA & repair · Down the rabbit hole. Beyond the bug.
          </motion.p>

          <h1
            id="hero-title"
            className="mt-6 font-display text-[3.1rem] leading-[0.98] tracking-[-0.01em] text-ink sm:text-7xl lg:text-[5.4rem]"
          >
            <Line delay={0.1}>Every interface</Line>
            <Line delay={0.22}>
              hides a <em className="text-gradient pr-2">secret.</em>
            </Line>
          </h1>

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: EASE }}
            className="mt-7 max-w-xl text-pretty text-base leading-relaxed text-muted sm:text-lg"
          >
            Meet the autonomous AI engineer that explores your website, uncovers hidden bugs, verifies repairs, and
            opens pull requests before your users discover what&apos;s broken.
          </motion.p>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.52, ease: EASE }}
            className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <Link
              href="/dashboard"
              className="glow-violet group inline-flex items-center justify-center gap-2 rounded-xl bg-violet px-5 py-3 text-sm font-medium text-white transition hover:bg-[#7c4df0]"
            >
              Enter the Rabbit Hole
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <a
              href="#how"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface/40 px-5 py-3 text-sm font-medium text-ink backdrop-blur transition hover:border-lavender/50 hover:bg-surface/70"
            >
              See how it works
              <ArrowDown className="h-4 w-4 text-muted" aria-hidden />
            </a>
          </motion.div>

          <motion.p
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.8 }}
            className="mt-8 font-mono text-[11px] uppercase tracking-[0.16em] text-faint"
          >
            Find what hides beneath the interface.
          </motion.p>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.45, ease: EASE }}
          className="lg:pl-4"
        >
          <SampleWalkthrough />
        </motion.div>
      </motion.div>
    </section>
  );
}
