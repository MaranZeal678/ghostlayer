"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Rabbit } from "lucide-react";
import { Button } from "@/components/ui/primitives";

export function StartScanButton({ projectId, disabled }: { projectId: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/scans`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Could not start scan");
      setBusy(false);
      return;
    }
    router.push(`/dashboard/projects/${projectId}/scans/${data.scan.id}`);
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="lg" onClick={start} disabled={busy || disabled} className="group">
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Rabbit size={18} className="transition-transform group-hover:translate-y-0.5" />}
        Start autonomous scan
      </Button>
      <span className="text-[11px] italic text-faint">Enter the rabbit hole</span>
      {error && <span className="text-xs text-coral">{error}</span>}
    </div>
  );
}
