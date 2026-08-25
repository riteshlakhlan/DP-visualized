import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Matrix Chain Multiplication (Striver DP-48): dims array p[0..n] describes
 * n matrices Ai (p[i-1] x p[i]); find parenthesization minimizing scalar
 * multiplications. Memoized interval DP:
 *   f(i,j) = min over k in [i..j) of f(i,k)+f(k+1,j)+p[i-1]*p[k]*p[j]
 */

const schema = z.object({
  dims: z.array(z.number().int().min(1).max(100)).min(3).max(8),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && input.dims.length > 6)
    return "Brute force tries every parenthesization (Catalan-many). Use at most 5 matrices.";
  if (mode === "spaceOptimized")
    return "Interval DP reads across the whole remaining range — no rolling window exists. Use Memoization or Tabulation.";
  return null;
}

const AXIS = (n: number) => ({
  rowsTitle: "start matrix i",
  colsTitle: "end matrix j",
  rowLabels: Array.from({ length: n }, (_, i) => `A${i + 1}`),
  colLabels: Array.from({ length: n }, (_, j) => `A${j + 1}`),
});

function genBrute(input: In): GeneratedTrace {
  const d = input.dims;
  const n = d.length - 1;
  const b = new TraceBuilder();
  let calls = 0;

  function f(i: number, j: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i === j) {
      b.push("base-case", [i - 1, j - 1], `Single matrix A${i} → 0 multiplications.`, { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    b.push("recurse-call", [i - 1, j - 1], `f(${i},${j}) called: cheapest way to multiply A${i}..A${j}.`, { callId, parentCallId, codeAnchor: "recurse" });
    let best = Infinity;
    let bestK = -1;
    for (let k = i; k < j; k++) {
      const cost = f(i, k, callId) + f(k + 1, j, callId) + d[i - 1] * d[k] * d[j];
      if (cost < best) { best = cost; bestK = k; }
    }
    b.push("recurse-return", [i - 1, j - 1],
      `Split after A${bestK}: ${d[i - 1]}×${d[bestK]}×${d[j]} + halves = ${best}.`,
      { callId, parentCallId, value: best, deps: [[i - 1, bestK - 1], [bestK, j - 1]], codeAnchor: "combine" });
    return best;
  }

  const answer = f(1, n);
  return {
    steps: b.steps,
    meta: { mode: "bruteforce", answer, answerLabel: "min scalar multiplications", tableShape: null, axisLabels: null, valueFormat: "int", stats: { steps: b.count, calls } },
  };
}

function genMemo(input: In): GeneratedTrace {
  const d = input.dims;
  const n = d.length - 1;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, j: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i === j) {
      b.push("base-case", [i - 1, j - 1], `Single matrix A${i} → 0.`, { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    const kk = `${i},${j}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [i - 1, j - 1], `Memo hit! f(${i},${j}) = ${v} — identical subchain solved elsewhere.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    b.push("recurse-call", [i - 1, j - 1], `f(${i},${j}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    let best = Infinity;
    let bestK = -1;
    for (let k = i; k < j; k++) {
      const cost = f(i, k, callId) + f(k + 1, j, callId) + d[i - 1] * d[k] * d[j];
      if (cost < best) { best = cost; bestK = k; }
    }
    memo.set(kk, best);
    b.push("recurse-return", [i - 1, j - 1],
      `Best split after A${bestK}: ${d[i - 1]}×${d[bestK]}×${d[j]} added → ${best}, stored in memo.`,
      { callId, parentCallId, value: best, deps: [[i - 1, bestK - 1], [bestK, j - 1]], codeAnchor: "memoStore" });
    return best;
  }

  const answer = f(1, n);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "min scalar multiplications",
      tableShape: { rows: n, cols: n },
      axisLabels: AXIS(n),
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const d = input.dims;
  const n = d.length - 1;
  const b = new TraceBuilder();
  const dp: number[][] = Array.from({ length: n }, () => new Array(n).fill(-1));

  for (let i = 0; i < n; i++) {
    dp[i][i] = 0;
    b.push("base-case", [i, i], `Diagonal: single matrix A${i + 1} costs 0.`, { value: 0, codeAnchor: "base" });
  }

  // fill by increasing chain length
  for (let len = 2; len <= n; len++)
    for (let i = 0; i + len - 1 < n; i++) {
      const j = i + len - 1;
      let best = Infinity;
      let bestK = -1;
      for (let k = i; k < j; k++) {
        const cost = dp[i][k] + dp[k + 1][j] + d[i] * d[k + 1] * d[j + 1];
        if (cost < best) { best = cost; bestK = k; }
      }
      dp[i][j] = best;
      b.push("table-write", [i, j],
        `Chain A${i + 1}..A${j + 1}: split after A${bestK + 1} → ${d[i]}×${d[bestK + 1]}×${d[j + 1]} + halves = ${best}.`,
        { value: best, deps: [[i, bestK], [bestK + 1, j]], codeAnchor: "transition" });
    }

  const answer = dp[0][n - 1];
  b.push("table-read", [0, n - 1], `Answer at top-right corner: dp[0][${n - 1}] = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "min scalar multiplications",
      tableShape: { rows: n, cols: n },
      axisLabels: AXIS(n),
      valueFormat: "int",
      stats: { steps: b.count, writes: ((n * (n + 1)) / 2) + 1 },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int i, int j, vector<int>& p) {
    if (i == j) return 0;                                  // base
    int best = INT_MAX;
    for (int k = i; k < j; ++k)                            // recurse
        best = min(best, f(i, k, p) + f(k + 1, j, p)
                             + p[i - 1] * p[k] * p[j]);
    return best;                                           // combine
}`,
      { base: "base", recurse: "recurse", combine: "combine" },
    ),
    java: withAnchors(
`static int f(int i, int j, int[] p) {
    if (i == j) return 0;                                   // base
    int best = Integer.MAX_VALUE;
    for (int k = i; k < j; ++k)                             // recurse
        best = Math.min(best, f(i, k, p) + f(k + 1, j, p)
                                 + p[i - 1] * p[k] * p[j]);
    return best;                                            // combine
}`,
      { base: "base", recurse: "recurse", combine: "combine" },
    ),
    python: withAnchors(
`def f(i, j, p):
    if i == j:                                        # base
        return 0
    best = math.inf
    for k in range(i, j):                              # recurse
        best = min(best, f(i, k, p) + f(k + 1, j, p)
                        + p[i - 1] * p[k] * p[j])
    return best                                        # combine`,
      { base: "base", recurse: "recurse", combine: "combine" },
    ),
    js: withAnchors(
`function f(i, j, p) {
  if (i === j) return 0;                          // base
  let best = Infinity;
  for (let k = i; k < j; k++)                      // recurse
    best = Math.min(best, f(i, k, p) + f(k + 1, j, p)
                         + p[i - 1] * p[k] * p[j]);
  return best;                                    // combine
}`,
      { base: "base", recurse: "recurse", combine: "combine" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int i, int j, vector<int>& p, vector<vector<int>>& memo) {
    if (i == j) return 0;                               // base
    if (memo[i][j] != -1) return memo[i][j];            // memo check
    int best = INT_MAX;
    for (int k = i; k < j; ++k)                          // recurse
        best = min(best, f(i, k, p, memo) + f(k + 1, j, p, memo)
                             + p[i - 1] * p[k] * p[j]);
    return memo[i][j] = best;                           // memo store
}`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store" },
    ),
    java: withAnchors(
`static int f(int i, int j, int[] p, int[][] memo) {
    if (i == j) return 0;                                // base
    if (memo[i][j] != -1) return memo[i][j];             // memo check
    int best = Integer.MAX_VALUE;
    for (int k = i; k < j; ++k)                           // recurse
        best = Math.min(best, f(i, k, p, memo) + f(k + 1, j, p, memo)
                                 + p[i - 1] * p[k] * p[j]);
    return memo[i][j] = best;                            // memo store
}`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store" },
    ),
    python: withAnchors(
`def f(i, j, p, memo):
    if i == j:                                     # base
        return 0
    if memo[i][j] != -1:                           # memo check
        return memo[i][j]
    best = math.inf
    for k in range(i, j):                           # recurse
        best = min(best, f(i, k, p, memo) + f(k + 1, j, p, memo)
                        + p[i - 1] * p[k] * p[j])
    memo[i][j] = best
    return best                                    # memo store`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store" },
    ),
    js: withAnchors(
`function f(i, j, p, memo) {
  if (i === j) return 0;                                // base
  if (memo[i][j] !== -1) return memo[i][j];             // memo check
  let best = Infinity;
  for (let k = i; k < j; k++)                            // recurse
    best = Math.min(best, f(i, k, p, memo) + f(k + 1, j, p, memo)
                         + p[i - 1] * p[k] * p[j]);
  return memo[i][j] = best;                             // memo store
}`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int mcmTab(vector<int>& p) {
    int n = p.size() - 1;
    vector<vector<int>> dp(n, vector<int>(n, 0));       // base diagonal zeros
    for (int len = 2; len <= n; ++len)
        for (int i = 0; i + len - 1 < n; ++i) {
            int j = i + len - 1;
            dp[i][j] = INT_MAX;
            for (int k = i; k < j; ++k)                  // transition
                dp[i][j] = min(dp[i][j],
                    dp[i][k] + dp[k + 1][j] + p[i] * p[k + 1] * p[j + 1]);
        }
    return dp[0][n - 1];                                // driver
}`,
      { base: "base diagonal zeros", transition: "transition", driver: "driver" },
    ),
    java: withAnchors(
`static int mcmTab(int[] p) {
    int n = p.length - 1;
    int[][] dp = new int[n][n];                          // base diagonal zeros
    for (int len = 2; len <= n; ++len)
        for (int i = 0; i + len - 1 < n; ++i) {
            int j = i + len - 1;
            dp[i][j] = Integer.MAX_VALUE;
            for (int k = i; k < j; ++k)                   // transition
                dp[i][j] = Math.min(dp[i][j],
                    dp[i][k] + dp[k + 1][j] + p[i] * p[k + 1] * p[j + 1]);
        }
    return dp[0][n - 1];                                 // driver
}`,
      { base: "base diagonal zeros", transition: "transition", driver: "driver" },
    ),
    python: withAnchors(
`def mcm_tab(p):
    n = len(p) - 1
    dp = [[0] * n for _ in range(n)]              # base diagonal zeros
    for length in range(2, n + 1):
        for i in range(0, n - length + 1):
            j = i + length - 1
            dp[i][j] = math.inf
            for k in range(i, j):                  # transition
                dp[i][j] = min(dp[i][j], dp[i][k] + dp[k + 1][j]
                                       + p[i] * p[k + 1] * p[j + 1])
    return dp[0][n - 1]                            # driver`,
      { base: "base diagonal zeros", transition: "transition", driver: "driver" },
    ),
    js: withAnchors(
`function mcmTab(p) {
  const n = p.length - 1;
  const dp = Array.from({ length: n }, () => new Array(n).fill(0)); // base diag
  for (let len = 2; len <= n; len++)
    for (let i = 0; i + len - 1 < n; i++) {
      const j = i + len - 1;
      dp[i][j] = Infinity;
      for (let k = i; k < j; k++)                   // transition
        dp[i][j] = Math.min(dp[i][j],
          dp[i][k] + dp[k + 1][j] + p[i] * p[k + 1] * p[j + 1]);
    }
  return dp[0][n - 1];                              // driver
}`,
      { base: "base diag", transition: "transition", driver: "driver" },
    ),
  },
};

export const mcmService: ProblemServiceDef = {
  slug: "mcm",
  patternSlug: "dp-mcm",
  inputDescriptor: [
    { key: "dims", label: "DIMENSIONS P[]", kind: "array", min: 3, max: 7, valueRange: [1, 9] },
  ],
  schema,
  defaultInput: { dims: [10, 20, 30, 40, 30] }, // Striver classic (4 matrices) → 30000
  randomInput: () => ({
    dims: Array.from({ length: 4 + Math.floor(Math.random() * 3) }, () => 1 + Math.floor(Math.random() * 20)),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : genTab(input as In),
  codes,
};
