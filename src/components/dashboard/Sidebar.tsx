"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FolderGit2, Settings, Plus } from "lucide-react";
import { GithubIcon as Github } from "@/components/ui/Logo";
import { UserButton } from "@clerk/nextjs";
import { GhostMark } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/projects", label: "Projects", icon: FolderGit2 },
  { href: "/dashboard/connections", label: "GitHub", icon: Github },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ githubConnected }: { githubConnected: boolean }) {
  const path = usePathname();
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface/40 px-3 py-5 backdrop-blur md:flex">
        <Link href="/" className="mb-8 flex items-center gap-2 px-2">
          <GhostMark size={26} />
          <span className="font-semibold tracking-tight">GhostLayer</span>
        </Link>
        <Link href="/dashboard/projects/new" className="mb-6 flex h-9 items-center justify-center gap-2 rounded-xl bg-violet text-sm font-medium text-white shadow-[0_8px_30px_-10px_rgba(139,92,246,0.9)] hover:bg-[#7c4fe6]">
          <Plus size={16} /> New project
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => {
            const active = n.exact ? path === n.href : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors", active ? "bg-violet/15 text-ink" : "text-muted hover:bg-white/5 hover:text-ink")}
              >
                <n.icon size={16} className={active ? "text-lavender" : ""} />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-3 px-2">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className={cn("h-2 w-2 rounded-full", githubConnected ? "bg-emerald" : "bg-faint")} />
            GitHub {githubConnected ? "connected" : "not connected"}
          </div>
          <UserButton />
        </div>
      </aside>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <GhostMark size={22} />
          <span className="font-semibold">GhostLayer</span>
        </Link>
        <nav className="ml-auto flex items-center gap-1">
          {NAV.slice(0, 3).map((n) => (
            <Link key={n.href} href={n.href} aria-label={n.label} className="rounded-lg p-2 text-muted hover:text-ink">
              <n.icon size={18} />
            </Link>
          ))}
          <UserButton />
        </nav>
      </div>
    </>
  );
}
