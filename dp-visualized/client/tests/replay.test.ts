import { describe, it, expect } from "vitest";
import { replay, type TraceResponse } from "../src/lib/replay";
import type { DPStep } from "../src/types";

const steps: DPStep[] = [
  { stepIndex: 0, type: "base-case", coordinates: [0, 0], value: true, explanation: "base" },
  { stepIndex: 1, type: "table-write", coordinates: [0, 2], value: false, deps: [[0, 0]], explanation: "w" },
  { stepIndex: 2, type: "recurse-call", coordinates: [1, 2], callId: 7, parentCallId: undefined, dup: true, explanation: "call" },
  { stepIndex: 3, type: "recurse-return", coordinates: [1, 2], callId: 7, value: 5, explanation: "ret" },
];

const trace: TraceResponse = {
  slug: "t",
  meta: {
    mode: "tabulation",
    answer: null,
    answerLabel: "",
    tableShape: { rows: 2, cols: 3 },
    axisLabels: null,
    valueFormat: "bool",
    stats: { steps },
  },
  steps,
};

describe("replay()", () => {
  it("empty prefix yields untouched state", () => {
    const r = replay(trace, -1);
    expect(r.cells.size).toBe(0);
    expect(r.activeCoord).toBeNull();
  });

  it("prefix replay writes only cells up to the playhead", () => {
    const r = replay(trace, 1);
    expect(r.cells.get("0,0")?.value).toBe(true);
    expect(r.cells.get("0,2")?.value).toBe(false);
    expect(r.cells.has("1,2")).toBe(false);
    expect(r.activeCoord).toBe("0,2");
    expect(r.deps).toEqual(["0,0"]);
  });

  it("builds tree nodes with depth and duplicate flags", () => {
    const r = replay(trace, 3);
    const node = r.tree.nodes.get(7)!;
    expect(node.depth).toBe(0);
    expect(node.dup).toBe(true);
    expect(node.value).toBe(5);
    expect(r.tree.order).toEqual([7]);
    // recurse-return also lands in the cell map
    expect(r.cells.get("1,2")?.value).toBe(5);
  });

  it("scrubbing backwards is consistent with forward replay (determinism)", () => {
    const forward = replay(trace, 1);
    // recompute from scratch at the same index — must be identical
    const again = replay(trace, 1);
    expect([...forward.cells.entries()]).toEqual([...again.cells.entries()]);
  });
});
