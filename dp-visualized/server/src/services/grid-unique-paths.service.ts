import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Grid Unique Paths (Striver DP-8): count monotone lattice paths from the
 * top-left to the bottom-right of an m x n grid moving only right/down.
 */

const schema = z.object({
  m: z.number().int().min(1).max(10),
  n: z.number().int().min(1).max(10),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && input.m * input.n > 20)
    return "Pure recursion revisits cells exponentially. Keep m*n <= 20 for Brute Force, or switch to Memoization.";
  return null;
}

function genBrute(input: In): GeneratedTrace {
  const { m, n } = input;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<string>();
  const kk = (i: number, j: number) => `${i},${j}`;

  function f(i: number, j: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i === 0 || j === 0) {
      b.push("recurse-call", [i, j], `f(${i},${j}) called — first row/column: exactly one path leads here.`, {
        callId,
        parentCallId,
        codeAnchor: "base",
      });
      b.push("base-case", [i, j], "Base case: border cell → 1 path.", { callId, parentCallId, value: 1 });
      return 1;
    }
    const dup = seen.has(kk(i, j));
    b.push("recurse-call", [i, j],
      dup ? `f(${i},${j}) called AGAIN — same cell reached via a different route; subtree repeats.`
          : `f(${i},${j}) called: paths arriving from above + paths arriving from the left.`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(kk(i, j));
    const up = f(i - 1, j, callId);
    const left = f(i, j - 1, callId);
    const v = up + left;
    b.push("recurse-return", [i, j], `f(${i},${j}) = ${up} + ${left} = ${v}.`, {
      callId,
      parentCallId,
      value: v,
      deps: [[i - 1, j], [i, j - 1]],
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
      answerLabel: "unique paths",
      tableShape: null,
      axisLabels: null,
      valueFormat: "int",
      stats: { steps: b.count, calls },
    },
  };
}

function genMemo(input: In): GeneratedTrace {
  const { m, n } = input;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, j: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i, j], `f(${i},${j}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (i === 0 || j === 0) {
      b.push("base-case", [i, j], "Base case: border cell → 1.", { callId, parentCallId, value: 1, codeAnchor: "base" });
      return 1;
    }
    const kk = `${i},${j}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [i, j], `Memo hit! f(${i},${j}) = ${v} fetched instantly.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    const up = f(i - 1, j, callId);
    const left = f(i, j - 1, callId);
    const v = up + left;
    memo.set(kk, v);
    b.push("recurse-return", [i, j], `f(${i},${j}) = ${up} + ${left} = ${v}, stored in memo.`, {
      callId,
      parentCallId,
      value: v,
      deps: [[i - 1, j], [i, j - 1]],
      codeAnchor: "memoStore",
    });
    return v;
  }

  const answer = f(m - 1, n - 1);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "unique paths",
      tableShape: { rows: m, cols: n },
      axisLabels: { rowsTitle: "i (row)", colsTitle: "j (col)" },
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const { m, n } = input;
  const b = new TraceBuilder();
  const dp: number[][] = Array.from({ length: m }, () => new Array(n).fill(-1));

  for (let j = 0; j < n; j++) {
    dp[0][j] = 1;
    b.push("base-case", [0, j], "First row: one straight path → dp[0][j] = 1.", { value: 1, codeAnchor: "base" });
  }
  for (let i = 1; i < m; i++) {
    dp[i][0] = 1;
    b.push("base-case", [i, 0], "First column: one straight path → dp[i][0] = 1.", { value: 1, codeAnchor: "base" });
  }
  for (let i = 1; i < m; i++)
    for (let j = 1; j < n; j++) {
      const v = dp[i - 1][j] + dp[i][j - 1];
      b.push("table-write", [i, j], `dp[${i}][${j}] = dp[${i - 1}][${j}] + dp[${i}][${j - 1}] = ${dp[i - 1][j]} + ${dp[i][j - 1]} = ${v}.`, {
        value: v,
        deps: [[i - 1, j], [i, j - 1]],
        codeAnchor: "transition",
      });
      dp[i][j] = v;
    }
  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer: dp[m - 1][n - 1],
      answerLabel: "unique paths",
      tableShape: { rows: m, cols: n },
      axisLabels: { rowsTitle: "i (row)", colsTitle: "j (col)" },
      valueFormat: "int",
      stats: { steps: b.count, writes: m * n },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const { m, n } = input;
  const b = new TraceBuilder();
  let row: number[] = new Array(n).fill(1);
  for (let j = 0; j < n; j++)
    b.push("base-case", [0, j], "Row 0 initialised to all 1s — that single array is reused for every row.", { value: 1, codeAnchor: "init" });

  for (let i = 1; i < m; i++) {
    const next = new Array(n).fill(0);
    next[0] = 1;
    for (let j = 1; j < n; j++) {
      const v = row[j] + next[j - 1];
      b.push("table-write", [i, j],
        `Row ${i}: next[${j}] = above (${row[j]}) + left-in-same-row (${next[j - 1]}) = ${v}. Only one previous row kept.`,
        { value: v, deps: [[i - 1, j], [i, j - 1]], codeAnchor: "transition" });
      next[j] = v;
    }
    row = next;
  }
  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer: row[n - 1],
      answerLabel: "unique paths",
      tableShape: { rows: m, cols: n },
      axisLabels: { rowsTitle: "i (row)", colsTitle: "j (col)" },
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: Math.max(0, m * n - Math.max(0, n - 1)) },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int i, int j) {
    if (i == 0 || j == 0) return 1;   // base
    // recurse: from above + from left
    return f(i - 1, j) + f(i, j - 1); // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int i, int j) {
    if (i == 0 || j == 0) return 1;   // base
    return f(i - 1, j) + f(i, j - 1); // recurse
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition
// combine`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(i, j):
    if i == 0 or j == 0:     # base
        return 1
    # recurse: above + left
    return f(i - 1, j) + f(i, j - 1)   # combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: transition`,
      { base: "# base", recurse: "# recurse", combine: "# combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(i, j) {
  if (i === 0 || j === 0) return 1;   // base
  // recurse: from above + from left
  return f(i - 1, j) + f(i, j - 1);   // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int i, int j, vector<vector<int>>& memo) {
    if (i == 0 || j == 0) return 1;          // base
    if (memo[i][j] != -1) return memo[i][j]; // memo check
    memo[i][j] = f(i - 1, j, memo) + f(i, j - 1, memo);
    return memo[i][j];                       // memo store
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
`static int f(int i, int j, int[][] memo) {
    if (i == 0 || j == 0) return 1;          // base
    if (memo[i][j] != -1) return memo[i][j]; // memo check
    memo[i][j] = f(i - 1, j, memo) + f(i, j - 1, memo);
    return memo[i][j];                       // memo store
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
`def f(i, j, memo):
    if i == 0 or j == 0:            # base
        return 1
    if memo[i][j] != -1:            # memo check
        return memo[i][j]
    memo[i][j] = f(i - 1, j, memo) + f(i, j - 1, memo)
    return memo[i][j]               # memo store
# anchor: combine
# anchor: init
# anchor: recurse
# anchor: transition
# memoCheck
# memoStore`,
      { base: "# base", memoCheck: "# memoCheck", memoStore: "# memoStore", combine: "# anchor: combine", init: "# anchor: init", recurse: "# anchor: recurse", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(i, j, memo) {
  if (i === 0 || j === 0) return 1;           // base
  if (memo[i][j] !== -1) return memo[i][j];   // memo check
  memo[i][j] = f(i - 1, j, memo) + f(i, j - 1, memo);
  return memo[i][j];                          // memo store
}
// anchor: combine
// anchor: init
// anchor: recurse
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", recurse: "// anchor: recurse", transition: "// anchor: transition" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int uniquePaths(int m, int n) {
    vector<vector<int>> dp(m, vector<int>(n, 1));
    for (int j = 0; j < n; ++j) dp[0][j] = 1;   // base
    for (int i = 0; i < m; ++i) dp[i][0] = 1;   // base
    for (int i = 1; i < m; ++i)
        for (int j = 1; j < n; ++j)
            dp[i][j] = dp[i - 1][j] + dp[i][j - 1];   // transition
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
`static int uniquePaths(int m, int n) {
    int[][] dp = new int[m][n];
    for (int[] r : dp) Arrays.fill(r, 1);
    // base: first row & column stay 1
    for (int i = 1; i < m; ++i)
        for (int j = 1; j < n; ++j)
            dp[i][j] = dp[i - 1][j] + dp[i][j - 1];   // transition
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
`def unique_paths(m, n):
    dp = [[1] * n for _ in range(m)]   # base built in
    for i in range(1, m):
        for j in range(1, n):
            dp[i][j] = dp[i - 1][j] + dp[i][j - 1]   # transition
    return dp[m - 1][n - 1]
# anchor: combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", transition: "# transition", combine: "# anchor: combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function uniquePaths(m, n) {
  const dp = Array.from({ length: m }, () => new Array(n).fill(1));
  // base: first row & column are already 1
  for (let i = 1; i < m; i++)
    for (let j = 1; j < n; j++)
      dp[i][j] = dp[i - 1][j] + dp[i][j - 1];   // transition
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
`int uniquePaths(int m, int n) {
    vector<int> row(n, 1);                 // init
    for (int i = 1; i < m; ++i) {
        vector<int> nxt(n, 1);
        for (int j = 1; j < n; ++j)
            nxt[j] = row[j] + nxt[j - 1];  // transition
        row = move(nxt);
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
`static int uniquePaths(int m, int n) {
    int[] row = new int[n];
    Arrays.fill(row, 1);                       // init
    for (int i = 1; i < m; ++i) {
        int[] nxt = new int[n];
        Arrays.fill(nxt, 1);
        for (int j = 1; j < n; ++j)
            nxt[j] = row[j] + nxt[j - 1];      // transition
        row = nxt;
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
`def unique_paths(m, n):
    row = [1] * n                        # init
    for _ in range(1, m):
        nxt = [1] * n
        for j in range(1, n):
            nxt[j] = row[j] + nxt[j - 1]   # transition
        row = nxt
    return row[n - 1]
# anchor: base
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { init: "# init", transition: "# transition", base: "# anchor: base", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function uniquePaths(m, n) {
  let row = new Array(n).fill(1);              // init
  for (let i = 1; i < m; i++) {
    const nxt = new Array(n).fill(1);
    for (let j = 1; j < n; j++)
      nxt[j] = row[j] + nxt[j - 1];            // transition
    row = nxt;
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

export const gridUniquePaths: ProblemServiceDef = {
  slug: "grid-unique-paths",
  patternSlug: "dp-grids",
  inputDescriptor: [
    { key: "m", label: "ROWS", kind: "number", min: 1, max: 9 },
    { key: "n", label: "COLS", kind: "number", min: 1, max: 9 },
  ],
  schema,
  defaultInput: { m: 3, n: 4 },
  randomInput: () => ({ m: 2 + Math.floor(Math.random() * 6), n: 2 + Math.floor(Math.random() * 6) }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input) : mode === "memo" ? genMemo(input) : mode === "tabulation" ? genTab(input) : genSpace(input),
  codes,
};
