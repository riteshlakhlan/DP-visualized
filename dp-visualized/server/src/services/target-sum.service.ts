import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Target Sum (Striver DP-21): assign + or − to every element so the
 * expression evaluates to T; count the assignments.
 *
 * Reduction: let S+ be the subset getting '+'. Then
 *   sum(S+) − sum(S−) = T  and  sum(S+) + sum(S−) = total
 *   ⇒ sum(S+) = (T + total) / 2.
 * Answer = number of subsets summing to that value, gated on parity.
 */

const schema = z.object({
  arr: z.array(z.number().int().min(1).max(9)).min(1).max(8),
  target: z.number().int().min(-20).max(20),
});
type In = z.infer<typeof schema>;

interface Reduction {
  ok: boolean;
  reason?: string;
  subsetTarget: number;
  total: number;
}

function reduce(input: In): Reduction {
  const total = input.arr.reduce((a, b) => a + b, 0);
  const s = input.target + total;
  if (s < 0 || s % 2 !== 0)
    return { ok: false, reason: `No assignment exists: (${input.target} + ${total}) = ${s}, which must be non-negative and even.`, subsetTarget: -1, total };
  return { ok: true, subsetTarget: s / 2, total };
}

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && Math.pow(2, input.arr.length) > 128)
    return "Brute force tries all ±2^n sign assignments. Use at most 7 numbers for Brute Force.";
  return null;
}

const AXIS = (arr: number[], k: number) => ({
  rowsTitle: "items considered",
  colsTitle: "+group sum",
  rowLabels: ["∅", ...arr.map((v, i) => `${v}[${i}]`)],
  colLabels: Array.from({ length: k + 1 }, (_, t) => String(t)),
});

/* ------------------------------ brute force ------------------------------- */

function genBrute(input: In): GeneratedTrace {
  const { arr, target } = input;
  const red = reduce(input);
  const b = new TraceBuilder();

  b.push("base-case", [0, 0],
    `Sign trick: sum of the "+" group S+ must equal (T + total)/2 = (${target} + ${red.total})/2.`,
    { codeAnchor: "driver" });

  if (!red.ok) {
    b.push("base-case", [0, 0], red.reason ?? "Reduction impossible.", { value: 0, codeAnchor: "driver" });
    return {
      steps: b.steps,
      meta: { mode: "bruteforce", answer: 0, answerLabel: "sign assignments", tableShape: null, axisLabels: null, valueFormat: "int", stats: { steps: b.count } },
    };
  }

  let calls = 0;
  const seen = new Set<string>();
  function g(i: number, t: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i === 0) {
      const v = t === 0 ? 1 : 0;
      b.push("base-case", [0, t], v ? "Empty subset hits 0." : `Sum ${t} unreachable.`, { callId, parentCallId, value: v, codeAnchor: "base" });
      return v;
    }
    const dup = seen.has(`${i},${t}`);
    b.push("recurse-call", [i, t],
      dup ? `g(${i},${t}) called AGAIN — overlapping subproblem.` : `g(${i},${t}) called.`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(`${i},${t}`);
    const skip = g(i - 1, t, callId);
    const pick = arr[i - 1] <= t ? g(i - 1, t - arr[i - 1], callId) : 0;
    const v = skip + pick;
    const deps: number[][] = [[i - 1, t]];
    if (arr[i - 1] <= t) deps.push([i - 1, t - arr[i - 1]]);
    b.push("recurse-return", [i, t], `g(${i},${t}) = ${skip} + ${pick} = ${v}.`, { callId, parentCallId, value: v, deps, codeAnchor: "combine" });
    return v;
  }

  const answer = g(arr.length, red.subsetTarget);
  return {
    steps: b.steps,
    meta: { mode: "bruteforce", answer, answerLabel: "sign assignments", tableShape: null, axisLabels: null, valueFormat: "int", stats: { steps: b.count, calls } },
  };
}

/* --------------------------- memo / tabulation ---------------------------- */

