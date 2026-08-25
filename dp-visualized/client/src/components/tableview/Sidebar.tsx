import { useEffect, useRef } from "react";
import { CodePanel } from "../code/CodePanel";
import { usePlayback } from "../../stores/playback";
import type { TraceResponse, DPStep, ProblemDetail, DPMode } from "../../types";
import type { ReplayState } from "../../lib/replay";

export function Sidebar({
  problem,
  mode,
  trace,
  replayState,
  currentStep,
}: {
  problem: ProblemDetail;
  mode: DPMode;
  trace: TraceResponse | null;
  replayState: ReplayState | null;
  currentStep: DPStep | null;
}) {
  return (
    <aside className="flex h-full w-full flex-col gap-4 overflow-y-auto border-l border-line bg-panel p-4">
      <CurrentStep step={currentStep} />
      <Stats trace={trace} />
      <div className="flex min-h-[220px] flex-[3] flex-col">
        <CodePanel codes={problem.codes} variant={variantOf(mode)} currentStep={currentStep} />
      </div>
      <Log trace={trace} uptoIndex={currentStep?.stepIndex ?? -1} />
      <ComparisonTrace />
    </aside>
  );
}

function variantOf(mode: DPMode): string {
  return { bruteforce: "bruteforce", memo: "memoization", tabulation: "tabulation", spaceOptimized: "spaceOptimized" }[mode];
}

function CurrentStep({ step }: { step: DPStep | null }) {
  const box = "rounded-lg border border-accent/30 bg-accent/[0.06] p-3";
  if (!step)
    return (
      <section className={box}>
        <h2 className="panel-label mb-1">Current Step</h2>
        <p className="text-xs text-slate-400">Press Play or Step to begin the simulation.</p>
      </section>
    );
  return (
    <section className={box}>
      <h2 className="panel-label mb-1">
        Current Step — <span className="text-accent">{prettyType(step.type)}</span>
        <span className="ml-1 font-mono text-[10px] text-slate-500">[{step.coordinates.join(",")}]</span>
      </h2>
      <p className="text-xs leading-relaxed text-slate-200">{step.explanation}</p>
    </section>
  );
}

function prettyType(t: string): string {
  return (
    {
      "recurse-call": "call",
      "recurse-return": "return",
      "memo-hit": "memo hit",
      "table-write": "write",
      "table-read": "read",
      "base-case": "base case",
    }[t] ?? t
  );
}

function Stats({ trace }: { trace: TraceResponse | null }) {
  const index = usePlayback((s) => s.index);
  const answer = trace?.meta.answer;
  const fmt = (v: unknown) =>
    typeof v === "boolean" ? (v ? "True" : "False") : v === undefined || v === null ? "—" : String(v);
  return (
    <section className="grid grid-cols-3 gap-2">
      <Tile label="Step" value={index >= 0 ? String(index + 1) : "0"} />
      <Tile label="Total" value={trace ? String(trace.meta.stats.steps) : "—"} />
      <Tile label="Answer" value={fmt(answer)} accent />
    </section>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  const answered = accent && value !== "—";
  return (
    <div
      className={`rounded-md border p-2 ${
        answered ? "border-known/40 bg-known/10" : "border-line bg-raised"
      }`}
    >
      <div className="panel-label">{label}</div>
      <div className={`mt-0.5 font-mono text-sm font-semibold ${answered ? "text-known" : "text-white"}`}>{value}</div>
    </div>
  );
}

function Log({ trace, uptoIndex }: { trace: TraceResponse | null; uptoIndex: number }) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [uptoIndex]);

  const lines =
    trace?.steps.slice(0, uptoIndex + 1).map((s) => ({
      i: s.stepIndex,
      coord: s.coordinates.join(","),
      text: s.explanation,
    })) ?? [];

  return (
    <section className="flex min-h-[120px] flex-col">
      <h2 className="panel-label mb-2">Computation Log</h2>
      <div ref={scroller} className="max-h-44 flex-1 overflow-y-auto rounded-md border border-line bg-[#0a0c11] p-2 font-mono text-[11px] leading-relaxed">
        {lines.length === 0 ? (
          <p className="text-slate-600">Nothing yet.</p>
        ) : (
          lines.map((l) => (
            <div key={l.i} className="flex gap-2 py-[1px]">
              <span className="w-9 shrink-0 text-right text-slate-600">{l.i + 1}</span>
              <span className="shrink-0 text-slate-600">[{l.coord}]</span>
              <span className="text-slate-300">{l.text}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function ComparisonTrace() {
  return (
    <section className="rounded-md border border-dashed border-line p-3">
      <h2 className="panel-label mb-1">Comparison Trace</h2>
      <p className="text-xs text-slate-500">No comparison yet.</p>
    </section>
  );
}
