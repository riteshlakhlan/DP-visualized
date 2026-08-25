import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Minimum Path Sum: move right/down across a grid of costs; minimize total. */

const schema = z.object({
  grid: z.array(z.array(z.number().int().min(0).max(99)).min(1).max(8)).min(1).max(8),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  const cells = input.grid.length * input.grid[0].length;
  if (mode === "bruteforce" && input.grid.length > 5)
    return "Pure recursion re-explores overlapping cells exponentially. Keep the grid <= 5x5 for Brute Force.";
  void cells;
  return null;
}

const val = (g: number[][], i: number, j: number) => g[i][j];

function genBrute(input: In): GeneratedTrace {
  const g = input.grid;
  const m = g.length, n = g[0].length;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<string>();
  const kk = (i: number, j: number) => `${i},${j}`;

  function f(i: number, j: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i === 0 && j === 0) {
      b.push("recurse-call", [0, 0], `f(0,0) called — the start cell (cost ${val(g, 0, 0)}).`, { callId, parentCallId, codeAnchor: "base" });
      b.push("base-case", [0, 0], "Base case: start cell → its own cost.", { callId, parentCallId, value: val(g, 0, 0) });
      return val(g, 0, 0);
    }
    const dup = seen.has(kk(i, j));
    b.push("recurse-call", [i, j],
      dup ? `f(${i},${j}) called AGAIN — cell already solved elsewhere; subtree repeats.`
          : `f(${i},${j}) called: cost ${val(g, i, j)} + cheapest way into this cell.`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(kk(i, j));
    let best = Infinity;
    const deps: number[][] = [];
    if (i > 0) { best = Math.min(best, f(i - 1, j, callId)); deps.push([i - 1, j]); }
    if (j > 0) { best = Math.min(best, f(i, j - 1, callId)); deps.push([i, j - 1]); }
    const v = val(g, i, j) + best;
    b.push("recurse-return", [i, j], `f(${i},${j}) = ${val(g, i, j)} + min(incoming) = ${val(g, i, j)} + ${best} = ${v}.`, {
      callId,
      parentCallId,
      value: v,
      deps,
      codeAnchor: "combine",
    });
    return v;
  }

  const answer = f(m - 1, n - 1);
  return {
    steps: b.steps,
    meta: {
      mode: "bruteforce",
      answer,
      answerLabel: "minimum path sum",
      tableShape: null,
      axisLabels: null,
      valueFormat: "int",
      stats: { steps: b.count, calls },
    },
  };
}

function genMemo(input: In): GeneratedTrace {
  const g = input.grid;
  const m = g.length, n = g[0].length;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, j: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i, j], `f(${i},${j}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (i === 0 && j === 0) {
      b.push("base-case", [0, 0], "Base case: f(0,0) = grid[0][0].", { callId, parentCallId, value: val(g, 0, 0), codeAnchor: "base" });
      return val(g, 0, 0);
    }
    const kk = `${i},${j}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [i, j], `Memo hit! f(${i},${j}) = ${v}.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    let best = Infinity;
    const deps: number[][] = [];
    if (i > 0) { best = Math.min(best, f(i - 1, j, callId)); deps.push([i - 1, j]); }
    if (j > 0) { best = Math.min(best, f(i, j - 1, callId)); deps.push([i, j - 1]); }
    const v = val(g, i, j) + best;
    memo.set(kk, v);
    b.push("recurse-return", [i, j], `f(${i},${j}) = ${val(g, i, j)} + ${best} = ${v}, stored in memo.`, {
      callId, parentCallId, value: v, deps, codeAnchor: "memoStore",
    });
    return v;
  }

  const answer = f(m - 1, n - 1);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "minimum path sum",
      tableShape: { rows: m, cols: n },
      axisLabels: { rowsTitle: "i (row)", colsTitle: "j (col)" },
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function fillTab(input: In, b: TraceBuilder) {
  const g = input.grid;
  const m = g.length, n = g[0].length;
  const dp: number[][] = Array.from({ length: m }, () => new Array(n).fill(-1));
  dp[0][0] = val(g, 0, 0);
  b.push("base-case", [0, 0], `dp[0][0] = grid[0][0] = ${dp[0][0]}.`, { value: dp[0][0], codeAnchor: "base" });
  for (let j = 1; j < n; j++) {
    dp[0][j] = dp[0][j - 1] + val(g, 0, j);
    b.push("table-write", [0, j], `First row: dp[0][${j}] = dp[0][${j - 1}] + grid[0][${j}] = ${dp[0][j]}.`, {
      value: dp[0][j], deps: [[0, j - 1]], codeAnchor: "transition",
    });
  }
  for (let i = 1; i < m; i++) {
    dp[i][0] = dp[i - 1][0] + val(g, i, 0);
    b.push("table-write", [i, 0], `First column: dp[${i}][0] = dp[${i - 1}][0] + grid[${i}][0] = ${dp[i][0]}.`, {
      value: dp[i][0], deps: [[i - 1, 0]], codeAnchor: "transition",
    });
  }
  for (let i = 1; i < m; i++)
    for (let j = 1; j < n; j++) {
      const up = dp[i - 1][j], left = dp[i][j - 1];
      const from = up <= left ? "above" : "left";
      dp[i][j] = val(g, i, j) + Math.min(up, left);
      b.push("table-write", [i, j],
        `dp[${i}][${j}] = grid (${val(g, i, j)}) + min(above ${up}, left ${left}) → take ${from} = ${dp[i][j]}.`,
        { value: dp[i][j], deps: [[i - 1, j], [i, j - 1]], codeAnchor: "transition" });
    }
  return dp;
}

function genTab(input: In): GeneratedTrace {
  const b = new TraceBuilder();
  const dp = fillTab(input, b);
  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer: dp[input.grid.length - 1][input.grid[0].length - 1],
      answerLabel: "minimum path sum",
      tableShape: { rows: input.grid.length, cols: input.grid[0].length },
      axisLabels: { rowsTitle: "i (row)", colsTitle: "j (col)" },
      valueFormat: "int",
      stats: { steps: b.count, writes: input.grid.length * input.grid[0].length },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const g = input.grid;
  const m = g.length, n = g[0].length;
  const b = new TraceBuilder();
  let row = new Array(n).fill(0);
  row[0] = val(g, 0, 0);
  b.push("base-case", [0, 0], `row[0] = ${row[0]} — one array is reused for every row of the grid.`, { value: row[0], codeAnchor: "init" });
  for (let j = 1; j < n; j++) {
    row[j] = row[j - 1] + val(g, 0, j);
    b.push("table-write", [0, j], `Row 0 prefix: row[${j}] = ${row[j]}.`, { value: row[j], deps: [[0, j - 1]], codeAnchor: "transition" });
  }
  for (let i = 1; i < m; i++) {
    row[0] += val(g, i, 0);
    for (let j = 1; j < n; j++) {
      const v = val(g, i, j) + Math.min(row[j], row[j - 1]);
      b.push("table-write", [i, j],
        `Row ${i}: row[${j}] = grid (${val(g, i, j)}) + min(above ${row[j]}, left ${row[j - 1]}) = ${v}. Previous row is overwritten in place.`,
        { value: v, deps: [[i - 1, j], [i, j - 1]], codeAnchor: "transition" });
      row[j] = v;
    }
  }
  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer: row[n - 1],
      answerLabel: "minimum path sum",
      tableShape: { rows: m, cols: n },
      axisLabels: { rowsTitle: "i (row)", colsTitle: "j (col)" },
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: m * n },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int i, int j, vector<vector<int>>& g) {
    if (i == 0 && j == 0) return g[0][0];   // base
    int best = INT_MAX;
    if (i > 0) best = min(best, f(i - 1, j, g));
    if (j > 0) best = min(best, f(i, j - 1, g));   // recurse
    return g[i][j] + best;                  // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int i, int j, int[][] g) {
    if (i == 0 && j == 0) return g[0][0];   // base
    int best = Integer.MAX_VALUE;
    if (i > 0) best = Math.min(best, f(i - 1, j, g));
    if (j > 0) best = Math.min(best, f(i, j - 1, g));   // recurse
    return g[i][j] + best;                  // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(i, j, g):
    if i == 0 and j == 0:        # base
        return g[0][0]
    best = math.inf
    if i > 0:
        best = min(best, f(i - 1, j, g))   # recurse
    if j > 0:
        best = min(best, f(i, j - 1, g))
    return g[i][j] + best       # combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: transition`,
      { base: "# base", recurse: "# recurse", combine: "# combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(i, j, g) {
  if (i === 0 && j === 0) return g[0][0];   // base
  let best = Infinity;
  if (i > 0) best = Math.min(best, f(i - 1, j, g));
  if (j > 0) best = Math.min(best, f(i, j - 1, g));   // recurse
  return g[i][j] + best;                    // combine
}
// anchor: memoCheck
// anchor: memoStore
// anchor: transition
// anchor: init`,
      { base: "// base", recurse: "// recurse", combine: "// combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition", init: "// anchor: init" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int i, int j, vector<vector<int>>& g, vector<vector<int>>& memo) {
    if (i == 0 && j == 0) return g[0][0];         // base
    if (memo[i][j] != -1) return memo[i][j];      // memo check
    int best = INT_MAX;
    if (i > 0) best = min(best, f(i - 1, j, g, memo));
    if (j > 0) best = min(best, f(i, j - 1, g, memo));
    return memo[i][j] = g[i][j] + best;           // memo store
}
// anchor: combine
// anchor: init
// anchor: recurse
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", recurse: "// anchor: recurse", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int i, int j, int[][] g, int[][] memo) {
    if (i == 0 && j == 0) return g[0][0];         // base
    if (memo[i][j] != -1) return memo[i][j];      // memo check
    int best = Integer.MAX_VALUE;
    if (i > 0) best = Math.min(best, f(i - 1, j, g, memo));
    if (j > 0) best = Math.min(best, f(i, j - 1, g, memo));
    return memo[i][j] = g[i][j] + best;           // memo store
}
// anchor: combine
// anchor: init
// anchor: recurse
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", recurse: "// anchor: recurse", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(i, j, g, memo):
    if i == 0 and j == 0:            # base
        return g[0][0]
    if memo[i][j] != -1:             # memo check
        return memo[i][j]
    best = math.inf
    if i > 0:
        best = min(best, f(i - 1, j, g, memo))
    if j > 0:
        best = min(best, f(i, j - 1, g, memo))
    memo[i][j] = g[i][j] + best
    return memo[i][j]                # memo store
