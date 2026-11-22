"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Globe, GitBranch, ExternalLink, Radar, GitPullRequest, Search, Loader2 } from "lucide-react";
import { Badge, Button, Card, Stat, label, statusTone } from "@/components/ui/primitives";
import { StartScanButton } from "./StartScanButton";
import { FindingCard, type FindingLite } from "./FindingCard";
import { RepoPicker, type Repo } from "./RepoPicker";
import { DemoResetCard } from "./DemoResetCard";
import { host, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Props = { project: any; scans: any[]; findings: (FindingLite & { repairs: { id: string; status: string }[] })[]; repairs: any[]; prs: any[]; isDemo?: boolean };
const TABS = ["Overview", "Findings", "Repairs", "Pull requests", "History", "Settings"] as const;
const ACTIVE = ["QUEUED", "INITIALIZING", "EXPLORING", "INVESTIGATING"];

export function ProjectView({ project, scans, findings, repairs, prs, isDemo }: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const active = scans.find((s) => ACTIVE.includes(s.status));
  const latest = scans[0];
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/dashboard/projects" className="text-xs text-faint hover:text-muted">Projects /</Link>
          <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
          {project.description && <p className="text-sm text-muted">{project.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted">
            <a href={project.websiteUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-ink">
              <Globe size={14} /> {host(project.websiteUrl)} <ExternalLink size={11} />
            </a>
            <span className="flex items-center gap-1.5">
              <GitBranch size={14} /> {project.repositoryFullName ? `${project.repositoryFullName} (${project.defaultBranch})` : "No repository — repairs disabled"}
            </span>
          </div>
        </div>
        <StartScanButton projectId={project.id} disabled={project.status !== "ACTIVE"} />
      </header>

      {isDemo && !active && <DemoResetCard projectId={project.id} repo={project.repositoryFullName} compact />}

      {active && (
        <Link href={`/dashboard/projects/${project.id}/scans/${active.id}`} className="glass glow-violet flex items-center gap-3 rounded-2xl px-5 py-4">
          <Radar className="animate-pulse text-cyan" size={18} />
          <div className="flex-1 text-sm">
            A scan is running — <span className="text-lavender">{label(active.status)}</span>. Open the Looking Glass to watch live.
          </div>
          <span className="text-sm text-cyan">Watch →</span>
        </Link>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("relative px-3 py-2.5 text-sm whitespace-nowrap", tab === t ? "text-ink" : "text-muted hover:text-ink")}>
            {t}
            {t === "Findings" && findings.length > 0 && <span className="ml-1.5 text-xs text-faint">{findings.length}</span>}
            {tab === t && <motion.span layoutId="tab-underline" className="absolute inset-x-2 -bottom-px h-0.5 bg-violet" />}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          {tab === "Overview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Stat label="Scans" value={scans.length} hint={latest ? `last ${timeAgo(latest.createdAt)}` : "none yet"} />
                <Stat label="Findings" value={findings.length} />
                <Stat label="Open" value={findings.filter((f) => f.verificationStatus !== "PR_OPENED").length} />
                <Stat label="Verified fixes" value={repairs.filter((r) => r.verification?.approved).length} />
                <Stat label="Pull requests" value={prs.length} />
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="p-5">
                  <h3 className="mb-3 text-sm font-medium">Latest scan</h3>
                  {latest ? (
                    <Link href={`/dashboard/projects/${project.id}/scans/${latest.id}`} className="block rounded-xl border border-line p-4 hover:border-line-strong">
                      <div className="flex items-center justify-between">
                        <Badge tone={statusTone(latest.status)}>{label(latest.status)}</Badge>
                        <span className="text-xs text-faint">{timeAgo(latest.createdAt)}</span>
                      </div>
                      <p className="mt-2 text-sm text-muted">{latest.executionSummary ?? latest.errorMessage ?? "In progress…"}</p>
                    </Link>
                  ) : (
                    <p className="text-sm text-muted">No scans yet. Start one to send the Explorer down the rabbit hole.</p>
                  )}
                </Card>
                <Card className="p-5">
                  <h3 className="mb-3 text-sm font-medium">Top findings</h3>
                  {findings.length ? (
                    <div className="space-y-2">{findings.slice(0, 3).map((f, i) => <FindingCard key={f.id} f={f} i={i} />)}</div>
                  ) : (
                    <p className="text-sm text-muted">Nothing found yet.</p>
                  )}
                </Card>
              </div>
            </div>
          )}
          {tab === "Findings" && <FindingsTab findings={findings} />}
          {tab === "Repairs" && (
            <div className="space-y-2">
              {repairs.length === 0 && <p className="text-sm text-muted">No repair attempts yet. Open a finding and send it to the Engineer.</p>}
              {repairs.map((r) => (
                <Link key={r.id} href={`/dashboard/projects/${project.id}/findings/${r.finding.id}`} className="glass flex items-center justify-between gap-3 rounded-xl p-4 hover:border-line-strong">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-ink">{r.finding.title}</div>
                    <div className="text-xs text-muted">Attempt {r.attempt} · {timeAgo(r.createdAt)} {r.errorMessage ? `· ${r.errorMessage.slice(0, 80)}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.verification && <Badge tone={r.verification.approved ? "emerald" : "coral"}>{r.verification.approved ? "Verified" : "Rejected by verifier"}</Badge>}
                    <Badge tone={statusTone(r.status)}>{label(r.status)}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
          {tab === "Pull requests" && (
            <div className="space-y-2">
              {prs.length === 0 && <p className="text-sm text-muted">No pull requests yet.</p>}
              {prs.map((pr) => (
                <a key={pr.id} href={pr.githubUrl} target="_blank" rel="noreferrer" className="glass flex items-center justify-between rounded-xl p-4 hover:border-line-strong">
                  <div className="flex items-center gap-3">
                    <GitPullRequest size={16} className="text-emerald" />
                    <div>
                      <div className="text-sm text-ink">#{pr.githubNumber} {pr.title}</div>
                      <div className="font-mono text-xs text-muted">{pr.branchName}</div>
                    </div>
                  </div>
                  <Badge tone="emerald">{pr.status.toLowerCase()}</Badge>
                </a>
              ))}
            </div>
          )}
          {tab === "History" && (
            <div className="overflow-hidden rounded-2xl border border-line">
              <table className="w-full text-sm">
                <thead className="bg-surface/70 text-left text-xs uppercase tracking-wider text-faint">
                  <tr>
                    <th className="px-4 py-3">Started</th><th className="px-4 py-3">Status</th><th className="hidden px-4 py-3 md:table-cell">Pages</th><th className="hidden px-4 py-3 md:table-cell">Interactions</th><th className="px-4 py-3">Findings</th><th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {scans.map((s) => (
                    <tr key={s.id} className="border-t border-line">
                      <td className="px-4 py-3 text-muted">{new Date(s.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3"><Badge tone={statusTone(s.status)}>{label(s.status)}</Badge></td>
                      <td className="hidden px-4 py-3 font-mono md:table-cell">{s.pagesExplored}</td>
                      <td className="hidden px-4 py-3 font-mono md:table-cell">{s.interactionsTested}</td>
                      <td className="px-4 py-3 font-mono">{s.findingsCount}</td>
                      <td className="px-4 py-3 text-right"><Link className="text-lavender hover:underline" href={`/dashboard/projects/${project.id}/scans/${s.id}`}>Open</Link></td>
                    </tr>
                  ))}
                  {!scans.length && (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">No scans yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {tab === "Settings" && <SettingsTab project={project} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function FindingsTab({ findings }: { findings: Props["findings"] }) {
  const [q, setQ] = useState("");
  const [sev, setSev] = useState("ALL");
  const [conf, setConf] = useState("ALL");
  const [cat, setCat] = useState("ALL");
  const cats = useMemo(() => [...new Set(findings.map((f) => f.category))], [findings]);
  const list = findings.filter(
    (f) => (sev === "ALL" || f.severity === sev) && (conf === "ALL" || f.confidence === conf) && (cat === "ALL" || f.category === cat) && (!q || `${f.title} ${f.affectedUrl}`.toLowerCase().includes(q.toLowerCase())),
  );
  const sel = "rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} className="absolute top-2.5 left-2.5 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search findings" className="rounded-lg border border-line bg-surface-2 py-1.5 pr-3 pl-8 text-sm" />
        </div>
        <select className={sel} value={sev} onChange={(e) => setSev(e.target.value)} aria-label="Severity">
          {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={sel} value={conf} onChange={(e) => setConf(e.target.value)} aria-label="Confidence">
          {["ALL", "CONFIRMED", "REPRODUCED", "SUSPECTED", "NEEDS_REVIEW"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={sel} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          {["ALL", ...cats].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        {list.map((f, i) => <FindingCard key={f.id} f={f} i={i} />)}
        {!list.length && <p className="text-sm text-muted">No findings match.</p>}
      </div>
    </div>
  );
}

function SettingsTab({ project }: { project: any }) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [websiteUrl, setWebsiteUrl] = useState(project.websiteUrl);
  const [maxActions, setMaxActions] = useState(project.maxActions);
  const [repo, setRepo] = useState<{ connectionId: string; repositoryId: number; repo: Repo } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? "Saved" : d.error ?? "Failed");
    if (res.ok) router.refresh();
  }
  async function del() {
    if (!confirm(`Delete "${project.name}" and all of its scans, findings, evidence and repair records? GitHub pull requests are not affected. This cannot be undone.`)) return;
    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (res.ok) router.push("/dashboard/projects");
  }
  const field = "w-full rounded-xl border border-line bg-surface-2/70 px-3 py-2 text-sm";
  return (
    <div className="max-w-2xl space-y-4">
      <Card className="space-y-4 p-6">
        <label className="block space-y-1"><span className="text-sm">Name</span><input className={field} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block space-y-1"><span className="text-sm">Website URL</span><input className={field} value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} /></label>
        <label className="block space-y-1"><span className="text-sm">Scan budget (max browser actions)</span><input type="number" min={5} max={100} className={field} value={maxActions} onChange={(e) => setMaxActions(Number(e.target.value))} /></label>
        <div className="flex items-center gap-3">
          <Button disabled={busy} onClick={() => patch({ name, websiteUrl, maxActions })}>{busy && <Loader2 size={14} className="animate-spin" />} Save</Button>
          {msg && <span className="text-sm text-muted">{msg}</span>}
        </div>
      </Card>
      <Card className="space-y-3 p-6">
        <h3 className="text-sm font-medium">Repository</h3>
        <p className="text-xs text-muted">Current: {project.repositoryFullName ?? "none"}</p>
        <RepoPicker value={repo} onChange={setRepo} />
        <div className="flex gap-2">
          <Button variant="secondary" disabled={!repo || busy} onClick={() => repo && patch({ connectionId: repo.connectionId, repositoryId: repo.repositoryId })}>Connect selected repository</Button>
          {project.repositoryFullName && <Button variant="ghost" onClick={() => patch({ disconnectRepository: true })}>Disconnect</Button>}
        </div>
      </Card>
      <Card className="space-y-3 border-coral/20 p-6">
        <h3 className="text-sm font-medium text-coral">Danger zone</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => patch({ status: project.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE" })}>{project.status === "ACTIVE" ? "Archive project" : "Unarchive project"}</Button>
          <Button variant="danger" onClick={del}>Delete project</Button>
        </div>
      </Card>
    </div>
  );
}
