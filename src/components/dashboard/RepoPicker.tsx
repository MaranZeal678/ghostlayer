"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock, Globe2, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export interface Repo {
  id: number;
  name: string;
  owner: string;
  fullName: string;
  private: boolean;
  language: string | null;
  defaultBranch: string;
}
interface Conn {
  id: string;
  login: string;
  account: string;
  repos: Repo[];
  error?: string;
}

export function RepoPicker({
  value,
  onChange,
}: {
  value: { connectionId: string; repositoryId: number } | null;
  onChange: (v: { connectionId: string; repositoryId: number; repo: Repo } | null) => void;
}) {
  const [state, setState] = useState<{ loading: boolean; configured: boolean; connections: Conn[]; error?: string }>({ loading: true, configured: true, connections: [] });
  useEffect(() => {
    fetch("/api/github/repositories")
      .then((r) => r.json())
      .then((d) => setState({ loading: false, configured: d.configured !== false, connections: d.connections ?? [], error: d.error }))
      .catch((e) => setState({ loading: false, configured: true, connections: [], error: String(e) }));
  }, []);
  if (state.loading)
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Loader2 size={14} className="animate-spin" /> Loading authorized repositories…
      </div>
    );
  if (!state.configured || state.connections.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
        No GitHub repositories authorized yet. You can create the project now (browser exploration works without a repo) and{" "}
        <Link href="/dashboard/connections" className="text-lavender underline">connect GitHub</Link> later to enable repairs and pull requests.
      </div>
    );
  return (
    <div className="space-y-3">
      {state.connections.map((c) => (
        <div key={c.id}>
          <div className="mb-2 text-xs text-faint">Installation · {c.account.split(":")[1] || c.login}</div>
          {c.error && <div className="text-xs text-coral">{c.error}</div>}
          <div className="grid max-h-72 gap-2 overflow-auto pr-1 sm:grid-cols-2">
            {c.repos.map((r) => {
              const selected = value?.repositoryId === r.id && value.connectionId === c.id;
              return (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => onChange(selected ? null : { connectionId: c.id, repositoryId: r.id, repo: r })}
                  className={cn("flex items-start justify-between gap-2 rounded-xl border p-3 text-left transition-colors", selected ? "border-violet bg-violet/10" : "border-line hover:border-line-strong hover:bg-white/[0.03]")}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-ink">{r.fullName}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                      {r.private ? <Lock size={11} /> : <Globe2 size={11} />} {r.private ? "Private" : "Public"} · {r.language ?? "—"} · {r.defaultBranch}
                    </div>
                  </div>
                  {selected && <Check size={16} className="shrink-0 text-lavender" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
