import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Burst Balloons (Striver DP-51): burst balloons to maximise coins; bursting
 * balloon k LAST in the open interval (l,r) earns a[l]*a[k]*a[r]. Pad with
 * virtual 1s at both ends. f(l,r) = max over k of coins earned + halves.
 */

const schema = z.object({
  nums: z.array(z.number().int().min(1).max(9)).min(2).max(8),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && input.nums.length > 5)
    return "Brute force tries every order of bursting (n! permutations effectively). Use at most 5 balloons.";
  if (mode === "spaceOptimized")
    return "Interval DP reads across the whole open interval — no rolling window exists. Use Memoization or Tabulation.";
  return null;
}

const AXIS = (m: number) => ({
  rowsTitle: "left boundary l",
  colsTitle: "right boundary r",
  rowLabels: Array.from({ length: m }, (_, i) => `${i}`),
  colLabels: Array.from({ length: m }, (_, j) => `${j}`),
});

function padded(input: In): number[] {
  return [1, ...input.nums, 1];
}

function genBrute(input: In): GeneratedTrace {
  const v = padded(input);
  const b = new TraceBuilder();
  let calls = 0;

  function f(l: number, r: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (r - l < 2) {
      b.push("base-case", [l, r], "Open interval empty → 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    b.push("recurse-call", [l, r], `f(${l},${r}) called: best coins from balloons strictly between ${v[l]} and ${v[r]}.`, { callId, parentCallId, codeAnchor: "recurse" });
    let best = 0;
    let bestK = -1;
    for (let k = l + 1; k < r; k++) {
      const cost = v[l] * v[k] * v[r] + f(l, k, callId) + f(k, r, callId);
      if (cost > best) { best = cost; bestK = k; }
    }
    b.push("recurse-return", [l, r], `Burst ${bestK} (${v[bestK]}) LAST → ${best} coins.`, {
      callId, parentCallId, value: best, deps: [[l, bestK], [bestK, r]], codeAnchor: "combine",
    });
    return best;
  }

  const m = v.length;
  const answer = f(0, m - 1);
  return {
    steps: b.steps,
    meta: { mode: "bruteforce", answer, answerLabel: "max coins", tableShape: null, axisLabels: null, valueFormat: "int", stats: { steps: b.count, calls } },
  };
}

function genMemo(input: In): GeneratedTrace {
  const v = padded(input);
  const m = v.length;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(l: number, r: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (r - l < 2) {
      b.push("base-case", [l, r], "Empty interval → 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    b.push("recurse-call", [l, r], `f(${l},${r}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    const kk = `${l},${r}`;
    if (memo.has(kk)) {
      hits++;
      const val = memo.get(kk)!;
      b.push("memo-hit", [l, r], `Memo hit! f(${l},${r}) = ${val}.`, { callId, parentCallId, value: val, codeAnchor: "memoCheck" });
      return val;
    }
    let best = 0;
    for (let k = l + 1; k < r; k++)
      best = Math.max(best, v[l] * v[k] * v[r] + f(l, k, callId) + f(k, r, callId));
    memo.set(kk, best);
    b.push("recurse-return", [l, r], `f(${l},${r}) = ${best}, stored in memo.`, {
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
      answerLabel: "max coins",
      tableShape: { rows: m, cols: m },
      axisLabels: AXIS(m),
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const v = padded(input);
  const m = v.length;
  const b = new TraceBuilder();
  const dp: number[][] = Array.from({ length: m }, () => new Array(m).fill(0));

  // base: intervals that cannot contain any balloon earn nothing
  for (let i = 0; i < m; i++) {
    if (i + 1 < m)
      b.push("base-case", [i, i + 1], "Adjacent boundaries (no balloon between) → 0.", { value: 0, codeAnchor: "base" });
  }
  void dp;

  // fill by increasing interval width
  for (let width = 2; width < m; width++)
    for (let l = 0; l + width < m; l++) {
      const r = l + width;
      let best = 0;
      let bestK = -1;
      for (let k = l + 1; k < r; k++) {
        const cand = dp[l][k] + dp[k][r] + v[l] * v[k] * v[r];
        if (cand > best) { best = cand; bestK = k; }
      }
      dp[l][r] = best;
      b.push("table-write", [l, r],
        `Width ${width}: last-burst k=${bestK} (${v[bestK]}) → ${v[l]}*${v[bestK]}*${v[r]} + halves = ${best}.`,
        { value: best, deps: [[l, bestK], [bestK, r]], codeAnchor: "transition" });
    }

  const answer = dp[0][m - 1];
  b.push("table-read", [0, m - 1], `Answer between the virtual 1s: dp[0][${m - 1}] = ${answer}.`, {
    value: answer, codeAnchor: "driver",
  });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "max coins",
      tableShape: { rows: m, cols: m },
      axisLabels: AXIS(m),
      valueFormat: "int",
      stats: { steps: b.count, writes: ((m * (m - 1)) / 2) + 1 },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int l, int r, vector<int>& v) {
    if (r - l < 2) return 0;                              // base
    int best = 0;
    for (int k = l + 1; k < r; ++k)                        // recurse
        best = max(best, v[l] * v[k] * v[r] + f(l, k, v) + f(k, r, v));
    return best;                                          // combine
}`,
      { base: "base", recurse: "recurse", combine: "combine" },
    ),
    java: withAnchors(
`static int f(int l, int r, int[] v) {
    if (r - l < 2) return 0;                               // base
    int best = 0;
    for (int k = l + 1; k < r; ++k)                         // recurse
        best = Math.max(best, v[l] * v[k] * v[r] + f(l, k, v) + f(k, r, v));
    return best;                                           // combine
}`,
      { base: "base", recurse: "recurse", combine: "combine" },
    ),
    python: withAnchors(
`def f(l, r, v):
    if r - l < 2:                                   # base
        return 0
    best = 0
    for k in range(l + 1, r):                        # recurse
        best = max(best, v[l] * v[k] * v[r] + f(l, k, v) + f(k, r, v))
    return best                                     # combine`,
      { base: "base", recurse: "recurse", combine: "combine" },
    ),
    js: withAnchors(
`function f(l, r, v) {
  if (r - l < 2) return 0;                             // base
  let best = 0;
  for (let k = l + 1; k < r; k++)                       // recurse
    best = Math.max(best, v[l] * v[k] * v[r] + f(l, k, v) + f(k, r, v));
  return best;                                         // combine
}`,
      { base: "base", recurse: "recurse", combine: "combine" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int l, int r, vector<int>& v, vector<vector<int>>& memo) {
    if (r - l < 2) return 0;                               // base
    if (memo[l][r] != -1) return memo[l][r];               // memo check
    int best = 0;
    for (int k = l + 1; k < r; ++k)                         // recurse
        best = max(best, v[l] * v[k] * v[r] + f(l, k, v, memo)
                                       + f(k, r, v, memo));
    return memo[l][r] = best;                              // memo store
}`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store" },
    ),
    java: withAnchors(
`static int f(int l, int r, int[] v, int[][] memo) {
    if (r - l < 2) return 0;                                // base
    if (memo[l][r] != -1) return memo[l][r];                // memo check
    int best = 0;
    for (int k = l + 1; k < r; ++k)                         // recurse
        best = Math.max(best, v[l] * v[k] * v[r] + f(l, k, v, memo)
                                       + f(k, r, v, memo));
    return memo[l][r] = best;                               // memo store
}`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store" },
    ),
    python: withAnchors(
`def f(l, r, v, memo):
    if r - l < 2:                                    # base
        return 0
    if memo[l][r] != -1:                             # memo check
        return memo[l][r]
    best = 0
    for k in range(l + 1, r):                         # recurse
        best = max(best, v[l] * v[k] * v[r] + f(l, k, v, memo)
                                       + f(k, r, v, memo))
    memo[l][r] = best
    return best                                      # memo store`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store" },
    ),
    js: withAnchors(
`function f(l, r, v, memo) {
  if (r - l < 2) return 0;                               // base
  if (memo[l][r] !== -1) return memo[l][r];              // memo check
  let best = 0;
  for (let k = l + 1; k < r; k++)                         // recurse
    best = Math.max(best, v[l] * v[k] * v[r] + f(l, k, v, memo)
                                       + f(k, r, v, memo));
  memo[l][r] = best;
  return best;                                           // memo store
}`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int maxCoins(vector<int>& nums) {
    int n = nums.size();
    vector<int> v(n + 2); v[0] = v[n + 1] = 1;         // pad with 1s
    for (int i = 0; i < n; ++i) v[i + 1] = nums[i];
    int m = v.size();
    vector<vector<int>> dp(m, vector<int>(m, 0));       // base zeros
    for (int width = 2; width < m; ++width)
        for (int l = 0; l + width < m; ++l) {
            int r = l + width;
            for (int k = l + 1; k < r; ++k)             // transition
                dp[l][r] = max(dp[l][r],
                    dp[l][k] + dp[k][r] + v[l] * v[k] * v[r]);
        }
    return dp[0][m - 1];                                // driver
}`,
      { base: "base zeros", transition: "transition", driver: "driver" },
    ),
    java: withAnchors(
`static int maxCoins(int[] nums) {
    int n = nums.length;
    int[] v = new int[n + 2]; v[0] = v[n + 1] = 1;     // pad
    System.arraycopy(nums, 0, v, 1, n);
    int m = v.length;
    int[][] dp = new int[m][m];                         // base zeros
    for (int w = 2; w < m; ++w)
        for (int l = 0; l + w < m; ++l) {
            int r = l + w;
            for (int k = l + 1; k < r; ++k)             // transition
                dp[l][r] = Math.max(dp[l][r],
                    dp[l][k] + dp[k][r] + v[l] * v[k] * v[r]);
        }
    return dp[0][m - 1];                                // driver
}`,
      { base: "base zeros", transition: "transition", driver: "driver" },
    ),
    python: withAnchors(
`def max_coins(nums):
    v = [1] + list(nums) + [1]
    m = len(v)
    dp = [[0] * m for _ in range(m)]             # base zeros
    for width in range(2, m):
        for l in range(0, m - width):
            r = l + width
            for k in range(l + 1, r):             # transition
                dp[l][r] = max(dp[l][r],
                    dp[l][k] + dp[k][r] + v[l] * v[k] * v[r])
    return dp[0][m - 1]                          # driver`,
      { base: "base zeros", transition: "transition", driver: "driver" },
    ),
    js: withAnchors(
`function maxCoins(nums) {
  const v = [1, ...nums, 1];
  const m = v.length;
  const dp = Array.from({ length: m }, () => new Array(m).fill(0)); // base zeros
  for (let width = 2; width < m; width++)
    for (let l = 0; l + width < m; l++) {
      const r = l + width;
      for (let k = l + 1; k < r; k++)           // transition
        dp[l][r] = Math.max(dp[l][r],
          dp[l][k] + dp[k][r] + v[l] * v[k] * v[r]);
    }
  return dp[0][m - 1];                          // driver
}`,
      { base: "base zeros", transition: "transition", driver: "driver" },
    ),
  },
};

export const burstBalloons: ProblemServiceDef = {
  slug: "burst-balloons",
  patternSlug: "dp-mcm",
  inputDescriptor: [
    { key: "nums", label: "BALLOON VALUES", kind: "array", min: 2, max: 8, valueRange: [1, 9] },
  ],
  schema,
  defaultInput: { nums: [3, 1, 5, 8] }, // LC312 → 167
  randomInput: () => ({
    nums: Array.from({ length: 2 + Math.floor(Math.random() * 5) }, () => 1 + Math.floor(Math.random() * 9)),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : genTab(input as In),
  codes,
};
