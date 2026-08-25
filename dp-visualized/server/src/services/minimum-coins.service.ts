import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Minimum Coins / Coin Change (Striver DP-20, unbounded knapsack family).
 * dp[t] = fewest coins summing exactly to t.
 * Note: no separate space-optimized variant — it is already a 1D table.
 */

const schema = z.object({
  coins: z.array(z.number().int().min(1).max(15)).min(1).max(5),
  amount: z.number().int().min(0).max(30),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && input.amount > 14)
    return "Pure recursion branches once per coin per unit of amount. Keep amount <= 14 for Brute Force.";
  if (mode === "spaceOptimized")
    return null; // handled via supportsMode in the registry
  return null;
}

function genBrute(input: In): GeneratedTrace {
  const { coins, amount } = input;
  const b = new TraceBuilder();
  let calls = 0;
  const solved = new Map<number, number>();

  function f(rem: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (rem === 0) {
      b.push("recurse-call", [0], "f(0) called — amount fully formed.", { callId, parentCallId, codeAnchor: "base" });
      b.push("base-case", [0], "Base case: 0 coins make amount 0.", { callId, parentCallId, value: 0 });
      return 0;
    }
    const dup = solved.has(rem);
    b.push("recurse-call", [rem],
      dup ? `f(${rem}) reached again through different coin orders — subtree repeats (collapsed).`
          : `f(${rem}) called: try ending with each coin c ∈ {${coins.join(", ")}}.`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    if (dup) {
      const v = solved.get(rem)!;
      b.push("recurse-return", [rem], `f(${rem}) = ${v} (already known).`, { callId, parentCallId, value: v });
      return v;
    }
    let best = Infinity;
    for (const c of coins) {
      if (c <= rem) {
        best = Math.min(best, 1 + f(rem - c, callId));
      }
    }
    b.push("recurse-return", [rem], `f(${rem}) = 1 + min over usable coins = ${best === Infinity ? "∞" : best}.`, {
      callId,
      parentCallId,
      value: best,
      deps: coins.filter((c) => c <= rem).map((c) => [rem - c] as number[]),
      codeAnchor: "combine",
    });
    solved.set(rem, best);
    return best;
  }

  const answer = f(amount);
  return {
    steps: b.steps,
    meta: {
      mode: "bruteforce",
      answer: answer === Infinity ? -1 : answer,
      answerLabel: `fewest coins for ${amount}`,
      tableShape: null,
      axisLabels: null,
      valueFormat: "int",
      stats: { steps: b.count, calls },
    },
  };
}

function genMemo(input: In): GeneratedTrace {
  const { coins, amount } = input;
  const b = new TraceBuilder();
  const memo = new Map<number, number>();
  let calls = 0;
  let hits = 0;

  function f(rem: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [rem], `f(${rem}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (rem === 0) {
      b.push("base-case", [0], "Base case: 0 coins make amount 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    if (memo.has(rem)) {
      hits++;
      const v = memo.get(rem)!;
      b.push("memo-hit", [rem], `Memo hit! f(${rem}) = ${v}.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    let best = Infinity;
    for (const c of coins) if (c <= rem) best = Math.min(best, 1 + f(rem - c, callId));
    memo.set(rem, best);
    b.push("recurse-return", [rem], `f(${rem}) = ${best === Infinity ? "∞" : best}, stored in memo.`, {
      callId,
      parentCallId,
      value: best,
      deps: coins.filter((c) => c <= rem).map((c) => [rem - c] as number[]),
      codeAnchor: "memoStore",
    });
    return best;
  }

  const answer = f(amount);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer: answer === Infinity ? -1 : answer,
      answerLabel: `fewest coins for ${amount}`,
      tableShape: { rows: 1, cols: amount + 1 },
      axisLabels: { rowsTitle: "state", colsTitle: "amount t", rowLabels: ["dp[t]"] },
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const { coins, amount } = input;
  const b = new TraceBuilder();
  const INF = Infinity;
  const dp: number[] = new Array(amount + 1).fill(-1);
  dp[0] = 0;
  b.push("base-case", [0], "dp[0] = 0 — zero coins make zero.", { value: 0, codeAnchor: "base" });

  for (let t = 1; t <= amount; t++) {
    let best = INF;
    const deps: number[][] = [];
    const usedCoins: string[] = [];
    for (const c of coins)
      if (c <= t && dp[t - c] !== -1) {
        deps.push([t - c]);
        usedCoins.push(`${c}→1+${dp[t - c]}`);
        if (dp[t - c] !== INF) best = Math.min(best, 1 + dp[t - c]);
      }
    const v = best === INF ? -1 : best;
    dp[t] = v;
    b.push("table-write", [t],
      `dp[${t}] = 1 + min(${usedCoins.length ? usedCoins.join(", ") : "—"}) = ${v === -1 ? "impossible (-1)" : v}.`,
      { value: v, deps, codeAnchor: "transition" });
  }
  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer: dp[amount],
      answerLabel: `fewest coins for ${amount}`,
      tableShape: { rows: 1, cols: amount + 1 },
      axisLabels: { rowsTitle: "state", colsTitle: "amount t", rowLabels: ["dp[t]"] },
      valueFormat: "int",
      stats: { steps: b.count, writes: amount + 1 },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int rem, vector<int>& coins) {
    if (rem == 0) return 0;              // base
    int best = INT_MAX;
    for (int c : coins)
        if (c <= rem) {
            int sub = f(rem - c, coins); // recurse
            if (sub != INT_MAX) best = min(best, 1 + sub);
        }
    return best;                         // combine
}
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int rem, int[] coins) {
    if (rem == 0) return 0;              // base
    int best = Integer.MAX_VALUE;
    for (int c : coins)
        if (c <= rem) {
            int sub = f(rem - c, coins); // recurse
            if (sub != Integer.MAX_VALUE) best = Math.min(best, 1 + sub);
        }
    return best;                         // combine
}
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(rem, coins):
    if rem == 0:                   # base
        return 0
    best = math.inf
    for c in coins:
        if c <= rem:
            sub = f(rem - c, coins)   # recurse
            if sub != math.inf:
                best = min(best, 1 + sub)
    return best                    # combine
