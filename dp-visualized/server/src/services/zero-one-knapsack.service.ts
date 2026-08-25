import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* 0/1 Knapsack (Striver DP-19).
 * Table: rows = "first i items considered", cols = capacity 0..W.
 * dp[i][w] = max value using a subset of the first i items with total weight <= w.
 */

const schema = z.object({
  weights: z.array(z.number().int().min(1).max(15)).min(1).max(8),
  values: z.array(z.number().int().min(1).max(50)).min(1).max(8),
  W: z.number().int().min(1).max(30),
}).refine((d) => d.weights.length === d.values.length, { message: "weights and values must have equal length" });
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && input.weights.length > 7)
    return "Pure recursion explores all 2^n item subsets. Keep at most 7 items for Brute Force.";
  if (mode !== "bruteforce" && (input.weights.length + 1) * (input.W + 1) > 500)
    return "The memo table would exceed 500 cells — trim items or capacity.";
  return null;
}

export function knapBrute(input: In): GeneratedTrace {
  const { weights, values, W } = input;
  const n = weights.length;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<string>();
  const kk = (i: number, w: number) => `${i},${w}`;

  function f(i: number, rem: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i === 0) {
      b.push("recurse-call", [0, rem], `f(0,${rem}) called — no items left.`, { callId, parentCallId, codeAnchor: "base" });
      b.push("base-case", [0, rem], "Base case: no items → value 0.", { callId, parentCallId, value: 0 });
      return 0;
    }
    const dup = seen.has(kk(i, rem));
    b.push("recurse-call", [i, rem],
      dup ? `f(${i},${rem}) reached AGAIN — identical subtree repeats.`
          : `f(${i},${rem}) called: decide item ${i - 1} (wt ${weights[i - 1]}, val ${values[i - 1]}) — skip or take.`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(kk(i, rem));
    const notTake = f(i - 1, rem, callId);
    let take = -1;
    if (weights[i - 1] <= rem) take = values[i - 1] + f(i - 1, rem - weights[i - 1], callId);
    const v = Math.max(notTake, take);
    b.push("recurse-return", [i, rem],
      `f(${i},${rem}) = max(skip ${notTake}${take >= 0 ? `, take ${values[i - 1]} + f(${i - 1},${rem - weights[i - 1]}) = ${take}` : ", take impossible (too heavy)"}) = ${v}.`,
      { callId, parentCallId, value: v, deps: [[i - 1, rem]], codeAnchor: "combine" });
    return v;
  }

  const answer = f(n, W);
  return {
    steps: b.steps,
    meta: {
      mode: "bruteforce",
      answer,
      answerLabel: "max value",
      tableShape: null,
      axisLabels: null,
      valueFormat: "int",
      stats: { steps: b.count, calls },
    },
  };
}

