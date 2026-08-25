import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Count Partitions with Given Difference (Striver DP-18): split arr into two
 * groups S1, S2 with sum(S1) − sum(S2) = D. Reduction identical to Target Sum:
 * sum(S1) = (D + total)/2, so answer = number of subsets with that sum.
 */

const schema = z.object({
  arr: z.array(z.number().int().min(0).max(9)).min(1).max(8),
  d: z.number().int().min(0).max(20),
});
type In = z.infer<typeof schema>;

function reduce(input: In): { ok: boolean; reason?: string; k: number; total: number } {
  const total = input.arr.reduce((a, b) => a + b, 0);
  const s = input.d + total;
  if (s % 2 !== 0)
    return { ok: false, reason: `(D + total) = ${s} is odd — no valid partition exists.`, k: -1, total };
  return { ok: true, k: s / 2, total };
}

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && input.arr.length > 6)
    return "Brute force enumerates all 2^n group splits. Use at most 6 numbers.";
  return null;
}

const AXIS = (arr: number[], k: number) => ({
  rowsTitle: "items considered",
  colsTitle: "S1 sum",
  rowLabels: ["∅", ...arr.map((v, i) => `${v}[${i}]`)],
  colLabels: Array.from({ length: Math.max(0, k) + 1 }, (_, t) => String(t)),
});

let lastStats: { steps: number; writes?: number } = { steps: 0 };

