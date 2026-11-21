"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2 } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { RepoPicker, type Repo } from "@/components/dashboard/RepoPicker";

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [repo, setRepo] = useState<{ connectionId: string; repositoryId: number; repo: Repo } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description: description || null, websiteUrl, authorized, connectionId: repo?.connectionId, repositoryId: repo?.repositoryId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.issues?.[0]?.message ?? data.error ?? "Could not create project");
      router.push(`/dashboard/projects/${data.project.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const field = "w-full rounded-xl border border-line bg-surface-2/70 px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-violet focus:outline-none";
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New project</h1>
        <p className="text-sm text-muted">A project pairs a deployed website with (optionally) the GitHub repository that builds it.</p>
      </div>
      <form onSubmit={submit} className="space-y-5">
        <Card className="space-y-4 p-6">
          <label className="block space-y-1.5">
            <span className="text-sm text-ink">Project name</span>
            <input required className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mad Hatter's Tea Emporium" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-ink">Description <span className="text-faint">(optional)</span></span>
            <input className={field} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Storefront and checkout" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-ink">Deployed website URL</span>
            <input required type="url" className={field} value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://your-app.vercel.app" />
            <span className="text-xs text-faint">Agents stay on this origin. Private, internal and cloud-metadata addresses are blocked.</span>
          </label>
        </Card>
        <Card className="space-y-3 p-6">
          <div>
            <h2 className="text-sm font-medium text-ink">GitHub repository</h2>
            <p className="text-xs text-muted">Required for automated repair and pull requests. GhostLayer only sees repositories you granted to its GitHub App.</p>
          </div>
          <RepoPicker value={repo} onChange={setRepo} />
        </Card>
        <Card className="p-6">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" required checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} className="mt-1 h-4 w-4 accent-violet" />
            <span className="text-sm text-muted">
              <span className="flex items-center gap-1.5 font-medium text-ink">
                <ShieldCheck size={14} className="text-emerald" /> I own this website or am explicitly authorized to test it
              </span>
              GhostLayer&apos;s agents will click buttons and submit forms with synthetic test data. Only point it at test or staging deployments where that is safe. Destructive controls (account deletion, sign-out, money transfers) are skipped.
            </span>
          </label>
        </Card>
        {error && <div className="rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">{error}</div>}
        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={busy || !authorized}>
            {busy && <Loader2 size={16} className="animate-spin" />} Create project
          </Button>
        </div>
      </form>
    </div>
  );
}
