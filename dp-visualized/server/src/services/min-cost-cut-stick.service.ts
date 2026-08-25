import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Minimum Cost to Cut the Stick (Striver DP-50): cutting a stick of length n
 * at given positions; each cut costs the CURRENT length of the piece. Add
 * boundary pads 0 and n, sort, then interval DP over cut indices:
 *   f(i,j) = min over k in (i,j) of (c[j]-c[i]) + f(i,k) + f(k,j)
 */

const schema = z.object({
  cuts: z.array(z.number().int().min(1).max(19)).min(1).max(6),
  n: z.number().int().min(2).max(20),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode): string | null {
  
  if (mode === "spaceOptimized")
    return "Interval DP reads across the whole range — no rolling window exists. Use Memoization or Tabulation.";
  return null;
}

function padded(input: In): { c: number[]; m: number } {
  const c = [0, ...[...input.cuts].sort((a, b) => a - b), input.n];
  return { c, m: c.length };
}

const AXIS = (m: number) => ({
  rowsTitle: "left cut idx",
  colsTitle: "right cut idx",
  rowLabels: Array.from({ length: m }, (_, i) => String(i)),
  colLabels: Array.from({ length: m }, (_, j) => String(j)),
});

function genBrute(input: In): GeneratedTrace {
  const { c, m } = padded(input);
  const b = new TraceBuilder();
  let calls = 0;

  function f(i: number, j: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (j - i < 2) {
      b.push("base-case", [i, j], "No cuts between these boundaries → cost 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    b.push("recurse-call", [i, j], `f(${i},${j}) called: stick of length ${c[j] - c[i]} with cuts between indices ${i}..${j}.`, { callId, parentCallId, codeAnchor: "recurse" });
    let best = Infinity;
    let bestK = -1;
    for (let k = i + 1; k < j; k++) {
      const cost = (c[j] - c[i]) + f(i, k, callId) + f(k, j, callId);
      if (cost < best) { best = cost; bestK = k; }
    }
    b.push("recurse-return", [i, j], `First cut at position ${c[bestK]} → ${best}.`, {
      callId, parentCallId, value: best, deps: [[i, bestK], [bestK, j]], codeAnchor: "combine",
    });
    return best;
  }

  const answer = f(0, m - 1);
  return {
    steps: b.steps,
    meta: { mode: "bruteforce", answer, answerLabel: "min total cutting cost", tableShape: null, axisLabels: null, valueFormat: "int", stats: { steps: b.count, calls } },
  };
}

function genMemo(input: In): GeneratedTrace {
  const { c, m } = padded(input);
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, j: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (j - i < 2) {
      b.push("base-case", [i, j], "Adjacent boundaries → nothing to cut.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    b.push("recurse-call", [i, j], `f(${i},${j}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    const kk = `${i},${j}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [i, j], `Memo hit! f(${i},${j}) = ${v}.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    let best = Infinity;
    for (let k = i + 1; k < j; k++)
      best = Math.min(best, (c[j] - c[i]) + f(i, k, callId) + f(k, j, callId));
    memo.set(kk, best);
    b.push("recurse-return", [i, j], `f(${i},${j}) = ${best}, stored in memo.`, {
      callId, parentCallId, value: best, deps: [], codeAnchor: "memoStore",
    });
    return best;
  }

  const answer = f(0, m - 1);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "min total cutting cost",
      tableShape: { rows: m, cols: m },
      axisLabels: AXIS(m),
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const { c, m } = padded(input);
  const b = new TraceBuilder();
  const dp: number[][] = Array.from({ length: m }, () => new Array(m).fill(-1));

  // base: adjacent boundaries cost 0
  for (let i = 0; i < m - 1; i++) {
    dp[i][i + 1] = 0;
    b.push("base-case", [i, i + 1], `Adjacent boundaries (${c[i]}, ${c[i + 1]}) → 0.`, { value: 0, codeAnchor: "base" });
  }

  // fill by increasing interval width
  for (let width = 2; width < m; width++)
    for (let i = 0; i + width < m; i++) {
      const j = i + width;
      let best = Infinity;
      let bestK = -1;
      for (let k = i + 1; k < j; k++) {
        const cand = (c[j] - c[i]) + dp[i][k] + dp[k][j];
        if (cand < best) { best = cand; bestK = k; }
      }
      dp[i][j] = best;
      b.push("table-write", [i, j],
        `Stick [${c[i]}..${c[j]}]: first cut at ${c[bestK]} → cost ${c[j] - c[i]} + halves = ${best}.`,
        { value: best, deps: [[i, bestK], [bestK, j]], codeAnchor: "transition" });
    }

  const answer = dp[0][m - 1];
  b.push("table-read", [0, m - 1], `Answer between the boundary pads: dp[0][${m - 1}] = ${answer}.`, {
    value: answer, codeAnchor: "driver",
  });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "min total cutting cost",
      tableShape: { rows: m, cols: m },
      axisLabels: AXIS(m),
      valueFormat: "int",
      derived: `padded cuts = [${c.join(", ")}]`,
      stats: { steps: b.count, writes: ((m * (m - 1)) / 2) + (m - 1) + 1 },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int i, int j, vector<int>& c) {
    if (j - i < 2) return 0;                        // base
    int best = INT_MAX;
    for (int k = i + 1; k < j; ++k)                  // recurse
        best = min(best, (c[j] - c[i]) + f(i, k, c) + f(k, j, c));
    return best;                                    // combine
}`,
      { base: "base", recurse: "recurse", combine: "combine" },
    ),
    java: withAnchors(
`static int f(int i, int j, int[] c) {
    if (j - i < 2) return 0;                         // base
    int best = Integer.MAX_VALUE;
    for (int k = i + 1; k < j; ++k)                   // recurse
        best = Math.min(best, (c[j] - c[i]) + f(i, k, c) + f(k, j, c));
    return best;                                     // combine
}`,
      { base: "base", recurse: "recurse", combine: "combine" },
    ),
    python: withAnchors(
`def f(i, j, c):
    if j - i < 2:                              # base
        return 0
    best = math.inf
    for k in range(i + 1, j):                   # recurse
        best = min(best, (c[j] - c[i]) + f(i, k, c) + f(k, j, c))
    return best                                # combine`,
      { base: "base", recurse: "recurse", combine: "combine" },
    ),
    js: withAnchors(
`function f(i, j, c) {
  if (j - i < 2) return 0;                     // base
  let best = Infinity;
  for (let k = i + 1; k < j; k++)               // recurse
    best = Math.min(best, (c[j] - c[i]) + f(i, k, c) + f(k, j, c));
  return best;                                 // combine
}`,
      { base: "base", recurse: "recurse", combine: "combine" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int i, int j, vector<int>& c, vector<vector<int>>& memo) {
    if (j - i < 2) return 0;                         // base
    if (memo[i][j] != -1) return memo[i][j];         // memo check
    int best = INT_MAX;
    for (int k = i + 1; k < j; ++k)                   // recurse
        best = min(best, (c[j] - c[i]) + f(i, k, c, memo) + f(k, j, c, memo));
    return memo[i][j] = best;                        // memo store
}`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store" },
    ),
    java: withAnchors(
`static int f(int i, int j, int[] c, int[][] memo) {
    if (j - i < 2) return 0;                          // base
    if (memo[i][j] != -1) return memo[i][j];          // memo check
    int best = Integer.MAX_VALUE;
    for (int k = i + 1; k < j; ++k)                    // recurse
        best = Math.min(best, (c[j] - c[i]) + f(i, k, c, memo)
                                        + f(k, j, c, memo));
    return memo[i][j] = best;                         // memo store
}`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store" },
    ),
    python: withAnchors(
`def f(i, j, c, memo):
    if j - i < 2:                              # base
        return 0
    if memo[i][j] != -1:                       # memo check
        return memo[i][j]
    best = math.inf
    for k in range(i + 1, j):                   # recurse
        best = min(best, (c[j] - c[i]) + f(i, k, c, memo) + f(k, j, c, memo))
    memo[i][j] = best
    return best                                # memo store`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store" },
    ),
    js: withAnchors(
`function f(i, j, c, memo) {
  if (j - i < 2) return 0;                     // base
  if (memo[i][j] !== -1) return memo[i][j];    // memo check
  let best = Infinity;
  for (let k = i + 1; k < j; k++)               // recurse
    best = Math.min(best, (c[j] - c[i]) + f(i, k, c, memo) + f(k, j, c, memo));
  memo[i][j] = best;
  return best;                                 // memo store
}`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int minCost(int n, vector<int>& cuts) {
    cuts.push_back(0); cuts.push_back(n);           // pads
    sort(cuts.begin(), cuts.end());                  // sort
    int m = cuts.size();
    vector<vector<int>> dp(m, vector<int>(m, 0));    // base: adjacent = 0
    for (int w = 2; w < m; ++w)
        for (int i = 0; i + w < m; ++i) {
            int j = i + w;
            dp[i][j] = INT_MAX;
            for (int k = i + 1; k < j; ++k)           // transition
                dp[i][j] = min(dp[i][j],
                    (cuts[j] - cuts[i]) + dp[i][k] + dp[k][j]);
        }
    return dp[0][m - 1];                             // driver
}`,
      { base: "adjacent = 0", transition: "transition", driver: "driver" },
    ),
    java: withAnchors(
`static int minCost(int n, int[] cutsRaw) {
    List<Integer> list = new ArrayList<>(List.of(0, n));   // pads
    for (int x : cutsRaw) list.add(list.size() - 1, x);
    Collections.sort(list);                          // sort
    int m = list.size();
    int[][] dp = new int[m][m];                      // base: adjacent = 0
    for (int w = 2; w < m; ++w)
        for (int i = 0; i + w < m; ++i) {
            int j = i + w;
            dp[i][j] = Integer.MAX_VALUE;
            for (int k = i + 1; k < j; ++k)           // transition
                dp[i][j] = Math.min(dp[i][j],
                    (list.get(j) - list.get(i)) + dp[i][k] + dp[k][j]);
        }
    return dp[0][m - 1];                             // driver
}`,
      { base: "adjacent = 0", transition: "transition", driver: "driver" },
    ),
    python: withAnchors(
`def min_cost(n, cuts):
    c = sorted([0, n] + cuts)                 # pads + sort
    m = len(c)
    dp = [[0] * m for _ in range(m)]     # base: adjacent = 0
    for w in range(2, m):
        for i in range(0, m - w):
            j = i + w
            dp[i][j] = math.inf
            for k in range(i + 1, j):             # transition
                dp[i][j] = min(dp[i][j],
                    (c[j] - c[i]) + dp[i][k] + dp[k][j])
    return dp[0][m - 1]                          # driver`,
      { base: "adjacent = 0", transition: "transition", driver: "driver" },
    ),
    js: withAnchors(
`function minCost(n, cuts) {
  const c = [0, ...cuts.sort((a, b) => a - b), n];   // pads + sort
  const m = c.length;
  const dp = Array.from({ length: m }, () => new Array(m).fill(0)); // base adj=0
  for (let w = 2; w < m; w++)
    for (let i = 0; i + w < m; i++) {
      const j = i + w;
      dp[i][j] = Infinity;
      for (let k = i + 1; k < j; k++)           // transition
        dp[i][j] = Math.min(dp[i][j],
          (c[j] - c[i]) + dp[i][k] + dp[k][j]);
    }
  return dp[0][m - 1];                          // driver
}`,
      { base: "base adj=0", transition: "transition", driver: "driver" },
    ),
  },
};

export const minCostCutStick: ProblemServiceDef = {
  slug: "min-cost-cut-stick",
  patternSlug: "dp-mcm",
  inputDescriptor: [
    { key: "cuts", label: "CUT POSITIONS", kind: "array", min: 1, max: 6, valueRange: [1, 19] },
    { key: "n", label: "STICK LENGTH", kind: "number", min: 2, max: 20 },
  ],
  schema,
  defaultInput: { cuts: [1, 3, 4, 5], n: 7 }, // Striver example → 16
  randomInput: () => {
    const n = 5 + Math.floor(Math.random() * 10);
    const cuts = [...new Set(Array.from({ length: 1 + Math.floor(Math.random() * 4) },
      () => 1 + Math.floor(Math.random() * (n - 1))))];
    return { cuts, n };
  },
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : genTab(input as In),
  codes,
};
