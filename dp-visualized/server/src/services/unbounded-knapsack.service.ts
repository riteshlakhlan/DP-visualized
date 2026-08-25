import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Unbounded Knapsack (Striver DP-23): like 0/1 knapsack but each item may be
 * taken ANY number of times.
 * dp[i][w] = max(dp[i-1][w], val[i] + dp[i][w - wt[i]])   <- same-row lookback!
 */

const schema = z
  .object({
    weights: z.array(z.number().int().min(1).max(9)).min(2).max(5),
    values: z.array(z.number().int().min(1).max(30)),
    capacity: z.number().int().min(1).max(12),
  })
  .refine((v) => v.weights.length === v.values.length, {
    message: "values must have the same length as weights",
  });
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && input.capacity > 12)
    return "Pure recursion re-uses items freely — the tree explodes with capacity. Use at most 8 for Brute Force.";
  return null;
}

const AXIS = (weights: number[], values: number[], n: number, W: number) => ({
  rowsTitle: "items",
  colsTitle: "capacity",
  rowLabels: ["∅", ...Array.from({ length: n }, (_, i) => `w${weights[i]}v${values[i]}`)],
  colLabels: Array.from({ length: W + 1 }, (_, w) => String(w)),
});

function genBrute(input: In): GeneratedTrace {
  const { weights: wt, values: val, capacity } = input;
  const n = wt.length;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<string>();

  function f(i: number, w: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i === 0) {
      // item 0 can still be repeated while it fits
      const take = Math.floor(w / wt[0]) * val[0];
      b.push("base-case", [0, w], `Only item 0 (w${wt[0]} v${val[0]}) left → ${Math.floor(w / wt[0])} copies = value ${take}.`, {
        callId,
        parentCallId,
        value: take,
        codeAnchor: "base",
      });
      return take;
    }
    const dup = seen.has(`${i},${w}`);
    b.push("recurse-call", [i, w],
      dup ? `f(${i},${w}) called AGAIN — overlapping subproblem.`
          : `f(${i},${w}) called: best value with items ≤ ${i} and capacity ${w}.`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(`${i},${w}`);
    const skip = f(i - 1, w, callId);
    let use = 0;
    if (wt[i] <= w) use = val[i] + f(i, w - wt[i], callId); // SAME i → unlimited copies
    const v = Math.max(skip, use);
    const deps: number[][] = [[i - 1, w]];
    if (wt[i] <= w) deps.push([i, w - wt[i]]);
    b.push("recurse-return", [i, w],
      wt[i] <= w ? `f(${i},${w}) = max(skip ${skip}, take ${val[i]} + reuse ${use - val[i]}) = ${v}.`
                 : `${wt[i]} > ${w}: cannot take → f(${i},${w}) = ${skip}.`,
      { callId, parentCallId, value: v, deps, codeAnchor: "combine" });
    return v;
  }

  const answer = f(n - 1, capacity);
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

function genMemo(input: In): GeneratedTrace {
  const { weights: wt, values: val, capacity } = input;
  const n = wt.length;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, w: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i, w], `f(${i},${w}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (i === 0) {
      const take = Math.floor(w / wt[0]) * val[0];
      b.push("base-case", [0, w], `Base case: repeat item 0 as often as it fits → ${take}.`, { callId, parentCallId, value: take, codeAnchor: "base" });
      return take;
    }
    const kk = `${i},${w}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [i, w], `Memo hit! f(${i},${w}) = ${v}.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    const skip = f(i - 1, w, callId);
    let use = 0;
    if (wt[i] <= w) use = val[i] + f(i, w - wt[i], callId);
    const v = Math.max(skip, use);
    memo.set(kk, v);
    const deps: number[][] = [[i - 1, w]];
    if (wt[i] <= w) deps.push([i, w - wt[i]]);
    b.push("recurse-return", [i, w], `f(${i},${w}) = ${v}, stored in memo.`, { callId, parentCallId, value: v, deps, codeAnchor: "memoStore" });
    return v;
  }

  const answer = f(n - 1, capacity);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "max value",
      tableShape: { rows: n, cols: capacity + 1 },
      axisLabels: AXIS(wt, val, n, capacity),
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const { weights: wt, values: val, capacity: W } = input;
  const n = wt.length;
  const b = new TraceBuilder();
  const table: number[][] = Array.from({ length: n }, () => new Array(W + 1).fill(-1));
  const dpGet = (i: number, w: number): number => table[i][w];
  const dpSet = (i: number, w: number, v: number): void => {
    table[i][w] = v;
  };

  // Row 0: unbounded supply of item 0
  for (let w = 0; w <= W; w++) {
    const take = Math.floor(w / wt[0]) * val[0];
    dpSet(0, w, take);
    b.push("base-case", [0, w], `dp[0][${w}] = ${take} (repeat item 0 ⌊${w}/${wt[0]}⌋ times).`, { value: take, codeAnchor: "base" });
  }

  for (let i = 1; i < n; i++)
    for (let w = 0; w <= W; w++) {
      const skip = dpGet(i - 1, w);
      let v: number;
      let deps: number[][];
      if (wt[i] <= w) {
        const use = val[i] + dpGet(i, w - wt[i]); // SAME ROW → unlimited copies
        v = Math.max(skip, use);
        deps = [[i - 1, w], [i, w - wt[i]]];
        b.push("table-write", [i, w], `dp[${i}][${w}] = max(skip ${skip}, take ${val[i]} + dp[${i}][${w - wt[i]}]=${use - val[i]}) = ${v}. Same-row read = unlimited supply.`, {
          value: v, deps, codeAnchor: "transition",
        });
      } else {
        v = skip;
        deps = [[i - 1, w]];
        b.push("table-write", [i, w], `${wt[i]} exceeds capacity ${w}: dp[${i}][${w}] carries down ${skip}.`, {
          value: v, deps, codeAnchor: "transition",
        });
      }
      dpSet(i, w, v);
    }

  const answer = dpGet(n - 1, W);
  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "max value",
      tableShape: { rows: n, cols: W + 1 },
      axisLabels: AXIS(wt, val, n, W),
      valueFormat: "int",
      stats: { steps: b.count, writes: n * (W + 1) },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const { weights: wt, values: val, capacity: W } = input;
  const n = wt.length;
  const b = new TraceBuilder();

  const dp = new Array(W + 1).fill(0);
  b.push("base-case", [0, 0], "Single array of zeros. LEFT-TO-RIGHT updates allow reusing an item many times.", { value: 0, codeAnchor: "init" });

  for (let i = 0; i < n; i++) {
    for (let w = wt[i]; w <= W; w++) {
      const before = dp[w];
      const cand = val[i] + dp[w - wt[i]];
      if (cand > dp[w]) {
        dp[w] = cand;
        b.push("table-write", [i, w], `Item ${i}: dp[${w}] = max(${before}, ${val[i]} + dp[${w - wt[i]}]=${dp[w - wt[i]]}) = ${cand}. Left-to-right keeps the item available.`, {
          value: cand,
          deps: [[Math.max(0, i), w - wt[i]]],
          codeAnchor: "transition",
        });
      }
    }
  }

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer: dp[W],
      answerLabel: "max value",
      tableShape: { rows: n, cols: W + 1 },
      axisLabels: AXIS(wt, val, n, W),
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: n * (W + 1) },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int i, int w, vector<int>& wt, vector<int>& val) {
    if (i == 0)
        return (w / wt[0]) * val[0];            // base
    int skip = f(i - 1, w, wt, val);            // recurse
    int use = 0;
    if (wt[i] <= w)
        use = val[i] + f(i, w - wt[i], wt, val);   // same i: unlimited
    return max(skip, use);                      // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int i, int w, int[] wt, int[] val) {
    if (i == 0)
        return (w / wt[0]) * val[0];             // base
    int skip = f(i - 1, w, wt, val);             // recurse
    int use = 0;
    if (wt[i] <= w)
        use = val[i] + f(i, w - wt[i], wt, val); // same i: unlimited
    return Math.max(skip, use);                  // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(i, w, wt, val):
    if i == 0:
        return (w // wt[0]) * val[0]              # base
    skip = f(i - 1, w, wt, val)                   # recurse
    use = 0
    if wt[i] <= w:
        use = val[i] + f(i, w - wt[i], wt, val)   # same i: unlimited
    return max(skip, use)                         # combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: transition`,
      { base: "# base", recurse: "# recurse", combine: "# combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(i, w, wt, val) {
  if (i === 0)
    return Math.floor(w / wt[0]) * val[0];     // base
  const skip = f(i - 1, w, wt, val);           // recurse
  let use = 0;
  if (wt[i] <= w)
    use = val[i] + f(i, w - wt[i], wt, val);   // same i: unlimited
  return Math.max(skip, use);                  // combine
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
`int f(int i, int w, vector<int>& wt, vector<int>& val, vector<vector<int>>& memo) {
    if (i == 0) return (w / wt[0]) * val[0];         // base
    if (memo[i][w] != -1) return memo[i][w];         // memo check
    int skip = f(i - 1, w, wt, val, memo);
    int use = wt[i] <= w ? val[i] + f(i, w - wt[i], wt, val, memo) : 0; // recurse
    return memo[i][w] = max(skip, use);              // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int i, int w, int[] wt, int[] val, int[][] memo) {
    if (i == 0) return (w / wt[0]) * val[0];          // base
    if (memo[i][w] != -1) return memo[i][w];          // memo check
    int skip = f(i - 1, w, wt, val, memo);
    int use = wt[i] <= w ? val[i] + f(i, w - wt[i], wt, val, memo) : 0; // recurse
    return memo[i][w] = Math.max(skip, use);          // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(i, w, wt, val, memo):
    if i == 0:
        return (w // wt[0]) * val[0]               # base
    if memo[i][w] != -1:                           # memo check
        return memo[i][w]
    skip = f(i - 1, w, wt, val, memo)
    use = val[i] + f(i, w - wt[i], wt, val, memo) if wt[i] <= w else 0  # recurse
    memo[i][w] = max(skip, use)
    return memo[i][w]                              # memo store
# anchor: combine
# anchor: init
# anchor: transition
# memoCheck
# memoStore`,
      { base: "# base", recurse: "# recurse", memoCheck: "# memoCheck", memoStore: "# memoStore", combine: "# anchor: combine", init: "# anchor: init", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(i, w, wt, val, memo) {
  if (i === 0) return Math.floor(w / wt[0]) * val[0];   // base
  if (memo[i][w] !== -1) return memo[i][w];             // memo check
  const skip = f(i - 1, w, wt, val, memo);
  const use = wt[i] <= w ? val[i] + f(i, w - wt[i], wt, val, memo) : 0; // recurse
  memo[i][w] = Math.max(skip, use);
  return memo[i][w];                                    // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int unboundedKnapsack(vector<int>& wt, vector<int>& val, int W) {
    int n = wt.size();
    vector<vector<int>> dp(n, vector<int>(W + 1));
    for (int w = 0; w <= W; ++w)
        dp[0][w] = (w / wt[0]) * val[0];                // base
    for (int i = 1; i < n; ++i)
        for (int w = 0; w <= W; ++w) {
            int skip = dp[i - 1][w];
            int use = wt[i] <= w ? val[i] + dp[i][w - wt[i]] : INT_MIN; // transition
            dp[i][w] = max(skip, use);
        }
    return dp[n - 1][W];
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int unboundedKnapsack(int[] wt, int[] val, int W) {
    int n = wt.length;
    int[][] dp = new int[n][W + 1];
    for (int w = 0; w <= W; ++w)
        dp[0][w] = (w / wt[0]) * val[0];                 // base
    for (int i = 1; i < n; ++i)
        for (int w = 0; w <= W; ++w) {
            int skip = dp[i - 1][w];
            int use = wt[i] <= w ? val[i] + dp[i][w - wt[i]] : Integer.MIN_VALUE; // transition
            dp[i][w] = Math.max(skip, use);
        }
    return dp[n - 1][W];
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def unbounded_knapsack(wt, val, W):
    n = len(wt)
    dp = [[0] * (W + 1) for _ in range(n)]
    for w in range(W + 1):
        dp[0][w] = (w // wt[0]) * val[0]              # base
    for i in range(1, n):
        for w in range(W + 1):
            skip = dp[i - 1][w]
            use = val[i] + dp[i][w - wt[i]] if wt[i] <= w else float("-inf")  # transition
            dp[i][w] = max(skip, use)
    return dp[n - 1][W]
# anchor: combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", transition: "# transition", combine: "# anchor: combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function unboundedKnapsack(wt, val, W) {
  const n = wt.length;
  const dp = Array.from({ length: n }, () => new Array(W + 1).fill(0));
  for (let w = 0; w <= W; w++)
    dp[0][w] = Math.floor(w / wt[0]) * val[0];       // base
  for (let i = 1; i < n; i++)
    for (let w = 0; w <= W; w++) {
      const skip = dp[i - 1][w];
      const use = wt[i] <= w ? val[i] + dp[i][w - wt[i]] : -Infinity; // transition
      dp[i][w] = Math.max(skip, use);
    }
  return dp[n - 1][W];
}
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// anchor: init`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse", init: "// anchor: init" },
    ),
  },
  spaceOptimized: {
    cpp: withAnchors(
`int unboundedKnapsack(vector<int>& wt, vector<int>& val, int W) {
    vector<int> dp(W + 1, 0);                   // init
    for (int i = 0; i < (int)wt.size(); ++i)
        for (int w = wt[i]; w <= W; ++w)        // LEFT-to-right: unlimited
            dp[w] = max(dp[w], val[i] + dp[w - wt[i]]); // transition
    return dp[W];
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int unboundedKnapsack(int[] wt, int[] val, int W) {
    int[] dp = new int[W + 1];                   // init
    for (int i = 0; i < wt.length; ++i)
        for (int w = wt[i]; w <= W; ++w)         // LEFT-to-right: unlimited
            dp[w] = Math.max(dp[w], val[i] + dp[w - wt[i]]); // transition
    return dp[W];
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def unbounded_knapsack(wt, val, W):
    dp = [0] * (W + 1)                        # init
    for i in range(len(wt)):
        for w in range(wt[i], W + 1):         # LEFT-to-right: unlimited
            dp[w] = max(dp[w], val[i] + dp[w - wt[i]])  # transition
    return dp[W]
# anchor: base
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { init: "# init", transition: "# transition", base: "# anchor: base", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function unboundedKnapsack(wt, val, W) {
  const dp = new Array(W + 1).fill(0);      // init
  for (let i = 0; i < wt.length; i++)
    for (let w = wt[i]; w <= W; w++)        // LEFT-to-right: unlimited
      dp[w] = Math.max(dp[w], val[i] + dp[w - wt[i]]); // transition
  return dp[W];
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

export const unboundedKnapsack: ProblemServiceDef = {
  slug: "unbounded-knapsack",
  patternSlug: "dp-subsequences",
  inputDescriptor: [
    { key: "weights", label: "WEIGHTS", kind: "array", min: 2, max: 5, valueRange: [1, 6] },
    { key: "values", label: "VALUES", kind: "array", min: 2, max: 5, valueRange: [1, 9] },
    { key: "capacity", label: "CAPACITY", kind: "number", min: 1, max: 10 },
  ],
  schema,
  defaultInput: {
    weights: [2, 4, 6],
    values: [5, 11, 13],
    capacity: 10,
  }, // Striver's classic example → answer verified in tests (27)
  randomInput: () => ({
    weights: Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => 1 + Math.floor(Math.random() * 6)),
    values: Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => 1 + Math.floor(Math.random() * 9)),
    capacity: 2 + Math.floor(Math.random() * 9),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : mode === "tabulation" ? genTab(input as In) : genSpace(input as In),
  codes,
};