# anchor: combine
# anchor: init
# anchor: recurse
# anchor: transition
# memoCheck
# memoStore`,
      { base: "# base", memoCheck: "# memoCheck", memoStore: "# memoStore", combine: "# anchor: combine", init: "# anchor: init", recurse: "# anchor: recurse", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(i, j, g, memo) {
  if (i === 0 && j === 0) return g[0][0];        // base
  if (memo[i][j] !== -1) return memo[i][j];      // memo check
  let best = Infinity;
  if (i > 0) best = Math.min(best, f(i - 1, j, g, memo));
  if (j > 0) best = Math.min(best, f(i, j - 1, g, memo));
  memo[i][j] = g[i][j] + best;
  return memo[i][j];                             // memo store
}
// anchor: combine
// anchor: recurse
// anchor: transition
// memoCheck
// memoStore
// anchor: init`,
      { base: "// base", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", recurse: "// anchor: recurse", transition: "// anchor: transition", init: "// anchor: init" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int minPathSum(vector<vector<int>>& g) {
    int m = g.size(), n = g[0].size();
    vector<vector<int>> dp(m, vector<int>(n));
    dp[0][0] = g[0][0];                                        // base
    for (int j = 1; j < n; ++j) dp[0][j] = dp[0][j - 1] + g[0][j];
    for (int i = 1; i < m; ++i) dp[i][0] = dp[i - 1][0] + g[i][0];
    for (int i = 1; i < m; ++i)
        for (int j = 1; j < n; ++j)
            dp[i][j] = g[i][j] + min(dp[i - 1][j], dp[i][j - 1]);   // transition
    return dp[m - 1][n - 1];
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int minPathSum(int[][] g) {
    int m = g.length, n = g[0].length;
    int[][] dp = new int[m][n];
    dp[0][0] = g[0][0];                                        // base
    for (int j = 1; j < n; ++j) dp[0][j] = dp[0][j - 1] + g[0][j];
    for (int i = 1; i < m; ++i) dp[i][0] = dp[i - 1][0] + g[i][0];
    for (int i = 1; i < m; ++i)
        for (int j = 1; j < n; ++j)
            dp[i][j] = g[i][j] + Math.min(dp[i - 1][j], dp[i][j - 1]);   // transition
    return dp[m - 1][n - 1];
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def min_path_sum(g):
    m, n = len(g), len(g[0])
    dp = [[0] * n for _ in range(m)]
    dp[0][0] = g[0][0]                                     # base
    for j in range(1, n):
        dp[0][j] = dp[0][j - 1] + g[0][j]
    for i in range(1, m):
        dp[i][0] = dp[i - 1][0] + g[i][0]
    for i in range(1, m):
        for j in range(1, n):
            dp[i][j] = g[i][j] + min(dp[i - 1][j], dp[i][j - 1])   # transition
    return dp[m - 1][n - 1]
# anchor: combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", transition: "# transition", combine: "# anchor: combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function minPathSum(g) {
  const m = g.length, n = g[0].length;
  const dp = Array.from({ length: m }, () => new Array(n).fill(0));
  dp[0][0] = g[0][0];                                            // base
  for (let j = 1; j < n; j++) dp[0][j] = dp[0][j - 1] + g[0][j];
  for (let i = 1; i < m; i++) dp[i][0] = dp[i - 1][0] + g[i][0];
  for (let i = 1; i < m; i++)
    for (let j = 1; j < n; j++)
      dp[i][j] = g[i][j] + Math.min(dp[i - 1][j], dp[i][j - 1]);   // transition
  return dp[m - 1][n - 1];
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
  spaceOptimized: {
    cpp: withAnchors(
`int minPathSum(vector<vector<int>>& g) {
    int m = g.size(), n = g[0].size();
    vector<int> row(n);
    row[0] = g[0][0];                          // init
    for (int j = 1; j < n; ++j) row[j] = row[j - 1] + g[0][j];
    for (int i = 1; i < m; ++i) {
        row[0] += g[i][0];
        for (int j = 1; j < n; ++j)
            row[j] = g[i][j] + min(row[j], row[j - 1]);   // transition
    }
    return row[n - 1];
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int minPathSum(int[][] g) {
    int m = g.length, n = g[0].length;
    int[] row = new int[n];
    row[0] = g[0][0];                          // init
    for (int j = 1; j < n; ++j) row[j] = row[j - 1] + g[0][j];
    for (int i = 1; i < m; ++i) {
        row[0] += g[i][0];
        for (int j = 1; j < n; ++j)
            row[j] = g[i][j] + Math.min(row[j], row[j - 1]);   // transition
    }
    return row[n - 1];
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def min_path_sum(g):
    m, n = len(g), len(g[0])
    row = [0] * n
    row[0] = g[0][0]                            # init
    for j in range(1, n):
        row[j] = row[j - 1] + g[0][j]
    for i in range(1, m):
        row[0] += g[i][0]
        for j in range(1, n):
            row[j] = g[i][j] + min(row[j], row[j - 1])   # transition
    return row[n - 1]
# anchor: base
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { init: "# init", transition: "# transition", base: "# anchor: base", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function minPathSum(g) {
  const m = g.length, n = g[0].length;
  const row = new Array(n).fill(0);
  row[0] = g[0][0];                                // init
  for (let j = 1; j < n; j++) row[j] = row[j - 1] + g[0][j];
  for (let i = 1; i < m; i++) {
    row[0] += g[i][0];
    for (let j = 1; j < n; j++)
      row[j] = g[i][j] + Math.min(row[j], row[j - 1]);   // transition
  }
  return row[n - 1];
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
};

export const minimumPathSum: ProblemServiceDef = {
  slug: "minimum-path-sum",
  patternSlug: "dp-grids",
  inputDescriptor: [
    { key: "grid", label: "GRID COSTS", kind: "grid", min: 2, max: 6, valueRange: [1, 9] },
  ],
  schema,
  defaultInput: {
    grid: [
      [1, 3, 1],
      [1, 5, 1],
      [4, 2, 1],
    ],
  },
  randomInput: () => ({
    grid: Array.from({ length: 2 + Math.floor(Math.random() * 4) }, () =>
      Array.from({ length: 2 + Math.floor(Math.random() * 4) }, () => 1 + Math.floor(Math.random() * 9)),
    ),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input) : mode === "memo" ? genMemo(input) : mode === "tabulation" ? genTab(input) : genSpace(input),
  codes,
};
