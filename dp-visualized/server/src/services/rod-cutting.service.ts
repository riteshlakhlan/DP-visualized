import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Rod Cutting (Striver DP-25 in the sheet's unbounded-knapsack family):
 * given piece prices for lengths 1..n, cut a rod of length n into pieces
 * maximising total price. Unbounded supply of each piece length.
 * f(len) = max over first-piece k of price[k] + f(len - k).
 */

const schema = z.object({
  prices: z.array(z.number().int().min(1).max(9)).min(2).max(8),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  const n = input.prices.length;
  if (mode === "bruteforce" && Math.pow(n, n) > 20000)
    return "Pure recursion branches once per piece length at every level. Use at most 7 lengths for Brute Force.";
  return null;
}

const AXIS = (n: number) => ({
  rowsTitle: "state",
  colsTitle: "remaining rod length",
  rowLabels: ["f(len)"],
  colLabels: Array.from({ length: n + 1 }, (_, i) => String(i)),
});

function genBrute(input: In): GeneratedTrace {
  const prices = input.prices;
  const n = prices.length;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<number>();

  function f(len: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (len === 0) {
      b.push("base-case", [0], "No rod left to sell → profit 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    const dup = seen.has(len);
    b.push("recurse-call", [len],
      dup ? `f(${len}) called AGAIN — same remaining length solved elsewhere.`
          : `f(${len}) called: best price obtainable from ${len} units of rod.`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(len);
    const parts: string[] = [];
    const deps: number[][] = [];
    let best = 0;
    for (let k = 1; k <= Math.min(len, n); k++) {
      const sub = f(len - k, callId);
      const cand = prices[k - 1] + sub;
      parts.push(`piece ${k}: ${prices[k - 1]}+${sub}`);
      deps.push([Math.max(0, len - k)]);
      if (cand > best) best = cand;
    }
    b.push("recurse-return", [len], `f(${len}) = max(${parts.join(", ")}) = ${best}.`, {
      callId, parentCallId, value: best, deps, codeAnchor: "combine",
    });
    return best;
  }

  const answer = f(n);
  return {
    steps: b.steps,
    meta: {
      mode: "bruteforce",
      answer,
      answerLabel: "maximum price",
      tableShape: null,
      axisLabels: null,
      valueFormat: "int",
      stats: { steps: b.count, calls },
    },
  };
}

function genMemo(input: In): GeneratedTrace {
  const prices = input.prices;
  const n = prices.length;
  const b = new TraceBuilder();
  const memo = new Map<number, number>();
  let calls = 0;
  let hits = 0;

  function f(len: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [len], `f(${len}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (len === 0) {
      b.push("base-case", [0], "Base case: f(0) = 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    if (memo.has(len)) {
      hits++;
      const v = memo.get(len)!;
      b.push("memo-hit", [len], `Memo hit! f(${len}) = ${v} fetched instantly.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    const parts: string[] = [];
    const deps: number[][] = [];
    let best = 0;
    for (let k = 1; k <= Math.min(len, n); k++) {
      const sub = f(len - k, callId);
      const cand = prices[k - 1] + sub;
      parts.push(`${prices[k - 1]}+${sub}`);
      deps.push([Math.max(0, len - k)]);
      if (cand > best) best = cand;
    }
    memo.set(len, best);
    b.push("recurse-return", [len], `f(${len}) = max(${parts.join(", ")}) = ${best}, stored in memo.`, {
      callId, parentCallId, value: best, deps, codeAnchor: "memoStore",
    });
    return best;
  }

  const answer = f(n);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "maximum price",
      tableShape: { rows: 1, cols: n + 1 },
      axisLabels: AXIS(n),
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const prices = input.prices;
  const n = prices.length;
  const b = new TraceBuilder();
  const dp: number[] = new Array(n + 1).fill(-1);
  dp[0] = 0;
  b.push("base-case", [0], "dp[0] = 0 — an empty rod earns nothing.", { value: 0, codeAnchor: "base" });

  for (let len = 1; len <= n; len++) {
    const parts: string[] = [];
    const deps: number[][] = [];
    let best = 0;
    let bestK = 0;
    for (let k = 1; k <= Math.min(len, n); k++) {
      const cand = prices[k - 1] + dp[len - k];
      parts.push(`cut ${k}: ${prices[k - 1]}+dp[${len - k}]=${cand}`);
      deps.push([Math.max(0, len - k)]);
      if (cand > best) { best = cand; bestK = k; }
    }
    b.push("table-write", [len],
      `dp[${len}] = max(${parts.join(", ")}) → best first cut is ${bestK} → ${best}.`,
      { value: best, deps, codeAnchor: "transition" });
    dp[len] = best;
  }

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer: dp[n],
      answerLabel: "maximum price",
      tableShape: { rows: 1, cols: n + 1 },
      axisLabels: AXIS(n),
      valueFormat: "int",
      stats: { steps: b.count, writes: n + 1 },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const prices = input.prices;
  const n = prices.length;
  const b = new TraceBuilder();

  // unbounded knapsack style: dp[a] = best price for rod of length a
  const dp = new Array(n + 1).fill(0);
  b.push("base-case", [0], "Single array initialised to 0 — one entry per remaining length.", { value: 0, codeAnchor: "init" });

  for (let len = 1; len <= n; len++) {
    let best = 0;
    const deps: number[][] = [];
    for (let k = 1; k <= Math.min(len, n); k++) {
      const cand = prices[k - 1] + dp[len - k];
      deps.push([Math.max(0, len - k)]);
      if (cand > best) best = cand;
    }
    dp[len] = best;
    b.push("table-write", [len], `dp[${len}] = ${best}; only smaller lengths are ever consulted, so one array suffices.`, {
      value: best,
      deps,
      codeAnchor: "transition",
    });
  }

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer: dp[n],
      answerLabel: "maximum price",
      tableShape: { rows: 1, cols: n + 1 },
      axisLabels: AXIS(n),
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: n + 1 },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int len, vector<int>& p) {
    if (len == 0) return 0;                    // base
    int best = 0;
    for (int k = 1; k <= min(len, (int)p.size()); ++k)   // recurse
        best = max(best, p[k - 1] + f(len - k, p));
    return best;                               // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int len, int[] p) {
    if (len == 0) return 0;                     // base
    int best = 0;
    for (int k = 1; k <= Math.min(len, p.length); ++k)    // recurse
        best = Math.max(best, p[k - 1] + f(len - k, p));
    return best;                                // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(length, p):
    if length == 0:                       # base
        return 0
    best = 0
    for k in range(1, min(length, len(p)) + 1):    # recurse
        best = max(best, p[k - 1] + f(length - k, p))
    return best                           # combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: transition`,
      { base: "# base", recurse: "# recurse", combine: "# combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(len, p) {
  if (len === 0) return 0;                  // base
  let best = 0;
  for (let k = 1; k <= Math.min(len, p.length); k++)  // recurse
    best = Math.max(best, p[k - 1] + f(len - k, p));
  return best;                              // combine
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
`int f(int len, vector<int>& p, vector<int>& memo) {
    if (len == 0) return 0;                       // base
    if (memo[len] != -1) return memo[len];        // memo check
    int best = 0;
    for (int k = 1; k <= min(len, (int)p.size()); ++k)
        best = max(best, p[k - 1] + f(len - k, p, memo)); // recurse
    return memo[len] = best;                      // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int len, int[] p, int[] memo) {
    if (len == 0) return 0;                        // base
    if (memo[len] != -1) return memo[len];         // memo check
    int best = 0;
    for (int k = 1; k <= Math.min(len, p.length); ++k)
        best = Math.max(best, p[k - 1] + f(len - k, p, memo)); // recurse
    return memo[len] = best;                       // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(length, p, memo):
    if length == 0:                          # base
        return 0
    if memo[length] != -1:                   # memo check
        return memo[length]
    best = 0
    for k in range(1, min(length, len(p)) + 1):        # recurse
        best = max(best, p[k - 1] + f(length - k, p, memo))
    memo[length] = best
    return best                              # memo store
# anchor: combine
# anchor: init
# anchor: transition
# memoCheck
# memoStore`,
      { base: "# base", recurse: "# recurse", memoCheck: "# memoCheck", memoStore: "# memoStore", combine: "# anchor: combine", init: "# anchor: init", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(len, p, memo) {
  if (len === 0) return 0;                     // base
  if (memo[len] !== -1) return memo[len];      // memo check
  let best = 0;
  for (let k = 1; k <= Math.min(len, p.length); k++)     // recurse
    best = Math.max(best, p[k - 1] + f(len - k, p, memo));
  memo[len] = best;
  return memo[len];                            // memo store
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
`int rodCutting(vector<int>& p) {
    int n = p.size();
    vector<int> dp(n + 1, 0);
    // base: dp[0] = 0
    for (int len = 1; len <= n; ++len) {
        for (int k = 1; k <= min(len, n); ++k)           // transition
            dp[len] = max(dp[len], p[k - 1] + dp[len - k]);
    }
    return dp[n];
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int rodCutting(int[] p) {
    int n = p.length;
    int[] dp = new int[n + 1];
    // base: dp[0] = 0
    for (int len = 1; len <= n; ++len)
        for (int k = 1; k <= Math.min(len, n); ++k)       // transition
            dp[len] = Math.max(dp[len], p[k - 1] + dp[len - k]);
    return dp[n];
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def rod_cutting(p):
    n = len(p)
    dp = [0] * (n + 1)
    # base: dp[0] = 0 stays
    for length in range(1, n + 1):
        for k in range(1, min(length, n) + 1):     # transition
            dp[length] = max(dp[length], p[k - 1] + dp[length - k])
    return dp[n]
# anchor: combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", transition: "# transition", combine: "# anchor: combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function rodCutting(p) {
  const n = p.length;
  const dp = new Array(n + 1).fill(0);
  // base: dp[0] = 0
  for (let len = 1; len <= n; len++)
    for (let k = 1; k <= Math.min(len, n); k++)   // transition
      dp[len] = Math.max(dp[len], p[k - 1] + dp[len - k]);
  return dp[n];
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
`// The tabulation above already uses O(n); the classic "space optimised"
// form writes each dp[len] from smaller entries in place.
int rodCutting(vector<int>& p) {
    int n = p.size();
    vector<int> dp(n + 1, 0);                 // init
    for (int len = 1; len <= n; ++len)
        for (int k = 1; k <= min(len, n); ++k)
            dp[len] = max(dp[len], p[k - 1] + dp[len - k]); // transition
    return dp[n];
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int rodCutting(int[] p) {
    int n = p.length;
    int[] dp = new int[n + 1];                // init
    for (int len = 1; len <= n; ++len)
        for (int k = 1; k <= Math.min(len, n); ++k)
            dp[len] = Math.max(dp[len], p[k - 1] + dp[len - k]); // transition
    return dp[n];
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def rod_cutting(p):
    n = len(p)
    dp = [0] * (n + 1)                        # init
    for length in range(1, n + 1):
        for k in range(1, min(length, n) + 1):
            dp[length] = max(dp[length], p[k - 1] + dp[length - k])  # transition
    return dp[n]
# anchor: base
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { init: "# init", transition: "# transition", base: "# anchor: base", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function rodCutting(p) {
  const n = p.length;
  const dp = new Array(n + 1).fill(0);     // init
  for (let len = 1; len <= n; len++)
    for (let k = 1; k <= Math.min(len, n); k++)
      dp[len] = Math.max(dp[len], p[k - 1] + dp[len - k]); // transition
  return dp[n];
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

export const rodCutting: ProblemServiceDef = {
  slug: "rod-cutting",
  patternSlug: "dp-subsequences",
  inputDescriptor: [
    { key: "prices", label: "PIECE PRICES (LEN 1..N)", kind: "array", min: 2, max: 8, valueRange: [1, 9] },
  ],
  schema,
  defaultInput: { prices: [2, 5, 7, 8, 9] }, // classic Striver example → 12 (cut lengths 2 + 3)
  randomInput: () => ({
    prices: Array.from({ length: 2 + Math.floor(Math.random() * 6) }, () => 1 + Math.floor(Math.random() * 9)),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : mode === "tabulation" ? genTab(input as In) : genSpace(input as In),
  codes,
};