function genMemo(input: In): GeneratedTrace {
  const { arr, d } = input;
  const red = reduce(input);
  const b = new TraceBuilder();
  b.push("base-case", [0, 0],
    red.ok ? `sum(S1) − sum(S2) = ${d} and sum(S1) + sum(S2) = ${red.total} ⇒ S1 must sum to (${d} + ${red.total})/2 = ${red.k}.`
           : `Reduction fails: ${red.reason}`,
    { codeAnchor: "driver" });

  let calls = 0;
  let hits = 0;
  let answer = 0;
  if (red.ok) {
    const memo = new Map<string, number>();
    function f(i: number, t: number, parentCallId?: number): number {
      const callId = b.allocCallId();
      calls++;
      b.push("recurse-call", [i, t], `f(${i},${t}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
      if (i === 0) {
        const v = t === 0 ? 1 : 0;
        b.push("base-case", [0, t], v ? "Empty S1 works." : `Sum ${t} unreachable.`, { callId, parentCallId, value: v, codeAnchor: "base" });
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
      b.push("recurse-return", [i, t], `f(${i},${t}) = ${skip} + ${pick} = ${v}, stored.`, { callId, parentCallId, value: v, deps, codeAnchor: "memoStore" });
      return v;
    }
    answer = f(arr.length, red.k);
  }

  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "partitions",
      tableShape: red.ok ? { rows: arr.length + 1, cols: red.k + 1 } : null,
      axisLabels: red.ok ? AXIS(arr, red.k) : null,
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const { arr, d } = input;
  const red = reduce(input);
  const b = new TraceBuilder();
  b.push("base-case", [0, 0],
    red.ok ? `S1 must sum to (${d} + ${red.total})/2 = ${red.k}.` : `Reduction fails: ${red.reason}`,
    { codeAnchor: "driver" });

  let answer = 0;
  if (red.ok) {
    const n = arr.length;
    const k = red.k;
    for (let t = 0; t <= k; t++)
      b.push("base-case", [0, t], t === 0 ? "dp[0][0] = 1." : `dp[0][${t}] = 0.`, { value: t === 0 ? 1 : 0, codeAnchor: "base" });
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
          arr[i - 1] <= t ? `dp[${i}][${t}] = leave-out (${skip}) + put-in-S1 (${pick}) = ${v}.`
                          : `${arr[i - 1]} exceeds ${t}: carry down ${skip}.`,
          { value: v, deps, codeAnchor: "transition" });
        dp[i][t] = v;
      }
    answer = dp[n][k];
    lastStats = { steps: b.count, writes: (n + 1) * (k + 1) };
  }

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "partitions",
      tableShape: red.ok ? { rows: arr.length + 1, cols: red.k + 1 } : null,
      axisLabels: red.ok ? AXIS(arr, red.k) : null,
      valueFormat: "int",
      stats: { ...lastStats },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const { arr, d } = input;
  const red = reduce(input);
  const b = new TraceBuilder();
  b.push("base-case", [0, 0],
    red.ok ? `S1 must sum to (${d} + ${red.total})/2 = ${red.k}.` : `Reduction fails: ${red.reason}`,
    { codeAnchor: "driver" });

  let answer = 0;
  if (red.ok) {
    const k = red.k;
    const dp = new Array(k + 1).fill(0);
    dp[0] = 1;
    b.push("base-case", [0, 0], "One rolling array, RIGHT-to-left updates.", { value: 1, codeAnchor: "init" });
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
    b.push("table-read", [arr.length, k], `Answer: ${answer} partitions differ by exactly ${d}.`, { value: answer, codeAnchor: "driver" });
  }

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer,
      answerLabel: "partitions",
      tableShape: red.ok ? { rows: arr.length + 1, cols: red.k + 1 } : null,
      axisLabels: red.ok ? AXIS(arr, red.k) : null,
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: b.steps.filter((s) => s.type === "table-write").length },
    },
  };
}

function genBrute(input: In): GeneratedTrace {
  const { arr, d } = input;
  const red = reduce(input);
  const b = new TraceBuilder();
  b.push("base-case", [0, 0], `Sign trick: S1 sums to (${d} + ${red.total})/2 when valid.`, { codeAnchor: "driver" });

  if (!red.ok) {
    b.push("base-case", [0, 0], red.reason ?? "Impossible.", { value: 0, codeAnchor: "driver" });
    return {
      steps: b.steps,
      meta: { mode: "bruteforce", answer: 0, answerLabel: "partitions", tableShape: null, axisLabels: null, valueFormat: "int", stats: { steps: b.count } },
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
    b.push("recurse-call", [i, t], dup ? `g(${i},${t}) called AGAIN.` : `g(${i},${t}) called.`, { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(`${i},${t}`);
    const skip = g(i - 1, t, callId);
    const pick = arr[i - 1] <= t ? g(i - 1, t - arr[i - 1], callId) : 0;
    const v = skip + pick;
    b.push("recurse-return", [i, t], `g(${i},${t}) = ${skip} + ${pick} = ${v}.`, { callId, parentCallId, value: v, deps: [[i - 1, t]], codeAnchor: "combine" });
    return v;
  }
  const answer = g(arr.length, red.k);

  return {
    steps: b.steps,
    meta: { mode: "bruteforce", answer, answerLabel: "partitions", tableShape: null, axisLabels: null, valueFormat: "int", stats: { steps: b.count, calls } },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`// S1 must sum to (D + total) / 2
int countSubsets(int i, int t, vector<int>& a) {
    if (i == 0) return t == 0 ? 1 : 0;     // base
    int skip = countSubsets(i - 1, t, a);  // recurse
    int pick = a[i - 1] <= t ? countSubsets(i - 1, t - a[i - 1], a) : 0;
    return skip + pick;                    // combine
}
// driver: reduce to counting subsets with sum (D + total) / 2
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
// driver: reduce to counting subsets with sum (D + total) / 2
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

# driver: reduce to counting subsets with sum (D + total) / 2
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
// driver: reduce to counting subsets with sum (D + total) / 2
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int countPartitions(vector<int>& a, int d) {
    int total = accumulate(a.begin(), a.end(), 0);
    if ((d + total) % 2 != 0) return 0;             // driver
    int k = (d + total) / 2;
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
`static int countPartitions(int[] a, int d) {
    int total = Arrays.stream(a).sum();
    if ((d + total) % 2 != 0) return 0;              // driver
    int k = (d + total) / 2;
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
`def count_partitions(a, d):
    total = sum(a)
    if (d + total) % 2 != 0:                  # driver
        return 0
    k = (d + total) // 2
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
`function countPartitions(a, d) {
  const total = a.reduce((x, y) => x + y, 0);
  if ((d + total) % 2 !== 0) return 0;          // driver
  const k = (d + total) / 2;
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
`int countPartitions(vector<int>& a, int d) {
    int total = accumulate(a.begin(), a.end(), 0);
    long s = (long)d + total;
    if (s % 2 != 0) return 0;                       // driver
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
`static int countPartitions(int[] a, int d) {
    int total = Arrays.stream(a).sum();
    long s = (long) d + total;
    if (s % 2 != 0) return 0;                        // driver
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
`def count_partitions(a, d):
    total = sum(a)
    s = d + total                                 # driver
    if s % 2 != 0:
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
`function countPartitions(a, d) {
  const total = a.reduce((x, y) => x + y, 0);
  const s = d + total;                             // driver
  if (s % 2 !== 0) return 0;
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
`int countPartitions(vector<int>& a, int d) {
    int total = accumulate(a.begin(), a.end(), 0);
    long s = (long)d + total;
    if (s % 2 != 0) return 0;                    // driver
    int k = (int)(s / 2);
    vector<int> dp(k + 1, 0);                    // init
    dp[0] = 1;
    for (int x : a)
        for (int t = k; t >= x; --t)             // RIGHT-to-left
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
`static int countPartitions(int[] a, int d) {
    int total = Arrays.stream(a).sum();
    long s = (long) d + total;
    if (s % 2 != 0) return 0;                     // driver
    int k = (int)(s / 2);
    int[] dp = new int[k + 1];                    // init
    dp[0] = 1;
    for (int x : a)
        for (int t = k; t >= x; --t)              // RIGHT-to-left
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
`def count_partitions(a, d):
    total = sum(a)
    s = d + total                              # driver
    if s % 2 != 0:
        return 0
    k = s // 2
    dp = [0] * (k + 1)                         # init
    dp[0] = 1
    for x in a:
        for t in range(k, x - 1, -1):          # RIGHT-to-left
            dp[t] += dp[t - x]                 # transition
    return dp[k]
# anchor: base
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { init: "# init", transition: "# transition", driver: "# driver", base: "# anchor: base", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function countPartitions(a, d) {
  const total = a.reduce((x, y) => x + y, 0);
  const s = d + total;                       // driver
  if (s % 2 !== 0) return 0;
  const k = s / 2;
  const dp = new Array(k + 1).fill(0);       // init
  dp[0] = 1;
  for (const x of a)
    for (let t = k; t >= x; t--)             // RIGHT-to-left
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

export const countPartitionsDiff: ProblemServiceDef = {
  slug: "count-partitions-diff",
  patternSlug: "dp-subsequences",
  inputDescriptor: [
    { key: "arr", label: "NUMBERS", kind: "array", min: 1, max: 8, valueRange: [0, 9] },
    { key: "d", label: "DIFFERENCE D", kind: "number", min: 0, max: 12 },
  ],
  schema,
  defaultInput: { arr: [1, 2, 3, 4], d: 2 }, // → S1 sums to 6: {2,4} and {1,2,3}
  randomInput: () => ({
    arr: Array.from({ length: 2 + Math.floor(Math.random() * 5) }, () => Math.floor(Math.random() * 10)),
    d: Math.floor(Math.random() * 13),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : mode === "tabulation" ? genTab(input as In) : genSpace(input as In),
  codes,
};
