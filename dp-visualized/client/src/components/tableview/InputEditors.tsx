import { RotateCcw } from "lucide-react";
import type { InputFieldDescriptorDTO } from "./InputEditors.types";

/* ------------------------------------------------------------------ */
/* ITEMS row per spec: interactive chips + count slider.               */
/* Clicking a chip cycles its value; changing counts regenerates trace.*/
/* ------------------------------------------------------------------ */

export function ItemsRow({
  descriptors,
  input,
  onChange,
}: {
  descriptors: InputFieldDescriptorDTO[];
  input: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
      {descriptors.map((d) => (
        <div key={d.key}>
          <div className="mb-1 flex items-center gap-3">
            <span className="panel-label">{d.label}</span>
            {d.kind === "array" && (
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={d.min ?? 1}
                  max={d.max ?? 9}
                  value={(input[d.key] as unknown[]).length}
                  onChange={(e) => resizeArray(input, d, Number(e.target.value), onChange)}
                  className="w-28"
                  aria-label={`${d.label} count`}
                />
                <button
                  className="text-slate-500 hover:text-accent"
                  title={`Randomize ${d.label}`}
                  onClick={() => randomizeArray(input, d, onChange)}
                >
                  <RotateCcw size={12} />
                </button>
              </div>
            )}
            {d.kind === "number" && (
              <input
                type="range"
                min={d.min ?? 0}
                max={d.max ?? 20}
                value={Number(input[d.key])}
                onChange={(e) => onChange({ ...input, [d.key]: Number(e.target.value) })}
                className="w-28"
                aria-label={d.label}
              />
            )}
            {d.kind === "stringPair" && (
              <input
                value={String(input[d.key] ?? "")}
                maxLength={d.max ?? 8}
                onChange={(e) => {
                  const cls = d.allow ?? "a-z";
                  const re = new RegExp(`[^${cls}]`, "g");
                  const next = e.target.value.replace(re, "");
                  onChange({ ...input, [d.key]: next });
                }}
                className="w-32 rounded-md border border-line bg-raised px-2 py-1 font-mono text-xs text-white outline-none focus:border-accent"
                aria-label={d.label}
              />
            )}
            {d.kind === "grid" && <GridDims d={d} input={input} onChange={onChange} />}
          </div>

          {d.kind === "array" && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {(input[d.key] as number[]).map((v, i) => (
                  <button
                    key={i}
                    onClick={() => cycleValue(input, d, i, onChange)}
                    className="group flex h-11 w-11 flex-col items-center justify-center rounded-md border border-line bg-raised font-mono transition-colors hover:border-accent/70"
                    title={`Click to change value`}
                  >
                    <span className="text-sm font-semibold text-white">{v}</span>
                    <span className="text-[9px] text-slate-500">[{i}]</span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-slate-500">
                Drag {d.label} to change count · click a cell to cycle its value
              </p>
            </>
          )}

          {d.kind === "number" && (
            <p className="mt-1.5 font-mono text-xs text-white">{String(input[d.key])}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function GridDims({
  d,
  input,
  onChange,
}: {
  d: InputFieldDescriptorDTO;
  input: Record<string, unknown>;
  onChange: (n: Record<string, unknown>) => void;
}) {
  const grid = input[d.key] as number[][];
  const isRagged = grid.some((rw, i) => rw.length !== grid[0].length);
  const setDims = (rows: number, cols: number) => {
    const next = Array.from({ length: rows }, (_, r) =>
      Array.from(
        { length: isRagged ? r + 1 : cols },
        (_, c) => {
          const src = grid[r]?.[c];
          if (src !== undefined) return src;
          const [lo, hi] = d.valueRange ?? [1, 9];
          return Math.max(lo, Math.min(lo + 1, hi));
        },
      ),
    );
    onChange({ ...input, [d.key]: next });
  };
  const [colLo, colHi] = d.colsRange ?? [d.min ?? 2, d.max ?? 6];
  const cycleCell = (r: number, c: number) => {
    const next = grid.map((rw, ri) => rw.map((cv, ci) => (ri === r && ci === c ? nextInCycle(cv, d) : cv)));
    onChange({ ...input, [d.key]: next });
  };
  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">rows</span>
        <input
          type="range"
          min={d.min ?? 2}
          max={d.max ?? 6}
          value={grid.length}
          onChange={(e) => setDims(Number(e.target.value), grid[0].length)}
          className="w-20"
          aria-label="rows"
        />
      </label>
      {!isRagged && (
        <label className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">cols</span>
          <input
            type="range"
            min={colLo}
            max={colHi}
            value={grid[0].length}
            onChange={(e) => setDims(grid.length, Number(e.target.value))}
            className="w-20"
            aria-label="cols"
          />
        </label>
      )}
      <div className="flex flex-col gap-[3px]">
        {grid.map((row, r) => (
          <div key={r} className="flex gap-[3px]">
            {row.map((v, c) => (
              <button
                key={c}
                onClick={() => cycleCell(r, c)}
                className={`flex h-5 w-5 items-center justify-center rounded-[3px] border font-mono text-[9px] hover:border-accent/70 hover:text-white ${
                  v === 0 ? "border-accent/60 bg-accent/20 text-white" : "border-line bg-raised text-slate-300"
                }`}
                title="click to cycle value"
              >
                {v === 1 && (d.valueRange?.[1] ?? 9) === 1 ? "█" : v}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Cycle within the descriptor's valueRange when provided (supports 0-cells like obstacles). */
function nextInCycle(v: number, d: InputFieldDescriptorDTO): number {
  if (d.valueRange) {
    const [lo, hi] = d.valueRange;
    return v >= hi ? lo : v + 1;
  }
  return (v % 9) + 1;
}

function resizeArray(
  input: Record<string, unknown>,
  d: InputFieldDescriptorDTO,
  len: number,
  onChange: (n: Record<string, unknown>) => void,
) {
  const arr = [...(input[d.key] as number[])];
  const [lo] = d.valueRange ?? [0];
  while (arr.length < len) arr.push(lo + Math.floor(Math.random() * (((d.valueRange?.[1] ?? 10) - lo) + 1)) || lo);
  while (arr.length > len) arr.pop();
  onChange({ ...input, [d.key]: arr });
}

function randomizeArray(
  input: Record<string, unknown>,
  d: InputFieldDescriptorDTO,
  onChange: (n: Record<string, unknown>) => void,
) {
  const [lo, hi] = d.valueRange ?? [0, 10];
  const arr = (input[d.key] as number[]).map(() => lo + Math.floor(Math.random() * (hi - lo + 1)));
  onChange({ ...input, [d.key]: arr });
}

function cycleValue(
  input: Record<string, unknown>,
  d: InputFieldDescriptorDTO,
  index: number,
  onChange: (n: Record<string, unknown>) => void,
) {
  const [lo, hi] = d.valueRange ?? [0, 10];
  const arr = [...(input[d.key] as number[])];
  arr[index] = arr[index] >= hi ? lo : arr[index] + 1;
  onChange({ ...input, [d.key]: arr });
}
