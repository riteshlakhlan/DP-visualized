import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Best Time to Buy and Sell Stock I (Striver DP-35): one buy then one later
 * sell; maximise profit. Greedy min-price-so-far — but we present it as the
 * 1D DP it is: best[i] = max profit using days 0..i.
 */

const schema = z.object({
  prices: z.array(z.number().int().min(1).max(99)).min(2).max(10),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && input.prices.length > 8)
    return "Brute force checks every buy/sell pair (O(n^2)). Use at most 8 days, or switch to Memoization.";
  return null;
}

const AXIS = { rowsTitle: "state", colsTitle: "day", rowLabels: ["best(i)"] };

function genBrute(input: In): GeneratedTrace {
  const p = input.prices;
  const n = p.length;
  const b = new TraceBuilder();
  let calls = 0;

  /** maxProfit(i): best single-transaction profit with sell day <= i. */
  function f(i: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i === 0) {
      b.push("recurse-call", [0], "f(0) called — only day 0, no earlier day to buy on.", { callId, parentCallId, codeAnchor: "base" });
      b.push("base-case", [0], "Base case: one day → profit 0 (never transact).", { callId, value: 0, codeAnchor: "base" });
      return 0;
    }
    b.push("recurse-call", [i], `f(${i}) called: best profit selling on or before day ${i} (price ${p[i]}).`, { callId, parentCallId, codeAnchor: "recurse" });
    // try selling exactly on day i against every earlier buy day
    let bestSellToday = 0;
    for (let j = 0; j < i; j++) {
      const cand = p[i] - p[j];
      if (cand > bestSellToday) bestSellToday = cand;
    }
    const rest = f(i - 1, callId);
    const v = Math.max(rest, bestSellToday);
    b.push("recurse-return", [i], `f(${i}) = max(best before: ${rest}, sell today: ${bestSellToday}) = ${v}.`, {
      callId,
      parentCallId,
      value: v,
      deps: [[Math.max(0, i - 1)]],
      codeAnchor: "combine",
    });
    return v;
  }

  const answer = f(n - 1);
  return {
    steps: b.steps,
    meta: {
      mode: "bruteforce",
      answer,
      answerLabel: "max profit",
      tableShape: null,
      axisLabels: null,
      valueFormat: "int",
      stats: { steps: b.count, calls },
    },
  };
}

