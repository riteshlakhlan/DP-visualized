import type { TraceResponse } from "../types";

export interface CellState {
  value?: number | boolean;
  writtenAt: number; // step index at which it was written (-1 = unvisited)
}

export interface ReplayTree {
  nodes: Map<number, { coords: number[]; parentCallId?: number; depth: number; dup: boolean; callAt: number; value?: number | boolean; dupOfCoords?: string }>;
  children: Map<number, number[]>;
  order: number[]; // call ids in reveal order
}

export interface ReplayState {
  cells: Map<string, CellState>;
  activeCoord: string | null;
  deps: string[];
  lastStepType: TraceResponse["steps"][number]["type"] | null;
  tree: ReplayTree;
}

/**
 * Deterministic replay of steps[0..index] -> visual state.
 * Pure and cheap for our capped traces (< ~2k steps).
 */
export function replay(trace: TraceResponse, index: number): ReplayState {
  const cells = new Map<string, CellState>();
  const tree: ReplayTree = { nodes: new Map(), children: new Map(), order: [] };
  let activeCoord: string | null = null;
  let deps: string[] = [];
  let lastStepType: ReplayState["lastStepType"] = null;

  const depthOf = new Map<number, number>();
  const firstSeenCoord = new Map<string, string>(); // coordKey -> coordKey of first occurrence

  // 1D services emit single-index coordinates ([i]) while the table/grid render
  // row,col keys — lift them into row 0 so cells light up.
  const rows = trace.meta.tableShape?.rows ?? 0;
  const keyOf = (c: number[]): string =>
    rows === 1 && c.length === 1 ? `0,${c[0]}` : c.join(",");

  for (let i = 0; i <= index && i < trace.steps.length; i++) {
    const s = trace.steps[i];
    const raw = s.coordinates.join(",");
    const ck = keyOf(s.coordinates);
    activeCoord = ck;
    deps = (s.deps ?? []).map(keyOf);
    lastStepType = s.type;

    if (s.type === "recurse-call" && s.callId !== undefined) {
      const depth = s.parentCallId !== undefined ? (depthOf.get(s.parentCallId) ?? 0) + 1 : 0;
      depthOf.set(s.callId, depth);
      tree.nodes.set(s.callId, {
        coords: s.coordinates,
        parentCallId: s.parentCallId,
        depth,
        dup: Boolean(s.dup),
        callAt: i,
        dupOfCoords: s.dup ? firstSeenCoord.get(raw) ?? undefined : undefined,
      });
      tree.order.push(s.callId);
      if (s.parentCallId !== undefined) {
        const arr = tree.children.get(s.parentCallId) ?? [];
        arr.push(s.callId);
        tree.children.set(s.parentCallId, arr);
      }
    }
    if (
      (s.type === "recurse-return" || s.type === "memo-hit" || s.type === "base-case") &&
      s.value !== undefined
    ) {
      // attach returned value to the most recent open node with same coords
      for (let k = tree.order.length - 1; k >= 0; k--) {
        const id = tree.order[k];
        const n = tree.nodes.get(id)!;
        if (n.coords.join(",") === raw && n.value === undefined) {
          n.value = s.value;
          break;
        }
      }
      if (!cells.has(ck)) cells.set(ck, { value: s.value, writtenAt: i });
      else cells.get(ck)!.value = s.value;
    }
    if (s.type === "table-write") {
      cells.set(ck, { value: s.value, writtenAt: i });
      if (!firstSeenCoord.has(raw)) firstSeenCoord.set(raw, raw);
    }
  }
  return { cells, activeCoord, deps, lastStepType, tree };
}
