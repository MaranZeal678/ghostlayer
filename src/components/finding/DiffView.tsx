import { cn } from "@/lib/cn";

export function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <pre className="max-h-[520px] overflow-auto rounded-xl border border-line bg-[#0b0c16] p-0 font-mono text-[0.75rem] leading-5">
      {lines.map((l, i) => (
        <div
          key={i}
          className={cn(
            "px-4 whitespace-pre",
            l.startsWith("+++") || l.startsWith("---") ? "text-muted" : l.startsWith("+") ? "bg-emerald/10 text-emerald" : l.startsWith("-") ? "bg-coral/10 text-coral" : l.startsWith("@@") ? "bg-violet/10 text-lavender" : l.startsWith("diff ") ? "mt-2 border-t border-line pt-2 text-ink" : "text-ink/70",
          )}
        >
          {l || " "}
        </div>
      ))}
    </pre>
  );
}
