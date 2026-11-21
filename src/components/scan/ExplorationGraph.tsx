"use client";
import { useMemo } from "react";
import { motion } from "motion/react";

export interface GNode { id: string; path: string; title: string; status: "ok" | "error" | "finding"; httpStatus?: number }
export interface GEdge { id: string; from: string; to: string; label: string; kind: string; status: "ok" | "anomaly" }

/** Layered layout of the real exploration graph: columns = discovery depth from the entry page. */
export function ExplorationGraph({ nodes, edges, activePath }: { nodes: GNode[]; edges: GEdge[]; activePath?: string | null }) {
  const layout = useMemo(() => {
    if (!nodes.length) return null;
    const depth = new Map<string, number>([[nodes[0].id, 0]]);
    const queue = [nodes[0].id];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const e of edges.filter((x) => x.from === cur)) {
        if (!depth.has(e.to)) {
          depth.set(e.to, depth.get(cur)! + 1);
          queue.push(e.to);
        }
      }
    }
    for (const n of nodes) if (!depth.has(n.id)) depth.set(n.id, 1);
    const cols = new Map<number, string[]>();
    for (const n of nodes) {
      const d = depth.get(n.id)!;
      cols.set(d, [...(cols.get(d) ?? []), n.id]);
    }
    const W = 760;
    const H = Math.max(320, Math.max(...[...cols.values()].map((c) => c.length)) * 78 + 40);
    const maxD = Math.max(...cols.keys());
    const pos = new Map<string, { x: number; y: number }>();
    for (const [d, ids] of cols) ids.forEach((id, i) => pos.set(id, { x: 90 + (maxD ? (d / maxD) * (W - 180) : W / 2 - 90), y: ((i + 1) * H) / (ids.length + 1) }));
    return { W, H, pos };
  }, [nodes, edges]);

  if (!layout) return <div className="grid h-80 place-items-center text-sm text-muted">The exploration graph appears as the Explorer visits pages.</div>;
  const { W, H, pos } = layout;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full max-h-[460px] w-full" role="img" aria-label="Exploration graph of visited pages and interactions">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="rgba(196,181,253,0.5)" />
        </marker>
      </defs>
      {edges.map((e) => {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        if (!a || !b) return null;
        const self = e.from === e.to;
        const d = self ? `M${a.x + 14},${a.y - 10} C${a.x + 70},${a.y - 70} ${a.x - 70},${a.y - 70} ${a.x - 14},${a.y - 10}` : `M${a.x},${a.y} C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x - 18},${b.y}`;
        return (
          <g key={e.id}>
            <motion.path d={d} fill="none" stroke={e.status === "anomaly" ? "#FB7185" : "rgba(196,181,253,0.35)"} strokeWidth={e.status === "anomaly" ? 2 : 1.2} strokeDasharray={e.kind === "link" ? "0" : "4 4"} markerEnd="url(#arrow)" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8 }} />
            {e.status === "anomaly" && (
              <text x={self ? a.x : (a.x + b.x) / 2} y={self ? a.y - 62 : (a.y + b.y) / 2 - 6} textAnchor="middle" className="fill-coral text-[10px]">
                {e.label.slice(0, 24)}
              </text>
            )}
          </g>
        );
      })}
      {nodes.map((n) => {
        const p = pos.get(n.id)!;
        const color = n.status === "finding" ? "#FB7185" : n.status === "error" ? "#FBBF24" : "#22D3EE";
        const active = activePath === n.path;
        return (
          <motion.g key={n.id} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} style={{ transformOrigin: `${p.x}px ${p.y}px` }}>
            {active && <motion.circle cx={p.x} cy={p.y} r={26} fill="none" stroke="#C4B5FD" strokeWidth={1.5} animate={{ r: [18, 30], opacity: [0.8, 0] }} transition={{ duration: 1.4, repeat: Infinity }} />}
            <circle cx={p.x} cy={p.y} r={14} fill="#111321" stroke={color} strokeWidth={2} />
            <circle cx={p.x} cy={p.y} r={5} fill={color} />
            <text x={p.x} y={p.y + 30} textAnchor="middle" className="fill-ink font-mono text-[11px]">{n.path.length > 22 ? `${n.path.slice(0, 21)}…` : n.path}</text>
            {n.httpStatus && n.httpStatus >= 400 && <text x={p.x} y={p.y + 43} textAnchor="middle" className="fill-amber font-mono text-[10px]">HTTP {n.httpStatus}</text>}
          </motion.g>
        );
      })}
    </svg>
  );
}
