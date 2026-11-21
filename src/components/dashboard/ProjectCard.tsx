"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { Globe, GitBranch, Bug, ArrowUpRight } from "lucide-react";
import { Badge, label, statusTone } from "@/components/ui/primitives";
import { host, timeAgo } from "@/lib/format";

export interface ProjectCardData {
  id: string;
  name: string;
  websiteUrl: string;
  repositoryFullName: string | null;
  lastScanAt: string | null;
  lastScanStatus: string | null;
  openFindings: number;
  prs: number;
  status: string;
}

export function ProjectCard({ p, i = 0 }: { p: ProjectCardData; i?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ y: -3 }}>
      <Link href={`/dashboard/projects/${p.id}`} className="glass group block rounded-2xl p-5 transition-colors hover:border-line-strong">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-medium text-ink">{p.name}</h3>
              {p.status === "ARCHIVED" && <Badge>Archived</Badge>}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
              <Globe size={12} /> <span className="truncate">{host(p.websiteUrl)}</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
              <GitBranch size={12} /> <span className="truncate">{p.repositoryFullName ?? "No repository connected"}</span>
            </div>
          </div>
          <ArrowUpRight size={16} className="text-faint transition-colors group-hover:text-lavender" />
        </div>
        <div className="mt-5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {p.lastScanStatus ? <Badge tone={statusTone(p.lastScanStatus)}>{label(p.lastScanStatus)}</Badge> : <Badge>Never scanned</Badge>}
            <span className="text-faint">{p.lastScanAt ? timeAgo(p.lastScanAt) : ""}</span>
          </div>
          <div className="flex items-center gap-3 text-muted">
            <span className="flex items-center gap-1"><Bug size={12} /> {p.openFindings}</span>
            <span>{p.prs} PR</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