export function knapMemo(input: In): GeneratedTrace {
  const { weights, values, W } = input;
  const n = weights.length;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, rem: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i, rem], `f(${i},${rem}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (i === 0) {
      b.push("base-case", [0, rem], "Base case: no items → 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    const kk = `${i},${rem}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [i, rem], `Memo hit! f(${i},${rem}) = ${v} fetched instantly.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    const notTake = f(i - 1, rem, callId);
    let take = -1;
    if (weights[i - 1] <= rem) take = values[i - 1] + f(i - 1, rem - weights[i - 1], callId);
    const v = Math.max(notTake, take);
    memo.set(kk, v);
    b.push("recurse-return", [i, rem], `f(${i},${rem}) = max(${Math.max(notTake, -1)}-branch) = ${v}, stored in memo.`, {
      callId,
      parentCallId,
      value: v,
      deps: [[i - 1, rem], ...(weights[i - 1] <= rem ? [[i - 1, rem - weights[i - 1]] as number[]] : [])],
      codeAnchor: "memoStore",
    });
    return v;
  }

  const answer = f(n, W);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "max value",
      tableShape: { rows: n + 1, cols: W + 1 },
      axisLabels: { rowsTitle: "i (items)", colsTitle: "capacity w" },
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

export function knapTab(input: In): GeneratedTrace {
  const { weights, values, W } = input;
  const n = weights.length;
  const b = new TraceBuilder();
  for (let w = 0; w <= W; w++)
    b.push("base-case", [0, w], `dp[0][${w}] = 0 — no items means no value at any capacity.`, { value: 0, codeAnchor: "base" });

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(W + 1).fill(-1));
  for (let w = 0; w <= W; w++) dp[0][w] = 0;

  for (let i = 1; i <= n; i++) {
    for (let w = 0; w <= W; w++) {
      const notTake = dp[i - 1][w];
      const take = weights[i - 1] <= w ? values[i - 1] + dp[i - 1][w - weights[i - 1]] : -1;
      const v = Math.max(notTake, take);
      dp[i][w] = v;
      b.push("table-write", [i, w],
        `dp[${i}][${w}] = max(skip dp[${i - 1}][${w}] = ${notTake}${weights[i - 1] <= w ? `, take ${values[i - 1]} + dp[${i - 1}][${w - weights[i - 1]}] = ${take}` : ""}) = ${v}.`,
        { value: v, deps: [[i - 1, w], ...(weights[i - 1] <= w ? [[i - 1, w - weights[i - 1]] as number[]] : [])], codeAnchor: "transition" });
    }
  }
  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer: dp[n][W],
      answerLabel: "max value",
      tableShape: { rows: n + 1, cols: W + 1 },
      axisLabels: { rowsTitle: "i (items)", colsTitle: "capacity w" },
      valueFormat: "int",
      stats: { steps: b.count, writes: (n + 1) * (W + 1) },
    },
  };
}

export function knapSpace(input: In): GeneratedTrace {
  const { weights, values, W } = input;
  const n = weights.length;
  const b = new TraceBuilder();
  const rows: number[][] = [new Array(W + 1).fill(0), new Array(W + 1).fill(0)];
  for (let w = 0; w <= W; w++)
    b.push("base-case", [0, w], "Row 0 initialised to zeros — only two rows will ever exist.", { value: 0, codeAnchor: "base" });

  for (let i = 1; i <= n; i++) {
    const cur = rows[i % 2];
    const prev = rows[(i - 1) % 2];
    cur[0] = 0;
    for (let w = 1; w <= W; w++) {
      const notTake = prev[w];
      const take = weights[i - 1] <= w ? values[i - 1] + prev[w - weights[i - 1]] : -1;
      const v = Math.max(notTake, take);
      cur[w] = v;
      b.push("table-write", [i, w],
        `Rolling row ${i}: dp[${w}] = max(prev[${w}] = ${notTake}${weights[i - 1] <= w ? `, ${values[i - 1]} + prev[${w - weights[i - 1]}] = ${take}` : ""}) = ${v}.`,
        { value: v, deps: [[i - 1, w], ...(weights[i - 1] <= w ? [[i - 1, w - weights[i - 1]] as number[]] : [])], codeAnchor: "transition" });
    }
  }
  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer: rows[n % 2][W],
      answerLabel: "max value",
      tableShape: { rows: n + 1, cols: W + 1 },
      axisLabels: { rowsTitle: "i (items)", colsTitle: "capacity w" },
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: (n + 1) * (W + 1) },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int i, int rem, vector<int>& wt, vector<int>& val) {
    if (i == 0) return 0;                    // base
    int skip = f(i - 1, rem, wt, val);
    int take = INT_MIN;
    if (wt[i - 1] <= rem)                    // guard
        take = val[i - 1] + f(i - 1, rem - wt[i - 1], wt, val);   // recurse
    return max(skip, take);                  // combine
}
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int i, int rem, int[] wt, int[] val) {
    if (i == 0) return 0;                    // base
    int skip = f(i - 1, rem, wt, val);
    int take = Integer.MIN_VALUE;
    if (wt[i - 1] <= rem)                    // guard
        take = val[i - 1] + f(i - 1, rem - wt[i - 1], wt, val);   // recurse
    return Math.max(skip, take);             // combine
}
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(i, rem, wt, val):
    if i == 0:                        # base
        return 0
    skip = f(i - 1, rem, wt, val)
    take = float("-inf")
    if wt[i - 1] <= rem:              # guard
        take = val[i - 1] + f(i - 1, rem - wt[i - 1], wt, val)   # recurse
    return max(skip, take)            # combine
# anchor: memoCheck
# anchor: memoStore
# anchor: transition`,
      { base: "# base", recurse: "# recurse", combine: "# combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(i, rem, wt, val) {
  if (i === 0) return 0;                       // base
  const skip = f(i - 1, rem, wt, val);
  let take = -Infinity;
  if (wt[i - 1] <= rem)                        // guard
    take = val[i - 1] + f(i - 1, rem - wt[i - 1], wt, val);   // recurse
  return Math.max(skip, take);                 // combine
}
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int i, int rem, vector<int>& wt, vector<int>& val, vector<vector<int>>& memo) {
    if (i == 0) return 0;                      // base
    if (memo[i][rem] != -1) return memo[i][rem];   // memo check
    int res = f(i - 1, rem, wt, val, memo);
    if (wt[i - 1] <= rem)
        res = max(res, val[i - 1] + f(i - 1, rem - wt[i - 1], wt, val, memo));
    memo[i][rem] = res;                        // memo store
    return res;
}
// anchor: combine
// anchor: recurse
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", recurse: "// anchor: recurse", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int i, int rem, int[] wt, int[] val, int[][] memo) {
    if (i == 0) return 0;                      // base
    if (memo[i][rem] != -1) return memo[i][rem];   // memo check
    int res = f(i - 1, rem, wt, val, memo);
    if (wt[i - 1] <= rem)
        res = Math.max(res, val[i - 1] + f(i - 1, rem - wt[i - 1], wt, val, memo));
    memo[i][rem] = res;                        // memo store
    return res;
}
// anchor: combine
// anchor: recurse
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", recurse: "// anchor: recurse", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(i, rem, wt, val, memo):
    if i == 0:                          # base
        return 0
    if memo[i][rem] != -1:              # memo check
        return memo[i][rem]
    res = f(i - 1, rem, wt, val, memo)
    if wt[i - 1] <= rem:
        res = max(res, val[i - 1] + f(i - 1, rem - wt[i - 1], wt, val, memo))
    memo[i][rem] = res
    return res                          # memo store