# anchor: memoCheck
# anchor: memoStore
# anchor: transition`,
      { base: "# base", recurse: "# recurse", combine: "# combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(rem, coins) {
  if (rem === 0) return 0;             // base
  let best = Infinity;
  for (const c of coins)
    if (c <= rem) {
      const sub = f(rem - c, coins);   // recurse
      if (sub !== Infinity) best = Math.min(best, 1 + sub);
    }
  return best;                         // combine
}
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int rem, vector<int>& coins, vector<int>& memo) {
    if (rem == 0) return 0;                 // base
    if (memo[rem] != -1) return memo[rem];  // memo check
    int best = INT_MAX;
    for (int c : coins)
        if (c <= rem) {
            int sub = f(rem - c, coins, memo);
            if (sub != INT_MAX) best = min(best, 1 + sub);
        }
    memo[rem] = best;                       // memo store
    return best;
}
// anchor: combine
// anchor: recurse
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", recurse: "// anchor: recurse", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int rem, int[] coins, int[] memo) {
    if (rem == 0) return 0;                 // base
    if (memo[rem] != -1) return memo[rem];  // memo check
    int best = Integer.MAX_VALUE;
    for (int c : coins)
        if (c <= rem) {
            int sub = f(rem - c, coins, memo);
            if (sub != Integer.MAX_VALUE) best = Math.min(best, 1 + sub);
        }
    memo[rem] = best;                       // memo store
    return best;
}
// anchor: combine
// anchor: recurse
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", recurse: "// anchor: recurse", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(rem, coins, memo):
    if rem == 0:                     # base
        return 0
    if memo[rem] != -1:              # memo check
        return memo[rem]
    best = math.inf
    for c in coins:
        if c <= rem:
            sub = f(rem - c, coins, memo)
            if sub != math.inf:
                best = min(best, 1 + sub)
    memo[rem] = best
    return best                      # memo store
# anchor: combine
# anchor: recurse
# anchor: transition
# memoCheck
# memoStore`,
      { base: "# base", memoCheck: "# memoCheck", memoStore: "# memoStore", combine: "# anchor: combine", recurse: "# anchor: recurse", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(rem, coins, memo) {
  if (rem === 0) return 0;                // base
  if (memo[rem] !== -1) return memo[rem]; // memo check
  let best = Infinity;
  for (const c of coins)
    if (c <= rem) {
      const sub = f(rem - c, coins, memo);
      if (sub !== Infinity) best = Math.min(best, 1 + sub);
    }
  memo[rem] = best;
  return best;                            // memo store
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
`int minCoins(vector<int>& coins, int amount) {
    vector<int> dp(amount + 1, -1);
    dp[0] = 0;                                   // base
    for (int t = 1; t <= amount; ++t) {
        int best = INT_MAX;
        for (int c : coins)
            if (c <= t && dp[t - c] != -1)
                best = min(best, 1 + dp[t - c]); // transition
        dp[t] = (best == INT_MAX) ? -1 : best;
    }
    return dp[amount];
}
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int minCoins(int[] coins, int amount) {
    int[] dp = new int[amount + 1];
    Arrays.fill(dp, -1);
    dp[0] = 0;                                   // base
    for (int t = 1; t <= amount; ++t) {
        int best = Integer.MAX_VALUE;
        for (int c : coins)
            if (c <= t && dp[t - c] != -1)
                best = Math.min(best, 1 + dp[t - c]);   // transition
        dp[t] = (best == Integer.MAX_VALUE) ? -1 : best;
    }
    return dp[amount];
}
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def min_coins(coins, amount):
    dp = [-1] * (amount + 1)
    dp[0] = 0                                     # base
    for t in range(1, amount + 1):
        best = math.inf
        for c in coins:
            if c <= t and dp[t - c] != -1:
                best = min(best, 1 + dp[t - c])   # transition
        dp[t] = -1 if best == math.inf else best
    return dp[amount]
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", transition: "# transition", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function minCoins(coins, amount) {
  const dp = new Array(amount + 1).fill(-1);
  dp[0] = 0;                                        // base
  for (let t = 1; t <= amount; t++) {
    let best = Infinity;
    for (const c of coins)
      if (c <= t && dp[t - c] !== -1)
        best = Math.min(best, 1 + dp[t - c]);       // transition
    dp[t] = best === Infinity ? -1 : best;
  }
  return dp[amount];
}
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
};

export const minimumCoins: ProblemServiceDef = {
  slug: "minimum-coins",
  patternSlug: "dp-subsequences",
  inputDescriptor: [
    { key: "coins", label: "COINS", kind: "array", min: 1, max: 4, valueRange: [1, 12] },
    { key: "amount", label: "AMOUNT", kind: "number", min: 0, max: 24 },
  ],
  schema,
  defaultInput: { coins: [1, 2, 5], amount: 11 },
  randomInput: () => ({
    coins: Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => 1 + Math.floor(Math.random() * 9)),
    amount: 6 + Math.floor(Math.random() * 12),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : genTab(input as In),
  codes,
};