function genMemo(input: In): GeneratedTrace {
  const p = input.prices;
  const n = p.length;
  const b = new TraceBuilder();
  const memo = new Map<number, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i], `f(${i}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (i === 0) {
      b.push("base-case", [0], "Base case: f(0) = 0.", { callId, value: 0, codeAnchor: "base" });
      return 0;
    }
    if (memo.has(i)) {
      hits++;
      const v = memo.get(i)!;
      b.push("memo-hit", [i], `Memo hit! f(${i}) = ${v}.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    let bestSellToday = 0;
    for (let j = 0; j < i; j++) bestSellToday = Math.max(bestSellToday, p[i] - p[j]);
    const v = Math.max(f(i - 1, callId), bestSellToday);
    memo.set(i, v);
    b.push("recurse-return", [i], `f(${i}) = ${v}, stored in memo.`, {
      callId, parentCallId, value: v, deps: [[i - 1]], codeAnchor: "memoStore",
    });
    return v;
  }

  const answer = f(n - 1);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "max profit",
      tableShape: { rows: 1, cols: n },
      axisLabels: AXIS,
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const p = input.prices;
  const n = p.length;
  const b = new TraceBuilder();

  // track running minimum price alongside the DP row
  let minPrice = p[0];
  const dp: number[] = new Array(n).fill(-1);
  dp[0] = 0;
  b.push("base-case", [0], `dp[0] = 0; running minimum starts at price[0] = ${minPrice}.`, { value: 0, codeAnchor: "base" });

  for (let i = 1; i < n; i++) {
    const sellToday = p[i] - minPrice;
    const v = Math.max(dp[i - 1], sellToday);
    const oldMin = minPrice;
    if (p[i] < minPrice) minPrice = p[i];
    b.push("table-write", [i],
      `dp[${i}] = max(dp[${i - 1}]=${dp[i - 1]}, sell today ${p[i]} − min ${oldMin} = ${sellToday}) = ${v}` +
      (p[i] < oldMin ? `; new minimum price recorded (${p[i]}).` : "."),
      { value: v, deps: [[i - 1]], codeAnchor: "transition" });
    dp[i] = v;
  }

  const answer = dp[n - 1];
  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "max profit",
      tableShape: { rows: 1, cols: n },
      axisLabels: AXIS,
      valueFormat: "int",
      stats: { steps: b.count, writes: n },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const p = input.prices;
  const n = p.length;
  const b = new TraceBuilder();

  let best = 0;
  let minPrice = p[0];
  b.push("base-case", [0], "Two variables replace the array: best = 0, minPrice = prices[0].", { value: 0, codeAnchor: "init" });

  for (let i = 1; i < n; i++) {
    const cand = p[i] - minPrice;
    const prevBest = best;
    if (cand > best) best = cand;
    if (p[i] < minPrice) minPrice = p[i];
    b.push("table-write", [i],
      `Day ${i}: profit-if-sold-today = ${p[i]} − ${minPrice === p[i] ? p[i] : minPrice} = ${cand}; best = max(${prevBest}, ${cand}) = ${best}.`,
      { value: best, deps: [[Math.max(0, i - 1)]], codeAnchor: "transition" });
  }

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer: best,
      answerLabel: "max profit",
      tableShape: { rows: 1, cols: n },
      axisLabels: AXIS,
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: n },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int i, vector<int>& p) {
    if (i == 0) return 0;                        // base
    int bestSellToday = 0;
    for (int j = 0; j < i; ++j)                  // recurse
        bestSellToday = max(bestSellToday, p[i] - p[j]);
    return max(f(i - 1, p), bestSellToday);      // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int i, int[] p) {
    if (i == 0) return 0;                         // base
    int bestSellToday = 0;
    for (int j = 0; j < i; ++j)                   // recurse
        bestSellToday = Math.max(bestSellToday, p[i] - p[j]);
    return Math.max(f(i - 1, p), bestSellToday);  // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(i, p):
    if i == 0:                              # base
        return 0
    best_sell_today = 0
    for j in range(i):                      # recurse
        best_sell_today = max(best_sell_today, p[i] - p[j])
    return max(f(i - 1, p), best_sell_today)   # combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: transition`,
      { base: "# base", recurse: "# recurse", combine: "# combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(i, p) {
  if (i === 0) return 0;                     // base
  let bestSellToday = 0;
  for (let j = 0; j < i; j++)                // recurse
    bestSellToday = Math.max(bestSellToday, p[i] - p[j]);
  return Math.max(f(i - 1, p), bestSellToday); // combine
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
`int f(int i, vector<int>& p, vector<int>& memo) {
    if (i == 0) return 0;                          // base
    if (memo[i] != -1) return memo[i];             // memo check
    int bestSellToday = 0;
    for (int j = 0; j < i; ++j)
        bestSellToday = max(bestSellToday, p[i] - p[j]); // recurse
    return memo[i] = max(f(i - 1, p, memo), bestSellToday); // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int i, int[] p, int[] memo) {
    if (i == 0) return 0;                           // base
    if (memo[i] != -1) return memo[i];              // memo check
    int bestSellToday = 0;
    for (int j = 0; j < i; ++j)
        bestSellToday = Math.max(bestSellToday, p[i] - p[j]); // recurse
    return memo[i] = Math.max(f(i - 1, p, memo), bestSellToday); // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(i, p, memo):
    if i == 0:                                 # base
        return 0
    if memo[i] != -1:                          # memo check
        return memo[i]
    best_sell_today = 0
    for j in range(i):
        best_sell_today = max(best_sell_today, p[i] - p[j])  # recurse
    memo[i] = max(f(i - 1, p, memo), best_sell_today)
    return memo[i]                             # memo store
# anchor: combine
# anchor: init
# anchor: transition
# memoCheck
# memoStore`,
      { base: "# base", recurse: "# recurse", memoCheck: "# memoCheck", memoStore: "# memoStore", combine: "# anchor: combine", init: "# anchor: init", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(i, p, memo) {
  if (i === 0) return 0;                         // base
  if (memo[i] !== -1) return memo[i];            // memo check
  let bestSellToday = 0;
  for (let j = 0; j < i; j++)
    bestSellToday = Math.max(bestSellToday, p[i] - p[j]); // recurse
  memo[i] = Math.max(f(i - 1, p, memo), bestSellToday);
  return memo[i];                                // memo store
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
`int maxProfit(vector<int>& p) {
    int n = p.size(), minPrice = p[0];
    vector<int> dp(n);
    dp[0] = 0;                                          // base
    for (int i = 1; i < n; ++i) {
        dp[i] = max(dp[i - 1], p[i] - minPrice);         // transition
        minPrice = min(minPrice, p[i]);                  // track running min
    }
    return dp[n - 1];
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int maxProfit(int[] p) {
    int n = p.length, minPrice = p[0];
    int[] dp = new int[n];
    dp[0] = 0;                                           // base
    for (int i = 1; i < n; ++i) {
        dp[i] = Math.max(dp[i - 1], p[i] - minPrice);     // transition
        minPrice = Math.min(minPrice, p[i]);
    }
    return dp[n - 1];
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def max_profit(p):
    n = len(p)
    min_price = p[0]
    dp = [0] * n
    dp[0] = 0                                        # base
    for i in range(1, n):
        dp[i] = max(dp[i - 1], p[i] - min_price)     # transition
        min_price = min(min_price, p[i])
    return dp[-1]
# anchor: combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", transition: "# transition", combine: "# anchor: combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function maxProfit(p) {
  const n = p.length;
  let minPrice = p[0];
  const dp = new Array(n);
  dp[0] = 0;                                        // base
  for (let i = 1; i < n; i++) {
    dp[i] = Math.max(dp[i - 1], p[i] - minPrice);   // transition
    minPrice = Math.min(minPrice, p[i]);
  }
  return dp[n - 1];
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
`int maxProfit(vector<int>& p) {
    int best = 0, minPrice = p[0];          // init
    for (int i = 1; i < (int)p.size(); ++i) {
        best = max(best, p[i] - minPrice);  // transition
        minPrice = min(minPrice, p[i]);
    }
    return best;
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int maxProfit(int[] p) {
    int best = 0, minPrice = p[0];           // init
    for (int i = 1; i < p.length; ++i) {
        best = Math.max(best, p[i] - minPrice); // transition
        minPrice = Math.min(minPrice, p[i]);
    }
    return best;
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def max_profit(p):
    best = 0                                  # init
    min_price = p[0]
    for x in p[1:]:
        best = max(best, x - min_price)       # transition
        min_price = min(min_price, x)
    return best
# anchor: base
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { init: "# init", transition: "# transition", base: "# anchor: base", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function maxProfit(p) {
  let best = 0, minPrice = p[0];           // init
  for (let i = 1; i < p.length; i++) {
    best = Math.max(best, p[i] - minPrice); // transition
    minPrice = Math.min(minPrice, p[i]);
  }
  return best;
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

export const stockI: ProblemServiceDef = {
  slug: "stock-i",
  patternSlug: "dp-stocks",
  inputDescriptor: [
    { key: "prices", label: "PRICES / DAY", kind: "array", min: 2, max: 10, valueRange: [1, 20] },
  ],
  schema,
  defaultInput: { prices: [7, 1, 5, 3, 6, 4] }, // LeetCode classic → 5
  randomInput: () => ({
    prices: Array.from({ length: 3 + Math.floor(Math.random() * 7) }, () => 1 + Math.floor(Math.random() * 20)),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : mode === "tabulation" ? genTab(input as In) : genSpace(input as In),
  codes,
};
