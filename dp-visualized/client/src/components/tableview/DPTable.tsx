import type { TraceResponse } from "../../types";
import type { ReplayState } from "../../lib/replay";

export function LegendRow() {
  return (
    <div className="flex flex-wrap items-center gap-5">
      <Swatch className="border-accent bg-accent/10" label="Being computed" />
      <Swatch className="border-known/70 bg-known/10" label="Known / filled" />
      <Swatch className="border-line bg-transparent" label="Unvisited" />
    </div>
  );
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`inline-block h-3.5 w-3.5 rounded-[4px] border ${className}`} />
      <span className="text-[11px] text-slate-400">{label}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* DP TABLE — the literal spreadsheet view of the algorithm            */
/* ------------------------------------------------------------------ */

export function DPTable({
  trace,
  replayState,
}: {
  trace: TraceResponse;
  replayState: ReplayState;
}) {
  const { meta } = trace;
  if (!meta.tableShape || !meta.axisLabels) return null;
  const { rows, cols } = meta.tableShape;
  const rowLabels = meta.axisLabels.rowLabels ?? Array.from({ length: rows }, (_, i) => String(i));
  const colLabels = meta.axisLabels.colLabels ?? Array.from({ length: cols }, (_, j) => String(j));

  // rolling window: dim rows older than the current one (spaceOptimized mode)
  const rollingRows = new Set<number>();
  if (meta.rollingWindow && replayState.activeCoord) {
    const [ar] = replayState.activeCoord.split(",").map(Number);
    rollingRows.add(ar);
    rollingRows.add(ar - 1);
  }

  return (
    <div className="overflow-auto pb-1">
      <div
        className="grid w-fit gap-[3px] font-mono text-xs"
        style={{ gridTemplateColumns: `min-content repeat(${cols}, minmax(44px, 1fr))` }}
        role="table"
        aria-label="DP table"
      >
        {/* header row */}
        <div className="flex items-end justify-center pb-1 text-[10px] text-slate-500">i\j</div>
        {colLabels.map((c) => (
          <div key={`h${c}`} className="flex items-end justify-center pb-1 text-[10px] text-slate-500">
            {c}
          </div>
        ))}

        {Array.from({ length: rows }, (_, i) => (
          <RowCells
            key={i}
            i={i}
            cols={cols}
            rowLabel={rowLabels[i]}
            dim={rollingRows.size > 0 && !rollingRows.has(i)}
            trace={trace}
            replayState={replayState}
          />
        ))}
      </div>
    </div>
  );
}

function RowCells({
  i,
  cols,
  rowLabel,
  dim,
  trace,
  replayState,
}: {
  i: number;
  cols: number;
  rowLabel: string;
  dim: boolean;
  trace: TraceResponse;
  replayState: ReplayState;
}) {
  return (
    <>
      <div className={`flex items-center justify-center pr-1.5 text-[10px] text-slate-500 ${dim ? "opacity-30" : ""}`}>
        {rowLabel}
      </div>
      {Array.from({ length: cols }, (_, j) => (
        <Cell key={`${i}-${j}`} coord={[i, j]} dim={dim} trace={trace} replayState={replayState} />
      ))}
    </>
  );
}

const fmt = (v: number | boolean | undefined, format: "bool" | "int"): string => {
  if (v === undefined) return "";
  if (format === "bool") return v ? "T" : "F";
  if (typeof v === "number" && !Number.isFinite(v)) return "∞";
  if (typeof v === "number" && Math.abs(v) > 99999) return v.toExponential(1);
  return String(v);
};

function Cell({
  coord,
  dim,
  trace,
  replayState,
}: {
  coord: [number, number];
  dim: boolean;
  trace: TraceResponse;
  replayState: ReplayState;
}) {
  const key = coord.join(",");
  const cell = replayState.cells.get(key);
  const isActive = replayState.activeCoord === key;
  const isDep = !isActive && replayState.deps.includes(key);
  const known = cell !== undefined && (cell.writtenAt >= 0 || cell.value !== undefined);

  let cls =
    "flex h-9 items-center justify-center rounded-[5px] border transition-all duration-150 ";
  if (isActive) cls += " border-accent bg-accent/15 text-white shadow-[0_0_12px_rgba(129,140,248,0.35)] scale-[1.06]";
  else if (isDep) cls += " border-accent/50 bg-accent/5 text-accent";
  else if (known && cell?.value !== undefined)
    cls += ` border-known/60 bg-known/10 ${trace.meta.valueFormat === "bool" ? (cell.value ? "text-known" : "text-rose-400") : "text-emerald-200"}`;
  else cls += " border-line text-slate-600";
  if (dim && !isActive) cls += " opacity-25";

  return (
    <div className={cls} title={known ? `${key} → ${fmt(cell?.value, trace.meta.valueFormat)}` : key}>
      {known ? fmt(cell?.value, trace.meta.valueFormat) || "—" : "—"}
    </div>
  );
}
