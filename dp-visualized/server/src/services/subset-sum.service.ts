import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Subset Sum Equals Target (Striver DP-14).
 * Table: rows = "first i elements considered", cols = running target.
 * dp[i][t] = can some subset of arr[0..i) sum to exactly t?
 *
 * The generators below are exported so Partition Equal Subset Sum (which IS
 * this question with target = sum/2) can reuse them verbatim.
 */

const schema = z.object({
  arr: z.array(z.number().int().min(0).max(100)).min(1).max(10),
  target: z.number().int().min(0).max(200),
});
type In = z.infer<typeof schema>;

export interface LabelInfo {
  answerLabel: string;
  /** e.g. "target = sum / 2 = 24 / 2 = 12". */
  derived?: string;
  /** Extra narration emitted as the very first step. */
  preamble?: string;
}

/* ------------------------------------------------------------------ */
/* Generators                                                          */
/* ------------------------------------------------------------------ */

export function bruteGen(arr: number[], target: number, li: LabelInfo, mode: DPMode): GeneratedTrace {
  const n = arr.length;
  const b = new TraceBuilder();
  if (li.preamble)
    b.push("base-case", [0, 0], li.preamble);
  let calls = 0;
  const seen = new Set<string>();
  const kk = (i: number, t: number) => `${i},${t}`;

  function f(i: number, rem: number, parentCallId?: number): boolean {
    const callId = b.allocCallId();
    calls++;
    if (rem === 0) {
      b.push("recurse-call", [i, rem], `f(${i},${rem}) called — nothing left to make: success.`, { callId, parentCallId, codeAnchor: "base" });
      b.push("base-case", [i, rem], "Base case: remaining target hit 0 → subset found.", { callId, parentCallId, value: true });
      return true;
    }
    if (i === 0) {
      b.push("recurse-call", [0, rem], `f(0,${rem}) called — no elements left but target ${rem} remains: fail.`, { callId, parentCallId, codeAnchor: "base" });
      b.push("base-case", [0, rem], "Base case: out of elements → false.", { callId, parentCallId, value: false });
      return false;
    }
    const dup = seen.has(kk(i, rem));
    b.push("recurse-call", [i, rem],
      dup ? `f(${i},${rem}) reached AGAIN via a different branch — identical subtree repeats.`
          : `f(${i},${rem}) called: decide element ${arr[i - 1]} (index ${i - 1}) — skip it, or pick it.`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(kk(i, rem));
    const skipRes = f(i - 1, rem, callId);
    let pickRes = false;
    if (!skipRes && arr[i - 1] <= rem) pickRes = f(i - 1, rem - arr[i - 1], callId);
    const v = skipRes || pickRes;
    b.push("recurse-return", [i, rem],
      `f(${i},${rem}) = skip (${skipRes})${arr[i - 1] <= rem ? ` OR pick ${arr[i - 1]} (${pickRes})` : ` (pick ${arr[i - 1]} impossible — too big)`} = ${v}.`,
      { callId, parentCallId, value: v, deps: [[i - 1, rem]], codeAnchor: "combine" });
    return v;
  }

  const answer = f(n, target);
  return {
    steps: b.steps,
    meta: {
      mode,
      answer,
      answerLabel: li.answerLabel,
      derived: li.derived,
      tableShape: null,
      axisLabels: null,
      valueFormat: "bool",
      stats: { steps: b.count, calls },
    },
  };
}

export function memoGen(arr: number[], target: number, li: LabelInfo, mode: DPMode): GeneratedTrace {
  const n = arr.length;
  const b = new TraceBuilder();
  if (li.preamble)
    b.push("base-case", [0, 0], li.preamble);
  const memo = new Map<string, boolean>();
  let calls = 0;
  let hits = 0;

  function f(i: number, rem: number, parentCallId?: number): boolean {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i, rem], `f(${i},${rem}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (rem === 0) {
      b.push("base-case", [i, rem], "Base case: target reduced to 0 → true.", { callId, parentCallId, value: true, codeAnchor: "base" });
      return true;
    }
    if (i === 0) {
      b.push("base-case", [0, rem], "Base case: no elements left → false.", { callId, parentCallId, value: false, codeAnchor: "base" });
      return false;
    }
    const kk = `${i},${rem}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [i, rem], `Memo hit! f(${i},${rem}) = ${v} fetched instantly.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    const skipRes = f(i - 1, rem, callId);
    let pickRes = false;
    if (!skipRes && arr[i - 1] <= rem) pickRes = f(i - 1, rem - arr[i - 1], callId);
    const v = skipRes || pickRes;
    memo.set(kk, v);
    b.push("recurse-return", [i, rem],
      `f(${i},${rem}) = skip ${skipRes} OR pick ${arr[i - 1]} → ${pickRes} = ${v}, stored in memo.`,
      { callId, parentCallId, value: v, deps: [[i - 1, rem], ...(arr[i - 1] <= rem ? [[i - 1, rem - arr[i - 1]] as number[]] : [])], codeAnchor: "memoStore" });
    return v;
  }

  const answer = f(n, target);
  return {
    steps: b.steps,
    meta: {
      mode,
      answer,
      answerLabel: li.answerLabel,
      derived: li.derived,
      tableShape: { rows: n + 1, cols: target + 1 },
      axisLabels: { rowsTitle: "i (elements)", colsTitle: "target" },
      valueFormat: "bool",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function emitBase(arr: number[], target: number, b: TraceBuilder) {
  b.push("base-case", [0, 0], "dp[0][0] = true — the empty subset sums to 0.", { value: true, codeAnchor: "base" });
  for (let t = 1; t <= target; t++)
    b.push("base-case", [0, t], `dp[0][${t}] = false — with zero elements you can only make 0.`, { value: false, codeAnchor: "base" });
}

export function tabGen(arr: number[], target: number, li: LabelInfo, mode: DPMode): GeneratedTrace {
  const n = arr.length;
  const b = new TraceBuilder();
  emitBase(arr, target, b);
  const dp: boolean[][] = Array.from({ length: n + 1 }, () => new Array(target + 1).fill(false));
  dp[0][0] = true;

  for (let i = 1; i <= n; i++) {
    dp[i][0] = true;
    b.push("base-case", [i, 0], "dp[i][0] = true — always drop everything to reach 0.", { value: true, codeAnchor: "base" });
    for (let t = 1; t <= target; t++) {
      const notTake = dp[i - 1][t];
      const take = arr[i - 1] <= t ? dp[i - 1][t - arr[i - 1]] : false;
      const v = notTake || take;
      b.push("table-write", [i, t],
        `dp[${i}][${t}] = not-take dp[${i - 1}][${t}] (${notTake})${arr[i - 1] <= t ? ` OR take ${arr[i - 1]} → dp[${i - 1}][${t - arr[i - 1]}] (${take})` : ""} = ${v}.`,
        { value: v, deps: [[i - 1, t], ...(arr[i - 1] <= t ? [[i - 1, t - arr[i - 1]] as number[]] : [])], codeAnchor: "transition" });
      dp[i][t] = v;
    }
  }
  return {
    steps: b.steps,
    meta: {
      mode,
      answer: dp[n][target],
      answerLabel: li.answerLabel,
      derived: li.derived,
      tableShape: { rows: n + 1, cols: target + 1 },
      axisLabels: { rowsTitle: "i (elements)", colsTitle: "target" },
      valueFormat: "bool",
      stats: { steps: b.count, writes: (n + 1) * (target + 1) },
    },
  };
}

export function spaceGen(arr: number[], target: number, li: LabelInfo, mode: DPMode): GeneratedTrace {
  const n = arr.length;
  const b = new TraceBuilder();
  emitBase(arr, target, b);

  // Two rolling rows stored virtually at rows (i%2); client dims stale rows via rollingWindow.
  const rows: boolean[][] = [
    new Array(target + 1).fill(false),
    new Array(target + 1).fill(false),
  ];
  rows[0][0] = true;
  for (let i = 1; i <= n; i++) {
    const cur = rows[i % 2];
    const prev = rows[(i - 1) % 2];
    cur[0] = true;
    for (let t = 1; t <= target; t++) {
      const notTake = prev[t];
      const take = arr[i - 1] <= t ? prev[t - arr[i - 1]] : false;
      const v = notTake || take;
      b.push("table-write", [i, t],
        `Rolling row ${i}: dp[${t}] = prev[${t}] (${notTake})${arr[i - 1] <= t ? ` OR prev[${t - arr[i - 1]}] after taking ${arr[i - 1]} (${take})` : ""} = ${v}. Only the previous row is kept.`,
        { value: v, deps: [[i - 1, t], ...(arr[i - 1] <= t ? [[i - 1, t - arr[i - 1]] as number[]] : [])], codeAnchor: "transition" });
      cur[t] = v;
    }
  }
  return {
    steps: b.steps,
    meta: {
      mode,
      answer: rows[n % 2][target],
      answerLabel: li.answerLabel,
      derived: li.derived,
      tableShape: { rows: n + 1, cols: target + 1 },
      axisLabels: { rowsTitle: "i (elements)", colsTitle: "target" },
      valueFormat: "bool",
      rollingWindow: true,
      stats: { steps: b.count, writes: (n + 1) * (target + 1) },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Code snippets                                                       */
/* ------------------------------------------------------------------ */

const codes = {
  bruteforce: {
    cpp: withAnchors(
`bool f(int i, int rem, vector<int>& a) {
    if (rem == 0) return true;          // base
    if (i == 0) return false;           // base
    bool skip = f(i - 1, rem, a);
    bool pick = false;
    if (a[i - 1] <= rem)                // guard
        pick = f(i - 1, rem - a[i - 1], a);   // recurse
    return skip || pick;                // combine
}
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static boolean f(int i, int rem, int[] a) {
    if (rem == 0) return true;          // base
    if (i == 0) return false;           // base
    boolean skip = f(i - 1, rem, a);
    boolean pick = false;
    if (a[i - 1] <= rem)                // guard
        pick = f(i - 1, rem - a[i - 1], a);   // recurse
    return skip || pick;                // combine
}
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(i, rem, a):
    if rem == 0:                    # base
        return True
    if i == 0:                      # base
        return False
    skip = f(i - 1, rem, a)
    pick = False
    if a[i - 1] <= rem:             # guard
        pick = f(i - 1, rem - a[i - 1], a)   # recurse
    return skip or pick             # combine
# anchor: memoCheck
# anchor: memoStore
# anchor: transition`,
      { base: "# base", recurse: "# recurse", combine: "# combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(i, rem, a) {
  if (rem === 0) return true;         // base
  if (i === 0) return false;          // base
  const skip = f(i - 1, rem, a);
  let pick = false;
  if (a[i - 1] <= rem)                // guard
    pick = f(i - 1, rem - a[i - 1], a);   // recurse
  return skip || pick;                // combine
}
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`bool f(int i, int rem, vector<int>& a, vector<vector<int>>& memo) {
    if (rem == 0) return true;                 // base
    if (i == 0) return false;                  // base
    if (memo[i][rem] != -1) return memo[i][rem];   // memo check
    bool res = f(i - 1, rem, a, memo);
    if (!res && a[i - 1] <= rem)
        res = f(i - 1, rem - a[i - 1], a, memo);     // recurse
    memo[i][rem] = res;                        // memo store
    return res;
}
// anchor: combine
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", memoCheck: "// memoCheck", memoStore: "// memoStore", recurse: "// recurse", combine: "// anchor: combine", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static boolean f(int i, int rem, int[] a, int[][] memo) {
    if (rem == 0) return true;                 // base
    if (i == 0) return false;                  // base
    if (memo[i][rem] != -1) return memo[i][rem];   // memo check
    boolean res = f(i - 1, rem, a, memo);
    if (!res && a[i - 1] <= rem)
        res = f(i - 1, rem - a[i - 1], a, memo);     // recurse
    memo[i][rem] = res ? 1 : 0;                // memo store
    return res;
}
// anchor: combine
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", memoCheck: "// memoCheck", memoStore: "// memoStore", recurse: "// recurse", combine: "// anchor: combine", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(i, rem, a, memo):
    if rem == 0:                        # base
        return True
    if i == 0:                          # base
        return False
    if memo[i][rem] != -1:              # memo check
        return memo[i][rem] == 1
    res = f(i - 1, rem, a, memo)        # recurse (skip)
    if not res and a[i - 1] <= rem:
        res = f(i - 1, rem - a[i - 1], a, memo)   # recurse (pick)
    memo[i][rem] = 1 if res else 0      # memo store
    return res
# anchor: combine
# anchor: transition
# memoCheck
# memoStore`,
      { base: "# base", memoCheck: "# memoCheck", memoStore: "# memoStore", recurse: "# recurse", combine: "# anchor: combine", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(i, rem, a, memo) {
  if (rem === 0) return true;                 // base
  if (i === 0) return false;                  // base
  if (memo[i][rem] !== -1) return memo[i][rem];   // memo check
  let res = f(i - 1, rem, a, memo);
  if (!res && a[i - 1] <= rem)
    res = f(i - 1, rem - a[i - 1], a, memo);  // recurse
  memo[i][rem] = res;                         // memo store
  return res;
}
// anchor: combine
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", memoCheck: "// memoCheck", memoStore: "// memoStore", recurse: "// recurse", combine: "// anchor: combine", transition: "// anchor: transition" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`bool subsetSum(vector<int>& a, int k) {
    int n = a.size();
    vector<vector<bool>> dp(n + 1, vector<bool>(k + 1, false));
    dp[0][0] = true;                       // base
    for (int i = 1; i <= n; ++i) dp[i][0] = true;   // base
    for (int i = 1; i <= n; ++i)
        for (int t = 1; t <= k; ++t) {
            bool notTake = dp[i - 1][t];
            bool take = (a[i - 1] <= t) ? dp[i - 1][t - a[i - 1]] : false;
            dp[i][t] = notTake || take;    // transition
        }
    return dp[n][k];
}
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static boolean subsetSum(int[] a, int k) {
    int n = a.length;
    boolean[][] dp = new boolean[n + 1][k + 1];
    dp[0][0] = true;                       // base
    for (int i = 1; i <= n; ++i) dp[i][0] = true;   // base
    for (int i = 1; i <= n; ++i)
        for (int t = 1; t <= k; ++t) {
            boolean notTake = dp[i - 1][t];
            boolean take = (a[i - 1] <= t) ? dp[i - 1][t - a[i - 1]] : false;
            dp[i][t] = notTake || take;    // transition
        }
    return dp[n][k];
}
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def subset_sum(a, k):
    n = len(a)
    dp = [[False] * (k + 1) for _ in range(n + 1)]
    dp[0][0] = True                              # base
    for i in range(1, n + 1):
        dp[i][0] = True                          # base
    for i in range(1, n + 1):
        for t in range(1, k + 1):
            not_take = dp[i - 1][t]
            take = dp[i - 1][t - a[i - 1]] if a[i - 1] <= t else False
            dp[i][t] = not_take or take          # transition
    return dp[n][k]
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", transition: "# transition", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function subsetSum(a, k) {
  const n = a.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(false));
  dp[0][0] = true;                                    // base
  for (let i = 1; i <= n; i++) dp[i][0] = true;       // base
  for (let i = 1; i <= n; i++)
    for (let t = 1; t <= k; t++) {
      const notTake = dp[i - 1][t];
      const take = a[i - 1] <= t ? dp[i - 1][t - a[i - 1]] : false;
      dp[i][t] = notTake || take;                     // transition
    }
  return dp[n][k];
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
`bool subsetSum(vector<int>& a, int k) {
    int n = a.size();
    vector<vector<bool>> dp(2, vector<bool>(k + 1, false));
    dp[0][0] = true;                            // base
    for (int i = 1; i <= n; ++i) {
        int cur = i % 2, prev = 1 - cur;
        dp[cur][0] = true;
        for (int t = 1; t <= k; ++t) {
            bool take = (a[i - 1] <= t) ? dp[prev][t - a[i - 1]] : false;
            dp[cur][t] = dp[prev][t] || take;   // rolling row
        }
    }
    return dp[n % 2][k];
}
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// transition`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static boolean subsetSum(int[] a, int k) {
    int n = a.length;
    boolean[][] dp = new boolean[2][k + 1];
    dp[0][0] = true;                            // base
    for (int i = 1; i <= n; ++i) {
        int cur = i % 2, prev = 1 - cur;
        dp[cur][0] = true;
        for (int t = 1; t <= k; ++t) {
            boolean take = (a[i - 1] <= t) ? dp[prev][t - a[i - 1]] : false;
            dp[cur][t] = dp[prev][t] || take;   // rolling row
        }
    }
    return dp[n % 2][k];
}
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// transition`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def subset_sum(a, k):
    n = len(a)
    dp = [[False] * (k + 1) for _ in range(2)]
    dp[0][0] = True                                   # base
    for i in range(1, n + 1):
        cur, prev = i % 2, 1 - i % 2
        dp[cur][0] = True
        for t in range(1, k + 1):
            take = dp[prev][t - a[i - 1]] if a[i - 1] <= t else False
            dp[cur][t] = dp[prev][t] or take           # rolling row
    return dp[n % 2][k]
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
# transition`,
      { base: "# base", transition: "# transition", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function subsetSum(a, k) {
  const n = a.length;
  const dp = [new Array(k + 1).fill(false), new Array(k + 1).fill(false)];
  dp[0][0] = true;                                 // base
  for (let i = 1; i <= n; i++) {
    const cur = i % 2, prev = 1 - cur;
    dp[cur][0] = true;
    for (let t = 1; t <= k; t++) {
      const take = a[i - 1] <= t ? dp[prev][t - a[i - 1]] : false;
      dp[cur][t] = dp[prev][t] || take;            // rolling row
    }
  }
  return dp[n % 2][k];
}
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// transition`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
};

/* ------------------------------------------------------------------ */
/* Service registration                                                */
/* ------------------------------------------------------------------ */

export const subsetSumEqualsTarget: ProblemServiceDef = {
  slug: "subset-sum-equals-target",
  patternSlug: "dp-subsequences",
  inputDescriptor: [
    { key: "arr", label: "ITEMS", kind: "array", min: 1, max: 9, valueRange: [0, 20] },
    { key: "target", label: "TARGET", kind: "number", min: 0, max: 40 },
  ],
  schema,
  defaultInput: { arr: [3, 34, 4, 12, 5, 2], target: 9 },
  randomInput: () => ({
    arr: Array.from({ length: 4 + Math.floor(Math.random() * 5) }, () => Math.floor(Math.random() * 15) + 1),
    target: 8 + Math.floor(Math.random() * 15),
  }),
  limitsPerMode: {
    bruteforce: (_mode, input: In) => (input.arr.length > 8 ? "Pure recursion explores all 2^n subsets. Keep at most 8 elements for Brute Force." : null),
    memo: () => null,
    tabulation: () => null,
    spaceOptimized: () => null,
  },
  buildTrace: (input, mode) => {
    const { arr, target } = input as In;
    const li: LabelInfo = { answerLabel: `subset with sum ${target} exists` };
    switch (mode) {
      case "bruteforce": return bruteGen(arr, target, li, mode);
      case "memo": return memoGen(arr, target, li, mode);
      case "tabulation": return tabGen(arr, target, li, mode);
      default: return spaceGen(arr, target, li, mode);
    }
  },
  codes,
};
