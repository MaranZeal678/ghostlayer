"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";

interface Summary {
  closedPullRequests: number[];
  deletedBranches: string[];
  mainRestored: boolean;
  mainHead: string;
  clearedScans: number;
}

export function DemoResetCard({ projectId, repo, compact = false }: { projectId: string; repo: string; compact?: boolean }) {
  const router = useRouter();
  const [clearHistory, setClearHistory] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function reset() {
    const what = [
      "close GhostLayer's open pull requests",
      "delete ghostlayer/* branches",
      "restore main to the seeded-bug baseline (a new commit, no force-push)",
      clearHistory ? "clear this project's scans, findings and repairs" : null,
    ].filter(Boolean);
    if (!confirm(`Revert ${repo}?\n\nThis will:\n• ${what.join("\n• ")}`)) return;
    setBusy(true);
    setResult(null);
    const res = await fetch(`/api/projects/${projectId}/reset-demo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clearHistory }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setResult({ ok: false, text: d.error ?? "Revert failed" });
    const s: Summary = d.summary;
    setResult({
      ok: true,
      text: `Reverted: ${s.closedPullRequests.length ? `closed PR ${s.closedPullRequests.map((n) => `#${n}`).join(", ")}` : "no open PRs"} · ${s.deletedBranches.length} branch(es) deleted · main ${s.mainRestored ? `restored (${s.mainHead.slice(0, 7)})` : "already at baseline"}${clearHistory ? ` · ${s.clearedScans} scan(s) cleared` : ""}.`,
    });
    router.refresh();
  }

  return (
    <Card className={compact ? "flex flex-wrap items-center gap-3 p-4" : "space-y-3 p-6"}>
      <div className={compact ? "min-w-0 flex-1" : ""}>
        <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
          <RotateCcw size={14} className="text-cyan" /> Revert
        </h3>
        <p className="text-xs text-muted">Undo GhostLayer&apos;s PRs and changes on {repo} so you can run the scan → fix → PR demo again.</p>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={clearHistory} onChange={(e) => setClearHistory(e.target.checked)} className="accent-violet" />
        Also clear scan history
      </label>
      <Button variant="secondary" size="sm" onClick={reset} disabled={busy}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Revert
      </Button>
      {result && <p className={`w-full text-xs ${result.ok ? "text-emerald" : "text-coral"}`}>{result.text}</p>}
    </Card>
  );
}
