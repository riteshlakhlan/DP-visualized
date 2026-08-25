import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Max Rectangle Area with all 1's (Striver DP-55): histogram per row.
 * Table cell [i][j] shows column j's consecutive-1s height after row i;
 * per-row largest rectangle is narrated from an O(m^2) sweep.
 */

const schema = z.object({
  grid: z.array(z.array(z.number().int().min(0).max(1)).min(2).max(6)).min(2).max(6),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  const cells = input.grid.length * input.grid[0].length;
  if (mode === "bruteforce" && cells > 25)
    return "Brute force checks every candidate rectangle. Keep grids at most 5 x 5.";
  if (mode === "memo")
    return "The row-by-row histogram sweep has no overlapping-subproblem recursion. Use Brute Force or Tabulation.";
  return null;
}

const axisFor = (r: number, c: number) => ({
  rowsTitle: "grid row", colsTitle: "column",
  rowLabels: Array.from({ length: r }, (_, i) => `r${i}`),
  colLabels: Array.from({ length: c }, (_, j) => `c${j}`),
});

function histBest(h: number[]): number {
  let area = 0;
  for (let i = 0; i < h.length; i++) {
    let mn = h[i];
    for (let j = i; j < h.length && h[j] > 0; j++) {
      mn = Math.min(mn, h[j]);
      area = Math.max(area, mn * (j - i + 1));
    }
  }
  return area;
}

function genBrute(input: In): GeneratedTrace {
  const g = input.grid;
  const rows = g.length, cols = g[0].length;
  const b = new TraceBuilder();
  let answer = 0;
  b.push("base-case", [0, 0], `Checking every rectangle in ${rows}×${cols}.`, { codeAnchor: "driver" });
  for (let r1 = 0; r1 < rows; r1++)
    for (let c1 = 0; c1 < cols; c1++)
      for (let r2 = r1; r2 < rows; r2++)
        for (let c2 = c1; c2 < cols; c2++) {
          let ok = true;
          outer: for (let i = r1; i <= r2; i++)
            for (let j = c1; j <= c2; j++)
              if (g[i][j] === 0) { ok = false; break outer; }
          if (!ok) continue;
          const area = (r2 - r1 + 1) * (c2 - c1 + 1);
          if (area > answer) {
            answer = area;
            b.push("table-write", [r2, c2], `New best area ${area} (rows ${r1}..${r2}, cols ${c1}..${c2}).`, { value: area, codeAnchor: "transition" });
          }
        }
  b.push("table-read", [rows - 1, cols - 1], `Largest rectangle = ${answer}.`, { value: answer, codeAnchor: "driver" });
  return {
    steps: b.steps,
    meta: { mode: "bruteforce", answer, answerLabel: "max rectangle area", tableShape: { rows, cols }, axisLabels: axisFor(rows, cols), valueFormat: "int", stats: { steps: b.count } },
  };
}

function genTab(input: In): GeneratedTrace {
  const g = input.grid;
  const rows = g.length, cols = g[0].length;
  const b = new TraceBuilder();
  const h: number[] = new Array(cols).fill(0);
  let answer = 0;

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) h[j] = g[i][j] === 1 ? h[j] + 1 : 0;
    for (let j = 0; j < cols; j++)
      b.push("table-write", [i, j], j === 0
        ? `Row ${i}: heights = [${h.join(", ")}].`
        : `heights[${j}] = ${h[j]}.`,
        { value: h[j], deps: i > 0 ? [[i - 1, j]] : [], codeAnchor: "transition" });
    const area = histBest(h);
    b.push("table-read", [i, cols - 1],
      `Row ${i}: largest rectangle in histogram = ${area}${area > answer ? " (new best)" : ""}.`,
      { value: area, codeAnchor: "histogram" });
    answer = Math.max(answer, area);
  }
  b.push("table-read", [rows - 1, 0], `Answer = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation", answer, answerLabel: "max rectangle area",
      tableShape: { rows, cols }, axisLabels: axisFor(rows, cols), valueFormat: "int",
      stats: { steps: b.count, writes: rows * cols + 2 * rows },
    },
  };
}

export const maxSquareWithOnes: ProblemServiceDef = {
  slug: "max-square-with-ones",
  patternSlug: "dp-squares",
  inputDescriptor: [
    { key: "grid", label: "GRID (1=filled)", kind: "grid", min: 2, max: 6, valueRange: [0, 1] },
  ],
  schema,
  defaultInput: {
    grid: [[1, 0, 1, 0, 0], [1, 0, 1, 1, 1], [1, 1, 1, 1, 1], [1, 0, 0, 1, 0]],
  }, // LC85 → 6
  randomInput: () => ({
    grid: Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () =>
      Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => (Math.random() < 0.65 ? 1 : 0))),
  }),
  limitsPerMode: {
    bruteforce: limits, memo: limits, tabulation: () => null,
    spaceOptimized: () => "Heights[] IS the rolling row — tabulation already achieves O(cols) space.",
  },
  buildTrace: (input, mode) => (mode === "bruteforce" ? genBrute(input as In) : genTab(input as In)),
  codes: {
    bruteforce: {
      cpp: withAnchors(`int maximalRectangle(vector<vector<int>>& g) {\n    int R = g.size(), C = g[0].size(), best = 0;\n    // driver: try every rectangle, verify all-1s\n    for (int r1 = 0; r1 < R; ++r1)\n        for (int c1 = 0; c1 < C; ++c1)\n            for (int r2 = r1; r2 < R; ++r2)\n                for (int c2 = c1; c2 < C; ++c2) {\n                    bool ok = true;\n                    for (int i = r1; i <= r2 && ok; ++i)\n                        for (int j = c1; j <= c2 && ok; ++j)\n                            if (!g[i][j]) ok = false;\n                    if (ok) best = max(best, (r2-r1+1)*(c2-c1+1));\n                }\n    return best;\n}`, { driver: "driver", base: "bool ok = true;" }),
      java: withAnchors(`static int maximalRectangle(int[][] g) {\n    int R = g.length, C = g[0].length, best = 0;\n    for (int r1 = 0; r1 < R; ++r1)\n        for (int c1 = 0; c1 < C; ++c1)\n            for (int r2 = r1; r2 < R; ++r2)\n                for (int c2 = c1; c2 < C; ++c2) {\n                    boolean ok = true;\n                    for (int i = r1; i <= r2 && ok; ++i)\n                        for (int j = c1; j <= c2 && ok; ++j)\n                            if (g[i][j] == 0) ok = false;\n                    if (ok) best = Math.max(best, (r2-r1+1)*(c2-c1+1));\n                }\n    return best;\n}`, { driver: "best = 0" }),
      python: withAnchors(`def maximal_rectangle(g):\n    R, C = len(g), len(g[0])\n    best = 0\n    for r1 in range(R):\n        for c1 in range(C):\n            for r2 in range(r1, R):\n                for c2 in range(c1, C):\n                    if all(g[i][j] for i in range(r1, r2+1)\n                           for j in range(c1, c2+1)):\n                        best = max(best, (r2-r1+1)*(c2-c1+1))\n    return best`, {}),
      js: withAnchors(`function maximalRectangle(g) {\n  const R = g.length, C = g[0].length;\n  let best = 0;\n  for (let r1 = 0; r1 < R; r1++)\n    for (let c1 = 0; c1 < C; c1++)\n      for (let r2 = r1; r2 < R; r2++)\n        for (let c2 = c1; c2 < C; c2++) {\n          let ok = true;\n          for (let i = r1; i <= r2 && ok; i++)\n            for (let j = c1; j <= c2 && ok; j++)\n              if (!g[i][j]) ok = false;\n          if (ok) best = Math.max(best, (r2-r1+1)*(c2-c1+1));\n        }\n  return best;\n}`, {}),
    },
    tabulation: {
      cpp: withAnchors(`int maximalRectangle(vector<vector<int>>& g) {\n    int R = g.size(), C = g[0].size();\n    vector<int> h(C, 0);                       // init\n    int best = 0;\n    for (int i = 0; i < R; ++i) {\n        for (int j = 0; j < C; ++j)\n            h[j] = g[i][j] ? h[j] + 1 : 0;     // transition\n        // histogram: largest rectangle in h     // histogram\n        for (int a = 0; a < C; ++a) {\n            int mn = INT_MAX;\n            for (int b = a; b < C; ++b) {\n                if (h[b] == 0) break;\n                mn = min(mn, h[b]);\n                best = max(best, mn * (b - a + 1));\n            }\n        }\n    }\n    return best;                               // driver\n}`, { init: "init", transition: "transition", histogram: "histogram", driver: "driver" }),
      java: withAnchors(`static int maximalRectangle(int[][] g) {\n    int R = g.length, C = g[0].length;\n    int[] h = new int[C];                      // init\n    int best = 0;\n    for (int i = 0; i < R; ++i) {\n        for (int j = 0; j < C; ++j)\n            h[j] = g[i][j] == 1 ? h[j] + 1 : 0;   // transition\n        for (int a = 0; a < C; ++a) {              // histogram\n            int mn = Integer.MAX_VALUE;\n            for (int b = a; b < C && h[b] > 0; ++b) {\n                mn = Math.min(mn, h[b]);\n                best = Math.max(best, mn * (b - a + 1));\n            }\n        }\n    }\n    return best;                               // driver\n}`, { init: "init", transition: "transition", histogram: "histogram", driver: "driver" }),
      python: withAnchors(`def maximal_rectangle(g):\n    R, C = len(g), len(g[0])\n    h = [0] * C                     # init\n    best = 0\n    for i in range(R):\n        for j in range(C):\n            h[j] = h[j] + 1 if g[i][j] else 0   # transition\n        for a in range(C):              # histogram\n            mn = float("inf")\n            for b in range(a, C):\n                if h[b] == 0: break\n                mn = min(mn, h[b])\n                best = max(best, mn * (b - a + 1))\n    return best                     # driver`, { init: "init", transition: "transition", histogram: "histogram", driver: "driver" }),
      js: withAnchors(`function maximalRectangle(g) {\n  const R = g.length, C = g[0].length;\n  const h = new Array(C).fill(0);    // init\n  let best = 0;\n  for (let i = 0; i < R; i++) {\n    for (let j = 0; j < C; j++)\n      h[j] = g[i][j] ? h[j] + 1 : 0;  // transition\n    for (let a = 0; a < C; a++) {     // histogram\n      let mn = Infinity;\n      for (let b = a; b < C && h[b] > 0; b++) {\n        mn = Math.min(mn, h[b]);\n        best = Math.max(best, mn * (b - a + 1));\n      }\n    }\n  }\n  return best;                       // driver\n}`, { init: "init", transition: "transition", histogram: "histogram", driver: "driver" }),
    },
  },
};
