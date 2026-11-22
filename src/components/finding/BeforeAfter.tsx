"use client";
import { useRef, useState } from "react";

/** Draggable before/after comparison of real verifier screenshots. */
export function BeforeAfter({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const move = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };
  return (
    <div
      ref={ref}
      className="relative select-none overflow-hidden rounded-xl border border-line"
      onPointerMove={(e) => e.buttons === 1 && move(e.clientX)}
      onPointerDown={(e) => move(e.clientX)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt="After the fix (patched build)" className="block w-full" draggable={false} />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before} alt="Before the fix (live site)" className="block w-full" draggable={false} />
      </div>
      <div className="absolute inset-y-0 w-0.5 bg-cyan shadow-[0_0_12px_#22d3ee]" style={{ left: `${pos}%` }}>
        <div className="absolute top-1/2 -left-3 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-cyan text-[0.625rem] font-bold text-bg">⇆</div>
      </div>
      <span className="absolute top-2 left-2 rounded-md bg-coral/80 px-2 py-0.5 text-[0.6875rem] font-medium text-white">Before · unpatched</span>
      <span className="absolute top-2 right-2 rounded-md bg-emerald/80 px-2 py-0.5 text-[0.6875rem] font-medium text-bg">After · patched</span>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Compare before and after" className="absolute inset-x-0 bottom-0 w-full opacity-0" />
    </div>
  );
}
