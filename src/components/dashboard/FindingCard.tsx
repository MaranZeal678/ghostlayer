"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Badge, label, severityTone, statusTone } from "@/components/ui/primitives";
import { timeAgo } from "@/lib/format";

export interface FindingLite {
  id: string;
  projectId: string;
  title: string;
  severity: string;
  confidence: string;
  category: string;
  affectedUrl: string;
  verificationStatus: string;
  createdAt: string;
  repairs?: { id: string; status: string }[];
}

export function FindingCard({ f, i = 0 }: { f: FindingLite; i?: number }) {
  const repair = f.repairs?.[0];
  let path = f.affectedUrl;
  try {
    path = new URL(f.affectedUrl).pathname;
  } catch {}
  return (
    <motion.div layout initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: i * 0.04 }}>
      <Link href={`/dashboard/projects/${f.projectId}/findings/${f.id}`} className="glass group flex items-start gap-3 rounded-xl p-4 hover:border-line-strong">
        <div className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${severityTone(f.severity) === "coral" ? "bg-coral/15 text-coral" : severityTone(f.severity) === "amber" ? "bg-amber/15 text-amber" : "bg-white/5 text-muted"}`}>
          <AlertTriangle size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-ink">{f.title}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>
            <Badge tone={statusTone(f.confidence)}>{label(f.confidence)}</Badge>
            <Badge>{f.category}</Badge>
            {repair && <Badge tone={statusTone(repair.status)}>Repair: {label(repair.status)}</Badge>}
          </div>
          <div className="mt-1.5 font-mono text-[0.6875rem] text-faint">
            {path} · {timeAgo(f.createdAt)}
          </div>
        </div>
        <ChevronRight size={16} className="mt-1 text-faint group-hover:text-lavender" />
      </Link>
    </motion.div>
  );
}
