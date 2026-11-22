import { cn } from "./cn";

/** GhostLayer mark: a ghost silhouette whose eyes are a keyhole-like rabbit-hole portal. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("h-7 w-7", className)} fill="none">
      <defs>
        <linearGradient id="gl-mark" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#c4b5fd" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <path
        d="M16 3.5c-6.1 0-10.5 4.6-10.5 10.6v13.4l3.2-2.3 2.6 2.3 2.4-2.3L16 27.5l2.3-2.3 2.4 2.3 2.6-2.3 3.2 2.3V14.1C26.5 8.1 22.1 3.5 16 3.5Z"
        stroke="url(#gl-mark)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <ellipse cx="16" cy="14.5" rx="4.6" ry="4.6" stroke="#8b5cf6" strokeOpacity=".7" strokeWidth="1" />
      <ellipse cx="16" cy="14.5" rx="2.6" ry="2.6" stroke="#22d3ee" strokeOpacity=".9" strokeWidth="1" />
      <circle cx="16" cy="14.5" r="0.9" fill="#f8fafc" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-[0.9375rem] font-semibold tracking-tight text-ink">
        Ghost<span className="text-lavender">Layer</span>
      </span>
    </span>
  );
}
