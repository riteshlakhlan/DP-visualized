import { useMemo } from "react";
import { ExternalLink, ChevronDown } from "lucide-react";
import type { ProblemDetail } from "../../types";

export function TopBar({
  problem,
  problems,
  onPickProblem,
  itemsValue,
  itemsMax,
  itemsLabel,
  onItemsChange,
  onReset,
  onStep,
  onPlay,
  playing,
  speed,
  onSpeedChange,
}: {
  problem: ProblemDetail;
  problems: { slug: string; title: string; patternSlug: string; implemented: boolean }[];
  onPickProblem: (slug: string) => void;
  itemsValue: number | null;
  itemsMax: number | null;
  itemsLabel: string | null;
  onItemsChange: (v: number) => void;
  onReset: () => void;
  onStep: () => void;
  onPlay: () => void;
  playing: boolean;
  speed: number;
  onSpeedChange: (s: number) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, typeof problems>();
    for (const p of problems) {
      const arr = map.get(p.patternSlug) ?? [];
      arr.push(p);
      map.set(p.patternSlug, arr);
    }
    return [...map.entries()];
  }, [problems]);

  return (
    <div className="flex flex-col gap-3">
      {/* Row 1 — problem picker */}
      <div className="flex items-center gap-2">
        <span className="panel-label">Problem</span>
        <div className="relative">
          <select
            value={problem.slug}
            onChange={(e) => onPickProblem(e.target.value)}
            className="w-64 pr-7"
            aria-label="Switch problem"
          >
            {grouped.map(([patternSlug, list]) => (
              <optgroup key={patternSlug} label={patternSlug}>
                {list.map((p) => (
                  <option key={p.slug} value={p.slug} disabled={!p.implemented}>
                    {p.title}
                    {!p.implemented ? " (viz soon)" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />
        </div>
        <a
          href={problem.striverLink}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-xs text-slate-400 hover:text-accent"
        >
          source <ExternalLink size={12} />
        </a>
      </div>

      {/* Row 2 — title + badges */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-sans text-xl font-semibold text-white">{problem.title}</h1>
        <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${
          problem.difficulty === "Easy" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          : problem.difficulty === "Medium" ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
          : "border-rose-500/40 bg-rose-500/10 text-rose-400"
        }`}>
          {problem.difficulty}
        </span>
        <span className="rounded-full border border-line bg-raised px-2 py-0.5 font-mono text-[11px] text-slate-400">
          {problem.patternSlug.replace("dp-", "").replace(/-/g, " ")}
        </span>
        {problem.timeComplexity && (
          <span className="rounded-full border border-sky-500/30 bg-sky-500/8 px-2 py-0.5 font-mono text-[11px] text-sky-400" title="Time complexity (optimized)">
            ⏱ {problem.timeComplexity}
          </span>
        )}
        {problem.spaceComplexity && (
          <span className="rounded-full border border-violet-500/30 bg-violet-500/8 px-2 py-0.5 font-mono text-[11px] text-violet-400" title="Space complexity (optimized)">
            ◈ {problem.spaceComplexity}
          </span>
        )}
      </div>

      {/* Row 2b — key insight callout */}
      {problem.keyInsight && (
        <div className="flex items-start gap-2 rounded-md border border-accent/20 bg-accent/[0.06] px-3 py-2">
          <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4.929 19.071l-.707.707M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[12px] leading-relaxed text-accent/90">{problem.keyInsight}</p>
        </div>
      )}

      {/* Row 3 — one-line restatement */}
      <p className="max-w-3xl text-[13px] leading-relaxed text-body">{firstSentence(problem.statement)}</p>

      {/* Row 4 — controls */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {itemsValue !== null && itemsLabel && (
          <label className="flex items-center gap-2">
            <span className="panel-label">{itemsLabel}</span>
            <input
              type="range"
              min={1}
              max={itemsMax ?? 10}
              value={itemsValue}
              onChange={(e) => onItemsChange(Number(e.target.value))}
              className="w-36"
              aria-label={itemsLabel}
            />
            <span className="w-6 font-mono text-xs text-white">{itemsValue}</span>
          </label>
        )}
        <button className="btn" onClick={onReset}>↺ Reset</button>
        <button className="btn" onClick={onStep}>Step →</button>
        <button className="btn btn-primary min-w-[86px]" onClick={onPlay}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
        <label className="flex items-center gap-2">
          <span className="panel-label">Speed</span>
          <select value={speed} onChange={(e) => onSpeedChange(Number(e.target.value))} aria-label="Speed">
            <option value={0.5}>Slow</option>
            <option value={1}>Normal</option>
            <option value={2}>Fast</option>
            <option value={4}>Turbo</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function firstSentence(s: string): string {
  return s.split("(visualizer caps lower)")[0].split(/(?<=\.)\s(?=[A-Z])/)[0] ?? s;
}

export { firstSentence };
