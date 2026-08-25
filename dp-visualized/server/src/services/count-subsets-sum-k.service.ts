import { z } from "zod";
import { TraceBuilder, computeStats } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Count Subsets with Sum K (Striver DP-18): count how many subsets of arr
 * sum to exactly k (0/1 use per element). Same table as Subset Sum but the
 * cell values are COUNTS: dp[i][t] = dp[i-1][t] + dp[i-1][t - arr[i-1]].
 */

const schema = z.object({
  arr: z.array(z.number().int().min(0).max(9)).min(1).max(8),
  k: z.number().int().min(0).max(20),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && input.arr.length > 6)
    return "Pure recursion walks all 2^n subsets. Use at most 6 elements for Brute Force, or switch to Memoization.";
  return null;
}

function axis(input: In) {
  return {
    rowsTitle: `items considered`,
    colsTitle: `target sum`,
    rowLabels: ["∅", ...input.arr.map((v, i) => `${v}[${i}]`)],
    colLabels: Array.from({ length: input.k + 1 }, (_, t) => String(t)),
  };
}

function genBrute(input: In): GeneratedTrace {
  const { arr, k } = input;
  const n = arr.length;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<string>();

  /** f(i, t): subsets among the FIRST i items summing to t. */
  function f(i: number, t: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i === 0) {
      b.push("base-case", [0, t], t === 0 ? "No items left, target 0 → the empty subset counts." : "No items left but target > 0 → no subset works.",
        { callId, parentCallId, value: t === 0 ? 1 : 0, codeAnchor: "base" });
      return t === 0 ? 1 : 0;
    }
    const dup = seen.has(`${i},${t}`);
    b.push("recurse-call", [i, t],
      dup ? `f(${i},${t}) called AGAIN — overlapping subproblem.`
          : `f(${i},${t}) called: count subsets of first ${i} items summing to ${t}.`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(`${i},${t}`);
    // skip arr[i-1]
    const skip = f(i - 1, t, callId);
    // pick arr[i-1] when it fits
    let pick = 0;
    if (arr[i - 1] <= t) pick = f(i - 1, t - arr[i - 1], callId);
    const v = skip + pick;
    const deps: number[][] = [[i - 1, t]];
    if (arr[i - 1] <= t) deps.push([i - 1, t - arr[i - 1]]);
    b.push("recurse-return", [i, t],
      arr[i - 1] <= t
        ? `f(${i},${t}) = skip (${skip}) + pick ${arr[i - 1]} (${pick}) = ${v}.`
        : `${arr[i - 1]} > ${t}: cannot pick it → f(${i},${t}) = ${skip}.`,
      { callId, parentCallId, value: v, deps, codeAnchor: "combine" });
    return v;
  }

  const answer = f(n, k);
  return {
    steps: b.steps,
    meta: {
      mode: "bruteforce",
      answer,
      answerLabel: `subsets summing to ${k}`,
      tableShape: null,
      axisLabels: null,
      valueFormat: "int",
      stats: { steps: b.count, calls },
    },
  };
}

