import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes, HTMLAttributes } from "react";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-cyan cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-violet text-white shadow-[0_0_0_1px_rgba(196,181,253,0.35),0_8px_30px_-8px_rgba(139,92,246,0.8)] hover:bg-[#7c4fe6] hover:-translate-y-px",
        secondary: "glass text-ink hover:border-line-strong hover:bg-surface-2",
        ghost: "text-muted hover:text-ink hover:bg-white/5",
        danger: "bg-coral/15 text-coral border border-coral/30 hover:bg-coral/25",
        success: "bg-emerald/15 text-emerald border border-emerald/30 hover:bg-emerald/25",
      },
      size: { sm: "h-8 px-3", md: "h-10 px-4", lg: "h-12 px-6 text-base" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({ className, variant, size, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass rounded-2xl", className)} {...props} />;
}

const tone = {
  violet: "bg-violet/15 text-lavender border-violet/30",
  cyan: "bg-cyan/10 text-cyan border-cyan/30",
  emerald: "bg-emerald/10 text-emerald border-emerald/30",
  coral: "bg-coral/10 text-coral border-coral/30",
  amber: "bg-amber/10 text-amber border-amber/30",
  slate: "bg-white/5 text-muted border-line",
} as const;
export type Tone = keyof typeof tone;

export function Badge({ tone: t = "slate", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide", tone[t], className)} {...props} />;
}

export function severityTone(s: string): Tone {
  return s === "CRITICAL" || s === "HIGH" ? "coral" : s === "MEDIUM" ? "amber" : "slate";
}
export function statusTone(s: string): Tone {
  if (["COMPLETED", "PR_CREATED", "READY_FOR_REVIEW", "CONFIRMED", "DONE", "FIX_VERIFIED", "PR_OPENED"].includes(s)) return "emerald";
  if (["FAILED", "REJECTED"].includes(s)) return "coral";
  if (["CANCELLED", "PARTIALLY_COMPLETED", "NEEDS_REVIEW", "SUSPECTED"].includes(s)) return "amber";
  if (["QUEUED"].includes(s)) return "slate";
  return "cyan";
}
export function label(s: string) {
  return s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function Stat({ label: l, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-faint">{l}</div>
      <div className="mt-1 font-mono text-2xl text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

export function Pulse({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex h-2 w-2", className)}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan" />
    </span>
  );
}
