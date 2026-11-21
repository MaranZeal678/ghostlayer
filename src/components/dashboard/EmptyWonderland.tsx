"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { buttonVariants } from "@/components/ui/primitives";
import { GhostMark } from "@/components/ui/Logo";

export function EmptyWonderland() {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass relative overflow-hidden rounded-3xl px-6 py-16 text-center">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border border-violet/20"
            style={{ width: 160 + i * 110, height: 160 + i * 110 }}
            animate={{ scale: [1, 1.04, 1], opacity: [0.5, 0.25, 0.5] }}
            transition={{ duration: 6, repeat: Infinity, delay: i * 0.6 }}
          />
        ))}
      </div>
      <div className="relative flex flex-col items-center gap-4">
        <GhostMark size={44} />
        <h2 className="font-display text-4xl italic text-ink">Your Wonderland is waiting.</h2>
        <p className="max-w-md text-muted">Connect your first project and discover what lies beneath its interface.</p>
        <Link href="/dashboard/projects/new" className={buttonVariants({ size: "lg" })}>
          Create your first project
        </Link>
      </div>
    </motion.div>
  );
}
