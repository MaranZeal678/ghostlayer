"use client";

import Link from "next/link";
import { ClerkFailed, ClerkLoading, Show, UserButton } from "@clerk/nextjs";
import { ArrowRight, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Wordmark } from "./Logo";
import { cn } from "./cn";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#agents", label: "Agents" },
  { href: "#verification", label: "Verification" },
];

function DashboardLink({ label }: { label: string }) {
  return (
    <Link
      href="/dashboard"
      className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-bg transition hover:bg-lavender"
    >
      {label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        scrolled || open ? "border-b border-line bg-bg/75 backdrop-blur-xl" : "border-b border-transparent",
      )}
    >
      <nav aria-label="Primary" className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="rounded-md" aria-label="GhostLayer home">
          <Wordmark />
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="rounded-md px-3 py-2 text-sm text-muted transition-colors hover:text-ink"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <ClerkLoading>
            <DashboardLink label="Dashboard" />
          </ClerkLoading>
          <ClerkFailed>
            <DashboardLink label="Dashboard" />
          </ClerkFailed>
          <Show
            when="signed-in"
            fallback={
              <>
                <Link
                  href="/sign-in"
                  className="hidden rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-ink sm:inline-flex"
                >
                  Sign in
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-bg transition hover:bg-lavender"
                >
                  Get started <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </>
            }
          >
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-bg transition hover:bg-lavender"
            >
              Dashboard <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
            <UserButton />
          </Show>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-ink md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>
      {open && (
        <ul id="mobile-nav" className="border-t border-line px-5 pb-4 pt-2 md:hidden">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-md px-2 py-3 text-sm text-muted hover:text-ink"
              >
                {l.label}
              </a>
            </li>
          ))}
          <li>
            <Show when="signed-out">
              <Link href="/sign-in" className="block rounded-md px-2 py-3 text-sm text-muted hover:text-ink">
                Sign in
              </Link>
            </Show>
          </li>
        </ul>
      )}
    </header>
  );
}
