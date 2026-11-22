"use client";
import { useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui/primitives";

interface ProviderStatus {
  provider: "OPENAI" | "SOLARI";
  label: string;
  source: "user" | "default";
  last4: string | null;
  updatedAt: string | null;
  defaultAvailable: boolean;
}

const HINT: Record<ProviderStatus["provider"], { placeholder: string; use: string }> = {
  OPENAI: { placeholder: "sk-…", use: "Agent reasoning: page planning, bug reports, patches, adversarial review" },
  SOLARI: { placeholder: "slr_live_…", use: "Cloud browsers for exploration/replays and sandboxes for repairs" },
};

export function ApiKeysCard() {
  const [rows, setRows] = useState<ProviderStatus[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ provider: string; text: string; ok: boolean } | null>(null);

  const load = () =>
    fetch("/api/settings/keys")
      .then((r) => r.json())
      .then((d) => setRows(d.providers ?? []))
      .catch(() => setRows([]));
  useEffect(() => {
    void load();
  }, []);

  async function save(p: ProviderStatus["provider"]) {
    const key = (drafts[p] ?? "").trim();
    if (!key) return;
    setBusy(p);
    setMsg(null);
    const res = await fetch("/api/settings/keys", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: p, key }) });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    setMsg({ provider: p, ok: res.ok, text: res.ok ? `Saved. Your agents now use your ${p === "OPENAI" ? "OpenAI" : "Solari"} key (…${d.last4}).` : d.error ?? "Could not save key" });
    if (res.ok) {
      setDrafts((x) => ({ ...x, [p]: "" }));
      void load();
    }
  }
  async function remove(p: ProviderStatus["provider"]) {
    setBusy(p);
    await fetch("/api/settings/keys", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: p }) });
    setBusy(null);
    setMsg({ provider: p, ok: true, text: "Removed. Using GhostLayer's default key again." });
    void load();
  }

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h2 className="flex items-center gap-2 font-medium text-ink">
          <KeyRound size={16} className="text-lavender" /> API keys
        </h2>
        <p className="mt-1 text-sm text-muted">
          Bring your own keys, or leave these empty to use GhostLayer&apos;s default keys. Keys are encrypted at rest (AES-256-GCM), used only by your own scans and repairs, and never shown again after saving.
        </p>
      </div>
      {!rows && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      )}
      {rows?.map((r) => (
        <div key={r.provider} className="rounded-xl border border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium text-ink">{r.label}</div>
              <div className="text-xs text-faint">{HINT[r.provider].use}</div>
            </div>
            {r.source === "user" ? (
              <Badge tone="emerald">
                <ShieldCheck size={11} /> Your key ••••{r.last4}
              </Badge>
            ) : (
              <Badge tone={r.defaultAvailable ? "slate" : "amber"}>{r.defaultAvailable ? "Using GhostLayer default" : "No key configured"}</Badge>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={r.source === "user" ? "Replace with a new key" : HINT[r.provider].placeholder}
              value={drafts[r.provider] ?? ""}
              onChange={(e) => setDrafts((x) => ({ ...x, [r.provider]: e.target.value }))}
              className="flex-1 rounded-xl border border-line bg-surface-2/70 px-3 py-2 font-mono text-sm text-ink placeholder:text-faint focus:border-violet focus:outline-none"
              aria-label={`${r.label} API key`}
            />
            <Button size="md" onClick={() => save(r.provider)} disabled={busy === r.provider || !(drafts[r.provider] ?? "").trim()}>
              {busy === r.provider ? <Loader2 size={14} className="animate-spin" /> : null} Save
            </Button>
            {r.source === "user" && (
              <Button variant="ghost" onClick={() => remove(r.provider)} disabled={busy === r.provider} aria-label={`Remove ${r.label} key`}>
                <Trash2 size={14} /> Use default
              </Button>
            )}
          </div>
          {msg?.provider === r.provider && <p className={`mt-2 text-xs ${msg.ok ? "text-emerald" : "text-coral"}`}>{msg.text}</p>}
        </div>
      ))}
    </Card>
  );
}
