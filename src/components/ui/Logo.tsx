export function GhostMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="gl-g" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#C4B5FD" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <path d="M16 3c-6.1 0-10 4.6-10 10.4V27l3.3-2.4 3.4 2.4 3.3-2.4 3.3 2.4 3.4-2.4L26 27V13.4C26 7.6 22.1 3 16 3Z" stroke="url(#gl-g)" strokeWidth="1.8" fill="rgba(139,92,246,0.12)" />
      <circle cx="12.5" cy="13.5" r="1.7" fill="#F8FAFC" />
      <circle cx="19.5" cy="13.5" r="1.7" fill="#F8FAFC" />
      <ellipse cx="16" cy="19.5" rx="5.5" ry="1.2" stroke="#22D3EE" strokeOpacity=".6" strokeWidth="1" />
    </svg>
  );
}

export function GithubIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.7 5.39-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}
