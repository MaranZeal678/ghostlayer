import Link from "next/link";
import { GhostMark } from "@/components/ui/Logo";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="bg-atmosphere relative grid min-h-screen place-items-center px-4 py-12">
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <div className="relative flex flex-col items-center gap-6">
        <Link href="/" className="flex items-center gap-2 text-ink">
          <GhostMark size={28} />
          <span className="text-lg font-semibold tracking-tight">GhostLayer</span>
        </Link>
        <div className="text-center">
          <h1 className="font-display text-4xl italic text-ink">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