function countSubsetsMemo(b: TraceBuilder, arr: number[], k: number): number {
  let calls = 0;
  let hits = 0;
  const memo = new Map<string, number>();

  function f(i: number, t: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i, t], `f(${i},${t}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (i === 0) {
      const v = t === 0 ? 1 : 0;
      b.push("base-case", [0, t], v ? "Base case: empty subset reaches sum 0." : `Base case: sum ${t} unreachable.`, { callId, parentCallId, value: v, codeAnchor: "base" });
      return v;
    }
    const kk = `${i},${t}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [i, t], `Memo hit! f(${i},${t}) = ${v}.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    const skip = f(i - 1, t, callId);
    const pick = arr[i - 1] <= t ? f(i - 1, t - arr[i - 1], callId) : 0;
    const v = skip + pick;
    memo.set(kk, v);
    const deps: number[][] = [[i - 1, t]];
    if (arr[i - 1] <= t) deps.push([i - 1, t - arr[i - 1]]);
    b.push("recurse-return", [i, t], `f(${i},${t}) = ${skip} + ${pick} = ${v}, stored in memo.`, { callId, parentCallId, value: v, deps, codeAnchor: "memoStore" });
    return v;
  }

  const ans = f(arr.length, k);
  lastStats = { steps: b.count, calls, memoHits: hits };
  return ans;
}

let lastStats: { steps: number; calls?: number; memoHits?: number; writes?: number } = { steps: 0 };

function genMemo(input: In): GeneratedTrace {
  const { arr, target } = input;
  const red = reduce(input);
  const b = new TraceBuilder();
  b.push("base-case", [0, 0],
    red.ok ? `Reduction: count subsets with sum (${target} + ${red.total})/2 = ${red.subsetTarget}.` : `Reduction fails: ${red.reason}`,
    { codeAnchor: "driver" });

  let answer = 0;
  if (red.ok) answer = countSubsetsMemo(b, arr, red.subsetTarget);

  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "sign assignments",
      tableShape: red.ok ? { rows: arr.length + 1, cols: red.subsetTarget + 1 } : null,
      axisLabels: red.ok ? AXIS(arr, red.subsetTarget) : null,
      valueFormat: "int",
      stats: { ...lastStats },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const { arr, target } = input;
  const red = reduce(input);
  const b = new TraceBuilder();
  b.push("base-case", [0, 0],
    red.ok ? `Reduction: count subsets with sum (${target} + ${red.total})/2 = ${red.subsetTarget}.` : `Reduction fails: ${red.reason}`,
    { codeAnchor: "driver" });

  let answer = 0;
  if (red.ok) {
    const n = arr.length;
    const k = red.subsetTarget;
    for (let t = 0; t <= k; t++)
      b.push("base-case", [0, t], t === 0 ? "dp[0][0] = 1 — the empty +-group." : `dp[0][${t}] = 0.`, { value: t === 0 ? 1 : 0, codeAnchor: "base" });

    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(-1));
    for (let t = 0; t <= k; t++) dp[0][t] = t === 0 ? 1 : 0;

    for (let i = 1; i <= n; i++)
      for (let t = 0; t <= k; t++) {
        const skip = dp[i - 1][t];
        const pick = arr[i - 1] <= t ? dp[i - 1][t - arr[i - 1]] : 0;
        const v = skip + pick;
        const deps: number[][] = [[i - 1, t]];
        if (arr[i - 1] <= t) deps.push([i - 1, t - arr[i - 1]]);
        b.push("table-write", [i, t],
          arr[i - 1] <= t
            ? `dp[${i}][${t}] = not-in-plus-group (${skip}) + in-plus-group via dp[${i - 1}][${t - arr[i - 1]}] (${pick}) = ${v}.`
            : `${arr[i - 1]} exceeds ${t}: dp[${i}][${t}] carries down ${skip}.`,
          { value: v, deps, codeAnchor: "transition" });
        dp[i][t] = v;
      }
    answer = dp[n][k];
    b.push("table-read", [n, k], `Each counted subset is one ± assignment → answer ${answer}.`, { value: answer, codeAnchor: "driver" });
    lastStats = { steps: b.count, writes: (n + 1) * (k + 1) };
  }

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "sign assignments",
      tableShape: red.ok ? { rows: arr.length + 1, cols: red.subsetTarget + 1 } : null,
      axisLabels: red.ok ? AXIS(arr, red.subsetTarget) : null,
      valueFormat: "int",
      stats: { ...lastStats },
    },
  };
}

/* ----------------------------- space optimized ----------------------------- */

function genSpace(input: In): GeneratedTrace {
  const { arr, target } = input;
  const red = reduce(input);
  const b = new TraceBuilder();
  b.push("base-case", [0, 0],
    red.ok ? `Reduction: count subsets with sum (${target} + ${red.total})/2 = ${red.subsetTarget}.` : `Reduction fails: ${red.reason}`,
    { codeAnchor: "driver" });

  let answer = 0;
  if (red.ok) {
    const k = red.subsetTarget;
    const dp = new Array(k + 1).fill(0);
    dp[0] = 1;
    b.push("base-case", [0, 0], "One array: dp[0]=1; RIGHT-to-left updates keep each item single-use.", { value: 1, codeAnchor: "init" });
    for (let i = 1; i <= arr.length; i++) {
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
    answer = dp[k];
    b.push("table-read", [arr.length, k], `Answer: ${answer} sign assignments reach target ${target}.`, { value: answer, codeAnchor: "driver" });
    lastStats = { steps: b.count, writes: b.steps.filter((s) => s.type === "table-write").length };
  }

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer,
      answerLabel: "sign assignments",
      tableShape: red.ok ? { rows: arr.length + 1, cols: red.subsetTarget + 1 } : null,
      axisLabels: red.ok ? AXIS(arr, red.subsetTarget) : null,
      valueFormat: "int",
      rollingWindow: true,
      stats: { ...lastStats },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`// reduction: sum(S+) must equal (target + total) / 2
int countSubsets(int i, int t, vector<int>& a) {
    if (i == 0) return t == 0 ? 1 : 0;     // base
    int skip = countSubsets(i - 1, t, a);  // recurse
    int pick = a[i - 1] <= t ? countSubsets(i - 1, t - a[i - 1], a) : 0;
    return skip + pick;                    // combine
}
// driver: check parity of (target + total) / 2, then count
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int countSubsets(int i, int t, int[] a) {
    if (i == 0) return t == 0 ? 1 : 0;      // base
    int skip = countSubsets(i - 1, t, a);   // recurse
    int pick = a[i - 1] <= t ? countSubsets(i - 1, t - a[i - 1], a) : 0;
    return skip + pick;                     // combine
}
// driver: check parity of (target + total) / 2, then count
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def count_subsets(i, t, a):
    if i == 0:                              # base
        return 1 if t == 0 else 0
    skip = count_subsets(i - 1, t, a)       # recurse
    pick = count_subsets(i - 1, t - a[i - 1], a) if a[i - 1] <= t else 0
    return skip + pick                      # combine

# driver: check parity of (target + total) / 2, then count
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: transition`,
      { base: "# base", recurse: "# recurse", combine: "# combine", driver: "# driver", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function countSubsets(i, t, a) {
  if (i === 0) return t === 0 ? 1 : 0;      // base
  const skip = countSubsets(i - 1, t, a);   // recurse
  const pick = a[i - 1] <= t ? countSubsets(i - 1, t - a[i - 1], a) : 0;
  return skip + pick;                       // combine
}
// driver: check parity of (target + total) / 2, then count
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int findWays(vector<int>& a, int target) {
    int total = accumulate(a.begin(), a.end(), 0);
    if ((target + total) % 2 != 0) return 0;        // driver: parity gate
    int k = (target + total) / 2;
    vector<vector<int>> memo(a.size() + 1, vector<int>(k + 1, -1));
    return f(a.size(), k, a, memo);
}
int f(int i, int t, vector<int>& a, vector<vector<int>>& memo) {
    if (i == 0) return t == 0 ? 1 : 0;              // base
    if (memo[i][t] != -1) return memo[i][t];        // memo check
    int skip = f(i - 1, t, a, memo);
    int pick = a[i - 1] <= t ? f(i - 1, t - a[i - 1], a, memo) : 0; // recurse
    return memo[i][t] = skip + pick;                // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// driver", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int findWays(int[] a, int target) {
    int total = Arrays.stream(a).sum();
    if ((target + total) % 2 != 0) return 0;         // driver: parity gate
    int k = (target + total) / 2;
    int[][] memo = new int[a.length + 1][k + 1];
    for (int[] row : memo) Arrays.fill(row, -1);
    return f(a.length, k, a, memo);
}
static int f(int i, int t, int[] a, int[][] memo) {
    if (i == 0) return t == 0 ? 1 : 0;               // base
    if (memo[i][t] != -1) return memo[i][t];         // memo check
    int skip = f(i - 1, t, a, memo);
    int pick = a[i - 1] <= t ? f(i - 1, t - a[i - 1], a, memo) : 0; // recurse
    return memo[i][t] = skip + pick;                 // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// driver", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def find_ways(a, target):
    total = sum(a)
    if (target + total) % 2 != 0:             # driver: parity gate
        return 0
    k = (target + total) // 2
    memo = [[-1] * (k + 1) for _ in range(len(a) + 1)]
    return f(len(a), k, a, memo)

def f(i, t, a, memo):
    if i == 0:                                # base
        return 1 if t == 0 else 0
    if memo[i][t] != -1:                      # memo check
        return memo[i][t]
    skip = f(i - 1, t, a, memo)
    pick = f(i - 1, t - a[i - 1], a, memo) if a[i - 1] <= t else 0  # recurse
    memo[i][t] = skip + pick
    return memo[i][t]                         # memo store
# anchor: combine
# anchor: init
# anchor: transition
# memoCheck
# memoStore`,
      { base: "# base", recurse: "# recurse", memoCheck: "# memoCheck", memoStore: "# memoStore", driver: "# driver", combine: "# anchor: combine", init: "# anchor: init", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function findWays(a, target) {
  const total = a.reduce((x, y) => x + y, 0);
  if ((target + total) % 2 !== 0) return 0;     // driver: parity gate
  const k = (target + total) / 2;
  const memo = Array.from({ length: a.length + 1 }, () => new Array(k + 1).fill(-1));
  return f(a.length, k, a, memo);
}
function f(i, t, a, memo) {
  if (i === 0) return t === 0 ? 1 : 0;          // base
  if (memo[i][t] !== -1) return memo[i][t];     // memo check
  const skip = f(i - 1, t, a, memo);
  const pick = a[i - 1] <= t ? f(i - 1, t - a[i - 1], a, memo) : 0; // recurse
  memo[i][t] = skip + pick;
  return memo[i][t];                            // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// driver", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int findTargetSumWays(vector<int>& a, int target) {
    int total = accumulate(a.begin(), a.end(), 0);
    long s = (long)target + total;
    if (s < 0 || s % 2 != 0) return 0;              // driver
    int k = (int)(s / 2);
    vector<vector<int>> dp(a.size() + 1, vector<int>(k + 1, 0));
    dp[0][0] = 1;                                   // base
    for (int i = 1; i <= (int)a.size(); ++i)
        for (int t = 0; t <= k; ++t) {
            dp[i][t] = dp[i - 1][t];                // transition
            if (a[i - 1] <= t) dp[i][t] += dp[i - 1][t - a[i - 1]];
        }
    return dp[a.size()][k];
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", driver: "// driver", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int findTargetSumWays(int[] a, int target) {
    int total = Arrays.stream(a).sum();
    long s = (long) target + total;
    if (s < 0 || s % 2 != 0) return 0;               // driver
    int k = (int)(s / 2);
    int[][] dp = new int[a.length + 1][k + 1];
    dp[0][0] = 1;                                    // base
    for (int i = 1; i <= a.length; ++i)
        for (int t = 0; t <= k; ++t) {
            dp[i][t] = dp[i - 1][t];                 // transition
            if (a[i - 1] <= t) dp[i][t] += dp[i - 1][t - a[i - 1]];
        }
    return dp[a.length][k];
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", driver: "// driver", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def find_target_sum_ways(a, target):
    total = sum(a)
    s = target + total                            # driver
    if s < 0 or s % 2 != 0:
        return 0
    k = s // 2
    dp = [[0] * (k + 1) for _ in range(len(a) + 1)]
    dp[0][0] = 1                                  # base
    for i in range(1, len(a) + 1):
        for t in range(k + 1):
            dp[i][t] = dp[i - 1][t]               # transition
            if a[i - 1] <= t:
                dp[i][t] += dp[i - 1][t - a[i - 1]]
    return dp[len(a)][k]
# anchor: combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", transition: "# transition", driver: "# driver", combine: "# anchor: combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function findTargetSumWays(a, target) {
  const total = a.reduce((x, y) => x + y, 0);
  const s = target + total;                        // driver
  if (s < 0 || s % 2 !== 0) return 0;
  const k = s / 2;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(k + 1).fill(0));
  dp[0][0] = 1;                                    // base
  for (let i = 1; i <= a.length; i++)
    for (let t = 0; t <= k; t++) {
      dp[i][t] = dp[i - 1][t];                     // transition
      if (a[i - 1] <= t) dp[i][t] += dp[i - 1][t - a[i - 1]];
    }
  return dp[a.length][k];
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", driver: "// driver", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
  spaceOptimized: {
    cpp: withAnchors(
`int findTargetSumWays(vector<int>& a, int target) {
    int total = accumulate(a.begin(), a.end(), 0);
    long s = (long)target + total;
    if (s < 0 || s % 2 != 0) return 0;           // driver
    int k = (int)(s / 2);
    vector<int> dp(k + 1, 0);                    // init
    dp[0] = 1;
    for (int x : a)
        for (int t = k; t >= x; --t)             // RIGHT-to-left: 0/1 use
            dp[t] += dp[t - x];                  // transition
    return dp[k];
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", driver: "// driver", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int findTargetSumWays(int[] a, int target) {
    int total = Arrays.stream(a).sum();
    long s = (long) target + total;
    if (s < 0 || s % 2 != 0) return 0;            // driver
    int k = (int)(s / 2);
    int[] dp = new int[k + 1];                    // init
    dp[0] = 1;
    for (int x : a)
        for (int t = k; t >= x; --t)              // RIGHT-to-left: 0/1 use
            dp[t] += dp[t - x];                   // transition
    return dp[k];
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", driver: "// driver", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def find_target_sum_ways(a, target):
    total = sum(a)
    s = target + total
    if s < 0 or s % 2 != 0:                   # driver
        return 0
    k = s // 2
    dp = [0] * (k + 1)                        # init
    dp[0] = 1
    for x in a:
        for t in range(k, x - 1, -1):         # RIGHT-to-left: 0/1 use
            dp[t] += dp[t - x]                # transition
    return dp[k]
# anchor: base
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { init: "# init", transition: "# transition", driver: "# driver", base: "# anchor: base", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function findTargetSumWays(a, target) {
  const total = a.reduce((x, y) => x + y, 0);
  const s = target + total;
  if (s < 0 || s % 2 !== 0) return 0;        // driver
  const k = s / 2;
  const dp = new Array(k + 1).fill(0);       // init
  dp[0] = 1;
  for (const x of a)
    for (let t = k; t >= x; t--)             // RIGHT-to-left: 0/1 use
      dp[t] += dp[t - x];                    // transition
  return dp[k];
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

export const targetSum: ProblemServiceDef = {
  slug: "target-sum",
  patternSlug: "dp-subsequences",
  inputDescriptor: [
    { key: "arr", label: "NUMBERS", kind: "array", min: 1, max: 8, valueRange: [1, 9] },
    { key: "target", label: "TARGET T", kind: "number", min: -10, max: 10 },
  ],
  schema,
  defaultInput: { arr: [1, 2, 3, 4, 5], target: 3 }, // verified in tests
  randomInput: () => ({
    arr: Array.from({ length: 2 + Math.floor(Math.random() * 5) }, () => 1 + Math.floor(Math.random() * 9)),
    target: -5 + Math.floor(Math.random() * 11),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : mode === "tabulation" ? genTab(input as In) : genSpace(input as In),
  codes,
};