# anchor: combine
# anchor: recurse
# anchor: transition
# memoCheck
# memoStore`,
      { base: "# base", memoCheck: "# memoCheck", memoStore: "# memoStore", combine: "# anchor: combine", recurse: "# anchor: recurse", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(i, rem, wt, val, memo) {
  if (i === 0) return 0;                        // base
  if (memo[i][rem] !== -1) return memo[i][rem]; // memo check
  let res = f(i - 1, rem, wt, val, memo);
  if (wt[i - 1] <= rem)
    res = Math.max(res, val[i - 1] + f(i - 1, rem - wt[i - 1], wt, val, memo));
  memo[i][rem] = res;
  return res;                                   // memo store
}
// anchor: combine
// anchor: recurse
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", recurse: "// anchor: recurse", transition: "// anchor: transition" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int knapsack(vector<int>& wt, vector<int>& val, int W) {
    int n = wt.size();
    vector<vector<int>> dp(n + 1, vector<int>(W + 1, 0));
    for (int w = 0; w <= W; ++w) dp[0][w] = 0;     // base
    for (int i = 1; i <= n; ++i)
        for (int w = 0; w <= W; ++w) {
            int notTake = dp[i - 1][w];
            int take = (wt[i - 1] <= w) ? val[i - 1] + dp[i - 1][w - wt[i - 1]] : INT_MIN;
            dp[i][w] = max(notTake, take);          // transition
        }
    return dp[n][W];
}
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int knapsack(int[] wt, int[] val, int W) {
    int n = wt.length;
    int[][] dp = new int[n + 1][W + 1];
    // base: row 0 stays 0
    for (int i = 1; i <= n; ++i)
        for (int w = 0; w <= W; ++w) {
            int notTake = dp[i - 1][w];
            int take = (wt[i - 1] <= w) ? val[i - 1] + dp[i - 1][w - wt[i - 1]] : Integer.MIN_VALUE;
            dp[i][w] = Math.max(notTake, take);     // transition
        }
    return dp[n][W];
}
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def knapsack(wt, val, W):
    n = len(wt)
    dp = [[0] * (W + 1) for _ in range(n + 1)]   # base row built in
    for i in range(1, n + 1):
        for w in range(W + 1):
            not_take = dp[i - 1][w]
            take = val[i - 1] + dp[i - 1][w - wt[i - 1]] if wt[i - 1] <= w else float("-inf")
            dp[i][w] = max(not_take, take)         # transition
    return dp[n][W]
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", transition: "# transition", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function knapsack(wt, val, W) {
  const n = wt.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(W + 1).fill(0));   // base row
  for (let i = 1; i <= n; i++)
    for (let w = 0; w <= W; w++) {
      const notTake = dp[i - 1][w];
      const take = wt[i - 1] <= w ? val[i - 1] + dp[i - 1][w - wt[i - 1]] : -Infinity;
      dp[i][w] = Math.max(notTake, take);           // transition
    }
  return dp[n][W];
}
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
  spaceOptimized: {
    cpp: withAnchors(
`int knapsack(vector<int>& wt, vector<int>& val, int W) {
    int n = wt.size();
    vector<vector<int>> dp(2, vector<int>(W + 1, 0));   // two rolling rows
    for (int i = 1; i <= n; ++i) {
        int cur = i % 2, prev = 1 - cur;
        for (int w = 0; w <= W; ++w) {
            int notTake = dp[prev][w];
            int take = (wt[i - 1] <= w) ? val[i - 1] + dp[prev][w - wt[i - 1]] : INT_MIN;
            dp[cur][w] = max(notTake, take);       // rolling row
        }
    }
    return dp[n % 2][W];
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// transition`,
      { transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int knapsack(int[] wt, int[] val, int W) {
    int n = wt.length;
    int[][] dp = new int[2][W + 1];               // two rolling rows
    for (int i = 1; i <= n; ++i) {
        int cur = i % 2, prev = 1 - cur;
        for (int w = 0; w <= W; ++w) {
            int notTake = dp[prev][w];
            int take = (wt[i - 1] <= w) ? val[i - 1] + dp[prev][w - wt[i - 1]] : Integer.MIN_VALUE;
            dp[cur][w] = Math.max(notTake, take);  // rolling row
        }
    }
    return dp[n % 2][W];
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// transition`,
      { transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def knapsack(wt, val, W):
    n = len(wt)
    dp = [[0] * (W + 1) for _ in range(2)]        # two rolling rows
    for i in range(1, n + 1):
        cur, prev = i % 2, 1 - i % 2
        for w in range(W + 1):
            not_take = dp[prev][w]
            take = val[i - 1] + dp[prev][w - wt[i - 1]] if wt[i - 1] <= w else float("-inf")
            dp[cur][w] = max(not_take, take)        # rolling row
    return dp[n % 2][W]
# anchor: base
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
# transition`,
      { transition: "# transition", base: "# anchor: base", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function knapsack(wt, val, W) {
  const n = wt.length;
  const dp = [new Array(W + 1).fill(0), new Array(W + 1).fill(0)];   // two rolling rows
  for (let i = 1; i <= n; i++) {
    const cur = i % 2, prev = 1 - cur;
    for (let w = 0; w <= W; w++) {
      const notTake = dp[prev][w];
      const take = wt[i - 1] <= w ? val[i - 1] + dp[prev][w - wt[i - 1]] : -Infinity;
      dp[cur][w] = Math.max(notTake, take);         // rolling row
    }
  }
  return dp[n % 2][W];
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// transition`,
      { transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
};

export const zeroOneKnapsack: ProblemServiceDef = {
  slug: "zero-one-knapsack",
  patternSlug: "dp-subsequences",
  inputDescriptor: [
    { key: "weights", label: "WEIGHTS", kind: "array", min: 1, max: 7, valueRange: [1, 10] },
    { key: "values", label: "VALUES", kind: "array", min: 1, max: 7, valueRange: [1, 40] },
    { key: "W", label: "CAPACITY", kind: "number", min: 1, max: 20 },
  ],
  schema,
  defaultInput: { weights: [1, 3, 4, 5], values: [1, 4, 5, 7], W: 7 },
  randomInput: () => {
    const n = 3 + Math.floor(Math.random() * 4);
    return {
      weights: Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6)),
      values: Array.from({ length: n }, () => 2 + Math.floor(Math.random() * 20)),
      W: 6 + Math.floor(Math.random() * 9),
    };
  },
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? knapBrute(input as In)
    : mode === "memo" ? knapMemo(input as In)
    : mode === "tabulation" ? knapTab(input as In)
    : knapSpace(input as In),
  codes,
};