function genMemo(input: In): GeneratedTrace {
  const { arr, k } = input;
  const n = arr.length;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, t: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i, t], `f(${i},${t}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (i === 0) {
      b.push("base-case", [0, t], t === 0 ? "Base case: empty subset hits target 0." : "Base case: nothing left, target unreachable.",
        { callId, parentCallId, value: t === 0 ? 1 : 0, codeAnchor: "base" });
      return t === 0 ? 1 : 0;
    }
    const kk = `${i},${t}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [i, t], `Memo hit! f(${i},${t}) = ${v} fetched instantly.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    const skip = f(i - 1, t, callId);
    let pick = 0;
    if (arr[i - 1] <= t) pick = f(i - 1, t - arr[i - 1], callId);
    const v = skip + pick;
    memo.set(kk, v);
    const deps: number[][] = [[i - 1, t]];
    if (arr[i - 1] <= t) deps.push([i - 1, t - arr[i - 1]]);
    b.push("recurse-return", [i, t], `f(${i},${t}) = ${skip} + ${pick} = ${v}, stored in memo.`, {
      callId, parentCallId, value: v, deps, codeAnchor: "memoStore" });
    return v;
  }

  const answer = f(n, k);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: `subsets summing to ${k}`,
      tableShape: { rows: n + 1, cols: k + 1 },
      axisLabels: axis(input),
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const { arr, k } = input;
  const n = arr.length;
  const b = new TraceBuilder();

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(-1));
  for (let t = 0; t <= k; t++) {
    dp[0][t] = t === 0 ? 1 : 0;
    b.push("base-case", [0, t], t === 0 ? "dp[0][0] = 1 — the empty subset sums to 0." : `dp[0][${t}] = 0 — can't reach ${t} with no items.`, { value: dp[0][t], codeAnchor: "base" });
  }

  for (let i = 1; i <= n; i++) {
    for (let t = 0; t <= k; t++) {
      const skip = dp[i - 1][t];
      const pick = arr[i - 1] <= t ? dp[i - 1][t - arr[i - 1]] : 0;
      const v = skip + pick;
      const deps: number[][] = [[i - 1, t]];
      if (arr[i - 1] <= t) deps.push([i - 1, t - arr[i - 1]]);
      b.push("table-write", [i, t],
        arr[i - 1] <= t
          ? `dp[${i}][${t}] = not-take (${skip}) + take ${arr[i - 1]} from dp[${i - 1}][${t - arr[i - 1]}] (${pick}) = ${v}.`
          : `${arr[i - 1]} exceeds ${t}: dp[${i}][${t}] = carry down ${skip}.`,
        { value: v, deps, codeAnchor: "transition" });
      dp[i][t] = v;
    }
  }

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer: dp[n][k],
      answerLabel: `subsets summing to ${k}`,
      tableShape: { rows: n + 1, cols: k + 1 },
      axisLabels: axis(input),
      valueFormat: "int",
      stats: { steps: b.count, writes: (n + 1) * (k + 1) },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const { arr, k } = input;
  const n = arr.length;
  const b = new TraceBuilder();

  const dp = new Array(k + 1).fill(0);
  dp[0] = 1;
  b.push("base-case", [0, 0], "Single array, dp[0] = 1. Each item updates it RIGHT-TO-LEFT so it is used at most once.", { value: 1, codeAnchor: "init" });

  for (let i = 1; i <= n; i++) {
    for (let t = k; t >= arr[i - 1]; t--) {
      const before = dp[t];
      dp[t] += dp[t - arr[i - 1]];
      b.push("table-write", [i, t], `Item ${arr[i - 1]}: dp[${t}] += dp[${t - arr[i - 1]}] → ${before} + ${dp[t] - before} = ${dp[t]}.`, {
        value: dp[t],
        deps: [[i - 1, t]],
        codeAnchor: "transition",
      });
    }
  }

  const answer = dp[k];
  b.push("table-read", [n, k], `Final count of subsets summing to ${k}: ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer,
      answerLabel: `subsets summing to ${k}`,
      tableShape: { rows: n + 1, cols: k + 1 },
      axisLabels: axis(input),
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, ...computeStats(b.steps) },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int i, int t, vector<int>& a) {
    if (i == 0) return t == 0 ? 1 : 0;       // base
    int skip = f(i - 1, t, a);               // recurse
    int pick = 0;
    if (a[i - 1] <= t)
        pick = f(i - 1, t - a[i - 1], a);
    return skip + pick;                      // combine
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int i, int t, int[] a) {
    if (i == 0) return t == 0 ? 1 : 0;        // base
    int skip = f(i - 1, t, a);                // recurse
    int pick = 0;
    if (a[i - 1] <= t)
        pick = f(i - 1, t - a[i - 1], a);
    return skip + pick;                       // combine
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(i, t, a):
    if i == 0:                          # base
        return 1 if t == 0 else 0
    skip = f(i - 1, t, a)               # recurse
    pick = 0
    if a[i - 1] <= t:
        pick = f(i - 1, t - a[i - 1], a)
    return skip + pick                  # combine
# anchor: driver
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: transition`,
      { base: "# base", recurse: "# recurse", combine: "# combine", driver: "# anchor: driver", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(i, t, a) {
  if (i === 0) return t === 0 ? 1 : 0;   // base
  const skip = f(i - 1, t, a);           // recurse
  let pick = 0;
  if (a[i - 1] <= t)
    pick = f(i - 1, t - a[i - 1], a);
  return skip + pick;                    // combine
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int i, int t, vector<int>& a, vector<vector<int>>& memo) {
    if (i == 0) return t == 0 ? 1 : 0;            // base
    if (memo[i][t] != -1) return memo[i][t];      // memo check
    int skip = f(i - 1, t, a, memo);
    int pick = a[i - 1] <= t ? f(i - 1, t - a[i - 1], a, memo) : 0; // recurse
    return memo[i][t] = skip + pick;              // memo store
}
// anchor: combine
// anchor: driver
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", driver: "// anchor: driver", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int i, int t, int[] a, int[][] memo) {
    if (i == 0) return t == 0 ? 1 : 0;             // base
    if (memo[i][t] != -1) return memo[i][t];       // memo check
    int skip = f(i - 1, t, a, memo);
    int pick = a[i - 1] <= t ? f(i - 1, t - a[i - 1], a, memo) : 0; // recurse
    return memo[i][t] = skip + pick;               // memo store
}
// anchor: combine
// anchor: driver
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", driver: "// anchor: driver", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(i, t, a, memo):
    if i == 0:                                # base
        return 1 if t == 0 else 0
    if memo[i][t] != -1:                      # memo check
        return memo[i][t]
    skip = f(i - 1, t, a, memo)
    pick = f(i - 1, t - a[i - 1], a, memo) if a[i - 1] <= t else 0  # recurse
    memo[i][t] = skip + pick
    return memo[i][t]                         # memo store
# anchor: combine
# anchor: driver
# anchor: init
# anchor: transition
# memoCheck
# memoStore`,
      { base: "# base", recurse: "# recurse", memoCheck: "# memoCheck", memoStore: "# memoStore", combine: "# anchor: combine", driver: "# anchor: driver", init: "# anchor: init", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(i, t, a, memo) {
  if (i === 0) return t === 0 ? 1 : 0;            // base
  if (memo[i][t] !== -1) return memo[i][t];       // memo check
  const skip = f(i - 1, t, a, memo);
  const pick = a[i - 1] <= t ? f(i - 1, t - a[i - 1], a, memo) : 0; // recurse
  memo[i][t] = skip + pick;
  return memo[i][t];                              // memo store
}
// anchor: combine
// anchor: driver
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", driver: "// anchor: driver", init: "// anchor: init", transition: "// anchor: transition" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int countSubsets(vector<int>& a, int k) {
    int n = a.size();
    vector<vector<int>> dp(n + 1, vector<int>(k + 1, 0));
    dp[0][0] = 1;                                        // base
    for (int i = 1; i <= n; ++i)
        for (int t = 0; t <= k; ++t) {
            dp[i][t] = dp[i - 1][t];                     // not take
            if (a[i - 1] <= t)
                dp[i][t] += dp[i - 1][t - a[i - 1]];     // transition: take
        }
    return dp[n][k];
}
// anchor: combine
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int countSubsets(int[] a, int k) {
    int n = a.length;
    int[][] dp = new int[n + 1][k + 1];
    dp[0][0] = 1;                                         // base
    for (int i = 1; i <= n; ++i)
        for (int t = 0; t <= k; ++t) {
            dp[i][t] = dp[i - 1][t];                      // not take
            if (a[i - 1] <= t)
                dp[i][t] += dp[i - 1][t - a[i - 1]];      // transition
        }
    return dp[n][k];
}
// anchor: combine
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def count_subsets(a, k):
    n = len(a)
    dp = [[0] * (k + 1) for _ in range(n + 1)]
    dp[0][0] = 1                                     # base
    for i in range(1, n + 1):
        for t in range(k + 1):
            dp[i][t] = dp[i - 1][t]                  # not take
            if a[i - 1] <= t:
                dp[i][t] += dp[i - 1][t - a[i - 1]]  # transition
    return dp[n][k]
# anchor: combine
# anchor: driver
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", transition: "# transition", combine: "# anchor: combine", driver: "# anchor: driver", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function countSubsets(a, k) {
  const n = a.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(0));
  dp[0][0] = 1;                                          // base
  for (let i = 1; i <= n; i++)
    for (let t = 0; t <= k; t++) {
      dp[i][t] = dp[i - 1][t];                           // not take
      if (a[i - 1] <= t)
        dp[i][t] += dp[i - 1][t - a[i - 1]];             // transition
    }
  return dp[n][k];
}
// anchor: combine
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
  spaceOptimized: {
    cpp: withAnchors(
`int countSubsets(vector<int>& a, int k) {
    vector<int> dp(k + 1, 0);
    dp[0] = 1;                                       // init
    for (int x : a)
        for (int t = k; t >= x; --t)                 // RIGHT-to-left: 0/1 use
            dp[t] += dp[t - x];                      // transition
    return dp[k];                                    // driver
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", driver: "// driver", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int countSubsets(int[] a, int k) {
    int[] dp = new int[k + 1];
    dp[0] = 1;                                        // init
    for (int x : a)
        for (int t = k; t >= x; --t)                  // RIGHT-to-left: 0/1 use
            dp[t] += dp[t - x];                       // transition
    return dp[k];                                    // driver
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", driver: "// driver", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def count_subsets(a, k):
    dp = [0] * (k + 1)
    dp[0] = 1                                      # init
    for x in a:
        for t in range(k, x - 1, -1):              # RIGHT-to-left: 0/1 use
            dp[t] += dp[t - x]                     # transition
    return dp[k]                     # driver
# anchor: base
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { init: "# init", transition: "# transition", driver: "# driver", base: "# anchor: base", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function countSubsets(a, k) {
  const dp = new Array(k + 1).fill(0);
  dp[0] = 1;                                    // init
  for (const x of a)
    for (let t = k; t >= x; t--)                // RIGHT-to-left: 0/1 use
      dp[t] += dp[t - x];                       // transition
    return dp[k];                              // driver
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", driver: "// driver", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
};

export const countSubsetsSumK: ProblemServiceDef = {
  slug: "count-subsets-sum-k",
  patternSlug: "dp-subsequences",
  inputDescriptor: [
    { key: "arr", label: "ITEMS", kind: "array", min: 1, max: 8, valueRange: [0, 9] },
    { key: "k", label: "TARGET K", kind: "number", min: 0, max: 16 },
  ],
  schema,
  defaultInput: { arr: [1, 1, 2, 3], k: 4 },
  randomInput: () => ({
    arr: Array.from({ length: 2 + Math.floor(Math.random() * 5) }, () => Math.floor(Math.random() * 10)),
    k: 2 + Math.floor(Math.random() * 12),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : mode === "tabulation" ? genTab(input as In) : genSpace(input as In),
  codes,
};
