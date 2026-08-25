import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Grid Unique Paths II (Striver DP-9): count lattice paths from top-left to
 * bottom-right moving only right/down while AVOIDING obstacle cells.
 * Encoding: grid[i][j] === 1 marks an obstacle, 0 is free (LeetCode style).
 */

const schema = z.object({
  grid: z.array(z.array(z.number().int().min(0).max(1)).min(2).max(7)).min(2).max(7),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  const cells = input.grid.length * input.grid[0].length;
  if (mode === "bruteforce" && cells > 36)
    return "Pure recursion re-explores every path prefix. Keep grids at most 6 x 6 for Brute Force, or switch to Memoization.";
  return null;
}

const AXIS = { rowsTitle: "i (row)", colsTitle: "j (col)" };

function genBrute(input: In): GeneratedTrace {
  const g = input.grid;
  const m = g.length;
  const n = g[0].length;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<string>();

  function f(i: number, j: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i < 0 || j < 0) {
      b.push("base-case", [Math.max(i, 0), Math.max(j, 0)], "Outside the grid → no path contributes here.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    if (g[i][j] === 1) {
      b.push("base-case", [i, j], `Cell (${i},${j}) is an OBSTACLE — zero paths pass through it.`, { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    if (i === 0 && j === 0) {
      b.push("recurse-call", [0, 0], "f(0,0) called — the starting square.", { callId, parentCallId, codeAnchor: "base" });
      b.push("base-case", [0, 0], "Base case: one way to stand at the start.", { callId, parentCallId, value: 1, codeAnchor: "base" });
      return 1;
    }
    const kk = `${i},${j}`;
    const dup = seen.has(kk);
    b.push("recurse-call", [i, j],
      dup ? `f(${i},${j}) called AGAIN — same cell reached via another route; subtree repeats.`
          : `f(${i},${j}) called: paths arriving from above + from the left.`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(kk);
    const up = f(i - 1, j, callId);
    const left = f(i, j - 1, callId);
    const v = up + left;
    b.push("recurse-return", [i, j], `f(${i},${j}) = ${up} + ${left} = ${v}.`, {
      callId,
      parentCallId,
      value: v,
      deps: [[Math.max(i - 1, 0), j], [i, Math.max(j - 1, 0)]],
      codeAnchor: "combine",
    });
    return v;
  }

  const startBlocked = g[0][0] === 1;
  let answer = 0;
  if (startBlocked || g[m - 1][n - 1] === 1) {
    b.push("base-case", [m - 1, n - 1],
      startBlocked
        ? "The STARTING cell is an obstacle — no path can even begin. Answer is 0."
        : "The GOAL cell is an obstacle — no path can ever land there. Answer is 0.",
      { value: 0, codeAnchor: "base" });
  } else {
    answer = f(m - 1, n - 1);
  }
  return {
    steps: b.steps,
    meta: {
      mode: "bruteforce",
      answer,
      answerLabel: "unique paths avoiding obstacles",
      tableShape: null,
      axisLabels: null,
      valueFormat: "int",
      stats: { steps: b.count, calls },
    },
  };
}

function genMemo(input: In): GeneratedTrace {
  const g = input.grid;
  const m = g.length;
  const n = g[0].length;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, j: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i, j], `f(${i},${j}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (g[i][j] === 1) {
      b.push("base-case", [i, j], `Obstacle at (${i},${j}) → 0 paths.`, { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    if (i === 0 && j === 0) {
      b.push("base-case", [0, 0], "Base case: start cell → 1.", { callId, parentCallId, value: 1, codeAnchor: "base" });
      return 1;
    }
    const kk = `${i},${j}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [i, j], `Memo hit! f(${i},${j}) = ${v} fetched instantly.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    const up = i > 0 ? f(i - 1, j, callId) : 0;
    const left = j > 0 ? f(i, j - 1, callId) : 0;
    const v = up + left;
    memo.set(kk, v);
    b.push("recurse-return", [i, j], `f(${i},${j}) = ${up} + ${left} = ${v}, stored in memo.`, {
      callId,
      parentCallId,
      value: v,
      deps: [[Math.max(i - 1, 0), j], [i, Math.max(j - 1, 0)]],
      codeAnchor: "memoStore",
    });
    return v;
  }

  const startBlocked = g[0][0] === 1;
  let answer = 0;
  if (startBlocked || g[m - 1][n - 1] === 1) {
    b.push("base-case", [m - 1, n - 1], startBlocked ? "Start blocked → answer 0 without recursing." : "Goal blocked → answer 0 without recursing.", { value: 0, codeAnchor: "base" });
  } else {
    answer = f(m - 1, n - 1);
  }
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "unique paths avoiding obstacles",
      tableShape: { rows: m, cols: n },
      axisLabels: AXIS,
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const g = input.grid;
  const m = g.length;
  const n = g[0].length;
  const b = new TraceBuilder();

  if (g[0][0] === 1 || g[m - 1][n - 1] === 1) {
    b.push("base-case", [g[0][0] === 1 ? 0 : m - 1, g[0][0] === 1 ? 0 : n - 1],
      g[0][0] === 1 ? "Start cell is an obstacle — every dp entry stays 0." : "Goal cell is an obstacle — every dp entry stays 0.",
      { value: 0, codeAnchor: "base" });
    return {
      steps: b.steps,
      meta: {
        mode: "tabulation",
        answer: 0,
        answerLabel: "unique paths avoiding obstacles",
        tableShape: { rows: m, cols: n },
        axisLabels: AXIS,
        valueFormat: "int",
        stats: { steps: b.count, writes: 0 },
      },
    };
  }

  const dp: number[][] = Array.from({ length: m }, () => new Array(n).fill(-1));
  dp[0][0] = 1;
  b.push("base-case", [0, 0], "dp[0][0] = 1 — one way to be at the start (it is guaranteed free here).", { value: 1, codeAnchor: "base" });

  for (let j = 1; j < n; j++) {
    if (g[0][j] === 1) {
      b.push("table-write", [0, j], `Obstacle at (0,${j}): dp stays 0 and blocks this whole border run.`, { value: 0, deps: [[0, j - 1]], codeAnchor: "obstacle" });
    } else {
      b.push("table-write", [0, j], `dp[0][${j}] = dp[0][${j - 1}] = ${dp[0][j - 1]} (only reachable from the left).`, { value: dp[0][j - 1], deps: [[0, j - 1]], codeAnchor: "transition" });
      dp[0][j] = dp[0][j - 1];
    }
  }
  for (let i = 1; i < m; i++) {
    if (g[i][0] === 1) {
      b.push("table-write", [i, 0], `Obstacle at (${i},0): dp stays 0 and blocks this border column.`, { value: 0, deps: [[i - 1, 0]], codeAnchor: "obstacle" });
    } else {
      b.push("table-write", [i, 0], `dp[${i}][0] = dp[${i - 1}][0] = ${dp[i - 1][0]} (only reachable from above).`, { value: dp[i - 1][0], deps: [[i - 1, 0]], codeAnchor: "transition" });
      dp[i][0] = dp[i - 1][0];
    }
  }

  for (let i = 1; i < m; i++)
    for (let j = 1; j < n; j++) {
      if (g[i][j] === 1) {
        b.push("table-write", [i, j], `Obstacle at (${i},${j}) → dp[${i}][${j}] = 0 forever.`, { value: 0, deps: [[i - 1, j], [i, j - 1]], codeAnchor: "obstacle" });
        continue;
      }
      const up = dp[i - 1][j] < 0 ? 0 : dp[i - 1][j];
      const left = dp[i][j - 1] < 0 ? 0 : dp[i][j - 1];
      const v = up + left;
      b.push("table-write", [i, j], `dp[${i}][${j}] = dp[${i - 1}][${j}] + dp[${i}][${j - 1}] = ${up} + ${left} = ${v}.`, {
        value: v,
        deps: [[i - 1, j], [i, j - 1]],
        codeAnchor: "transition",
      });
      dp[i][j] = v;
    }

  const answer = dp[m - 1][n - 1];
  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "unique paths avoiding obstacles",
      tableShape: { rows: m, cols: n },
      axisLabels: AXIS,
      valueFormat: "int",
      stats: { steps: b.count, writes: m * n },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const g = input.grid;
  const m = g.length;
  const n = g[0].length;
  const b = new TraceBuilder();

  const row: number[] = new Array(n).fill(0);
  if (g[0][0] === 1) {
    b.push("base-case", [0, 0], "Start cell is an obstacle — the rolling row stays all zeros.", { value: 0, codeAnchor: "init" });
    return {
      steps: b.steps,
      meta: {
        mode: "spaceOptimized",
        answer: 0,
        answerLabel: "unique paths avoiding obstacles",
        tableShape: { rows: m, cols: n },
        axisLabels: AXIS,
        valueFormat: "int",
        rollingWindow: true,
        stats: { steps: b.count, writes: 0 },
      },
    };
  }
  row[0] = 1;
  b.push("base-case", [0, 0], "Rolling row starts as [1, 0, 0, ...]: one way to reach the start.", { value: 1, codeAnchor: "init" });

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (i === 0 && j === 0) continue;
      if (g[i][j] === 1) {
        row[j] = 0;
        b.push("table-write", [i, j], `Obstacle: row[${j}] forced to 0 in the rolling array.`, { value: 0, deps: [], codeAnchor: "obstacle" });
      } else {
        const above = row[j];
        const left = j > 0 ? row[j - 1] : 0;
        const v = above + left;
        row[j] = v;
        const deps: number[][] = [];
        if (i > 0) deps.push([i - 1, j]);
        if (j > 0) deps.push([i, j - 1]);
        b.push("table-write", [i, j], `row[${j}] = above (${above}) + left-in-row (${left}) = ${v}. One array reused per row.`, {
          value: v,
          deps,
          codeAnchor: "transition",
        });
      }
    }
  }

  const answer = row[n - 1];
  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer,
      answerLabel: "unique paths avoiding obstacles",
      tableShape: { rows: m, cols: n },
      axisLabels: AXIS,
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: m * n - 1 },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int i, int j, vector<vector<int>>& g) {
    if (g[i][j] == 1) return 0;            // base: obstacle
    if (i == 0 && j == 0) return 1;        // base: start
    int up = i > 0 ? f(i - 1, j, g) : 0;
    int left = j > 0 ? f(i, j - 1, g) : 0; // recurse
    return up + left;                      // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition
// anchor: obstacle`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition", obstacle: "// anchor: obstacle" },
    ),
    java: withAnchors(
`static int f(int i, int j, int[][] g) {
    if (g[i][j] == 1) return 0;             // base: obstacle
    if (i == 0 && j == 0) return 1;         // base: start
    int up = i > 0 ? f(i - 1, j, g) : 0;
    int left = j > 0 ? f(i, j - 1, g) : 0;  // recurse
    return up + left;                       // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition
// anchor: obstacle`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition", obstacle: "// anchor: obstacle" },
    ),
    python: withAnchors(
`def f(i, j, g):
    if g[i][j] == 1:                  # base: obstacle
        return 0
    if i == 0 and j == 0:             # base: start
        return 1
    up = f(i - 1, j, g) if i > 0 else 0
    left = f(i, j - 1, g) if j > 0 else 0   # recurse
    return up + left                  # combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: transition
# anchor: obstacle`,
      { base: "# base", recurse: "# recurse", combine: "# combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", transition: "# anchor: transition", obstacle: "# anchor: obstacle" },
    ),
    js: withAnchors(
`function f(i, j, g) {
  if (g[i][j] === 1) return 0;              // base: obstacle
  if (i === 0 && j === 0) return 1;         // base: start
  const up = i > 0 ? f(i - 1, j, g) : 0;
  const left = j > 0 ? f(i, j - 1, g) : 0;  // recurse
  return up + left;                         // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition
// anchor: obstacle`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition", obstacle: "// anchor: obstacle" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int i, int j, vector<vector<int>>& g, vector<vector<int>>& memo) {
    if (g[i][j] == 1) return 0;                 // base: obstacle
    if (i == 0 && j == 0) return 1;             // base: start
    if (memo[i][j] != -1) return memo[i][j];    // memo check
    int up = i > 0 ? f(i - 1, j, g, memo) : 0;  // recurse
    int left = j > 0 ? f(i, j - 1, g, memo) : 0;
    return memo[i][j] = up + left;              // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore
// anchor: obstacle`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition", obstacle: "// anchor: obstacle" },
    ),
    java: withAnchors(
`static int f(int i, int j, int[][] g, int[][] memo) {
    if (g[i][j] == 1) return 0;                 // base: obstacle
    if (i == 0 && j == 0) return 1;             // base: start
    if (memo[i][j] != -1) return memo[i][j];    // memo check
    int up = i > 0 ? f(i - 1, j, g, memo) : 0;  // recurse
    int left = j > 0 ? f(i, j - 1, g, memo) : 0;
    return memo[i][j] = up + left;              // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore
// anchor: obstacle`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition", obstacle: "// anchor: obstacle" },
    ),
    python: withAnchors(
`def f(i, j, g, memo):
    if g[i][j] == 1:                       # base: obstacle
        return 0
    if i == 0 and j == 0:                  # base: start
        return 1
    if memo[i][j] != -1:                   # memo check
        return memo[i][j]
    up = f(i - 1, j, g, memo) if i > 0 else 0   # recurse
    left = f(i, j - 1, g, memo) if j > 0 else 0
    memo[i][j] = up + left
    return memo[i][j]                      # memo store
# anchor: combine
# anchor: init
# anchor: transition
# memoCheck
# memoStore
# anchor: obstacle`,
      { base: "# base", recurse: "# recurse", memoCheck: "# memoCheck", memoStore: "# memoStore", combine: "# anchor: combine", init: "# anchor: init", transition: "# anchor: transition", obstacle: "# anchor: obstacle" },
    ),
    js: withAnchors(
`function f(i, j, g, memo) {
  if (g[i][j] === 1) return 0;                 // base: obstacle
  if (i === 0 && j === 0) return 1;            // base: start
  if (memo[i][j] !== -1) return memo[i][j];    // memo check
  const up = i > 0 ? f(i - 1, j, g, memo) : 0; // recurse
  const left = j > 0 ? f(i, j - 1, g, memo) : 0;
  memo[i][j] = up + left;
  return memo[i][j];                           // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore
// anchor: obstacle`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition", obstacle: "// anchor: obstacle" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int uniquePathsWithObstacles(vector<vector<int>>& g) {
    int m = g.size(), n = g[0].size();
    if (g[0][0] == 1 || g[m-1][n-1] == 1) return 0;   // blocked endpoints
    vector<vector<int>> dp(m, vector<int>(n, 0));
    dp[0][0] = 1;                                     // base
    for (int i = 0; i < m; ++i)
        for (int j = 0; j < n; ++j) {
            if (g[i][j] == 1) dp[i][j] = 0;           // obstacle
            else if (i + j > 0) {
                if (i > 0) dp[i][j] += dp[i - 1][j];
                if (j > 0) dp[i][j] += dp[i][j - 1];  // transition
            }
        }
    return dp[m - 1][n - 1];
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", obstacle: "// obstacle", transition: "// transition", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int uniquePathsWithObstacles(int[][] g) {
    int m = g.length, n = g[0].length;
    if (g[0][0] == 1 || g[m - 1][n - 1] == 1) return 0;
    int[][] dp = new int[m][n];
    dp[0][0] = 1;                                     // base
    for (int i = 0; i < m; ++i)
        for (int j = 0; j < n; ++j) {
            if (g[i][j] == 1) dp[i][j] = 0;           // obstacle
            else if (i + j > 0) {
                if (i > 0) dp[i][j] += dp[i - 1][j];
                if (j > 0) dp[i][j] += dp[i][j - 1];  // transition
            }
        }
    return dp[m - 1][n - 1];
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", obstacle: "// obstacle", transition: "// transition", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def unique_paths_with_obstacles(g):
    m, n = len(g), len(g[0])
    if g[0][0] == 1 or g[m - 1][n - 1] == 1:
        return 0
    dp = [[0] * n for _ in range(m)]
    dp[0][0] = 1                                  # base
    for i in range(m):
        for j in range(n):
            if g[i][j] == 1:                      # obstacle
                dp[i][j] = 0
            elif i + j > 0:
                if i > 0:
                    dp[i][j] += dp[i - 1][j]
                if j > 0:
                    dp[i][j] += dp[i][j - 1]      # transition
    return dp[m - 1][n - 1]
# anchor: combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", obstacle: "# obstacle", transition: "# transition", combine: "# anchor: combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function uniquePathsWithObstacles(g) {
  const m = g.length, n = g[0].length;
  if (g[0][0] === 1 || g[m - 1][n - 1] === 1) return 0;
  const dp = Array.from({ length: m }, () => new Array(n).fill(0));
  dp[0][0] = 1;                                          // base
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++) {
      if (g[i][j] === 1) dp[i][j] = 0;                   // obstacle
      else if (i + j > 0) {
        if (i > 0) dp[i][j] += dp[i - 1][j];
        if (j > 0) dp[i][j] += dp[i][j - 1];             // transition
      }
    }
  return dp[m - 1][n - 1];
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", obstacle: "// obstacle", transition: "// transition", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
  spaceOptimized: {
    cpp: withAnchors(
`int uniquePathsWithObstacles(vector<vector<int>>& g) {
    int m = g.size(), n = g[0].size();
    vector<int> row(n, 0);
    row[0] = g[0][0] == 1 ? 0 : 1;                    // init
    for (int i = 0; i < m; ++i)
        for (int j = 0; j < n; ++j) {
            if (g[i][j] == 1) row[j] = 0;             // obstacle
            else if (j > 0) row[j] += row[j - 1];     // transition
        }
    return row[n - 1];
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", obstacle: "// obstacle", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int uniquePathsWithObstacles(int[][] g) {
    int m = g.length, n = g[0].length;
    int[] row = new int[n];
    row[0] = g[0][0] == 1 ? 0 : 1;                    // init
    for (int i = 0; i < m; ++i)
        for (int j = 0; j < n; ++j) {
            if (g[i][j] == 1) row[j] = 0;             // obstacle
            else if (j > 0) row[j] += row[j - 1];     // transition
        }
    return row[n - 1];
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", obstacle: "// obstacle", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def unique_paths_with_obstacles(g):
    m, n = len(g), len(g[0])
    row = [0] * n
    row[0] = 0 if g[0][0] == 1 else 1             # init
    for i in range(m):
        for j in range(n):
            if g[i][j] == 1:                      # obstacle
                row[j] = 0
            elif j > 0:
                row[j] += row[j - 1]              # transition
    return row[n - 1]
# anchor: base
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { init: "# init", obstacle: "# obstacle", transition: "# transition", base: "# anchor: base", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function uniquePathsWithObstacles(g) {
  const m = g.length, n = g[0].length;
  const row = new Array(n).fill(0);
  row[0] = g[0][0] === 1 ? 0 : 1;                 // init
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++) {
      if (g[i][j] === 1) row[j] = 0;              // obstacle
      else if (j > 0) row[j] += row[j - 1];       // transition
    }
  return row[n - 1];
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", obstacle: "// obstacle", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
};

export const gridUniquePathsII: ProblemServiceDef = {
  slug: "grid-unique-paths-ii",
  patternSlug: "dp-grids",
  inputDescriptor: [
    { key: "grid", label: "GRID (1 = OBSTACLE)", kind: "grid", min: 2, max: 7, valueRange: [0, 1] },
  ],
  schema,
  defaultInput: {
    grid: [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ],
  },
  randomInput: () => ({
    grid: Array.from({ length: 2 + Math.floor(Math.random() * 4) }, (_, r) =>
      Array.from({ length: 2 + Math.floor(Math.random() * 4) }, () => (r === 0 ? 0 : Math.random() < 0.25 ? 1 : 0)),
    ).map((rw) => rw.map((v, ci) => (ci === 0 ? 0 : v))),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input) : mode === "memo" ? genMemo(input) : mode === "tabulation" ? genTab(input) : genSpace(input),
  codes,
};
