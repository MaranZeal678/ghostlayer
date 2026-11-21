"use client";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { clock } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface FeedEvent {
  id: string;
  agentType: string | null;
  eventType: string;
  message: string;
  timestamp: string;
  href?: string;
}

export const AGENT_COLOR: Record<string, string> = {
  EXPLORER: "text-cyan",
  INVESTIGATOR: "text-lavender",
  ENGINEER: "text-amber",
  VERIFIER: "text-emerald",
  PUBLISHER: "text-[#f0abfc]",
};

export function eventTone(t: string) {
  if (/failed|rejected|exhausted/.test(t)) return "border-coral/40";
  if (/signal|finding/.test(t)) return "border-amber/50";
  if (/ready|pr\.opened|completed/.test(t)) return "border-emerald/40";
  return "border-line";
}

export function ActivityFeed({ events, compact = true }: { events: FeedEvent[]; compact?: boolean }) {
  if (!events.length) return <p className="text-sm text-muted">No agent activity yet.</p>;
  return (
    <ul className="space-y-1.5">
      <AnimatePresence initial={false}>
        {events.map((e) => {
          const body = (
            <div className={cn("rounded-lg border-l-2 py-1 pl-3", eventTone(e.eventType))}>
              <div className="flex items-center gap-2 text-[11px]">
                <span className={cn("font-mono uppercase tracking-wider", AGENT_COLOR[e.agentType ?? ""] ?? "text-faint")}>{e.agentType ?? "system"}</span>
                <span className="font-mono text-faint" suppressHydrationWarning>{clock(e.timestamp)}</span>
              </div>
              <div className={cn("text-sm text-ink/90", compact && "line-clamp-2")}>{e.message}</div>
            </div>
          );
          return (
            <motion.li key={e.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
              {e.href ? <Link href={e.href} className="block hover:bg-white/[0.03]">{body}</Link> : body}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
