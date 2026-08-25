import type { DPStep } from "../../types";

export function CurrentStepBox({ step }: { step: DPStep | null }) {
  return (
    <section className="rounded-lg border border-accent/30 bg-accent/[0.06] p-3">
      <h2 className="panel-label mb-1">Current Step</h2>
      <p className="text-xs leading-relaxed text-slate-200">
        {step ? `${step.explanation}` : "Press Play or Step to begin the simulation."}
      </p>
    </section>
  );
}

export function StatsRow({ index, total }: { index: number; total: number }) {
  return (
    <div className="mt-3 flex gap-4 font-mono text-[11px] text-slate-400">
      <span>
        step <span className="text-white">{index + 1}</span> / {total}
      </span>
    </div>
  );
}
