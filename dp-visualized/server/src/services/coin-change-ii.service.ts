import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Coin Change II (Striver DP-22): count COMBINATIONS of coins (order ignored,
 * unlimited supply of each denomination) summing to the target amount.
 * Table: rows = coin types considered (0..n), cols = amount (0..A).
 * dp[i][a] = dp[i-1][a] (skip coin i) + dp[i][a - c_i] (use one more coin i).
 */

const schema = z.object({
  coins: z.array(z.number().int().min(1).max(9)).min(1).max(6),
  amount: z.number().int().min(0).max(10),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  const work = Math.max(1, new Set(input.coins).size) * (input.amount + 1);
  if (mode === "bruteforce" && work > 40)
    return "Pure recursion enumerates every combination tree. Use fewer coins / smaller amount for Brute Force, or switch to Memoization.";
  return null;
}

/** Dedupe + sort so identical denominations aren't counted twice. */
function prep(input: In): { coins: number[]; deduped: boolean; amount: number } {
  const coins = [...new Set(input.coins)].sort((a, b) => a - b);
  return { coins, deduped: coins.length !== input.coins.length, amount: input.amount };
}

const AXIS = (n: number, A: number) => ({
  rowsTitle: "coin types",
  colsTitle: "amount",
  rowLabels: ["∅", ...Array.from({ length: n }, (_, i) => `c${i} `)],
  colLabels: Array.from({ length: A + 1 }, (_, a) => String(a)),
});

function genBrute(input: In): GeneratedTrace {
  const { coins, deduped, amount } = prep(input);
  const b = new TraceBuilder();
  if (deduped) b.push("base-case", [0, 0], "Duplicate denominations merged first — identical coins would inflate the count.", { codeAnchor: "driver" });
  let calls = 0;
  const seen = new Set<string>();

  /** f(i, a): ways to make `a` using coin types 0..i-1. */
  function f(i: number, a: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (a === 0) {
      b.push("base-case", [i, a], "Amount reached exactly → this combination counts once.", { callId, parentCallId, value: 1, codeAnchor: "base" });
      return 1;
    }
    if (i === 0) {
      b.push("base-case", [0, a], `No coin types left and amount ${a} remains → dead end.`, { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    const dup = seen.has(`${i},${a}`);
    b.push("recurse-call", [i, a],
      dup ? `f(${i},${a}) called AGAIN — overlapping subproblem.`
          : `f(${i},${a}) called: ways to form ${a} with coin types ≤ ${coins[i - 1]}.`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(`${i},${a}`);
    const skip = f(i - 1, a, callId);
    let use = 0;
    if (a >= coins[i - 1]) use = f(i, a - coins[i - 1], callId); // SAME i: supply unlimited
    const v = skip + use;
    const deps: number[][] = [[i - 1, a]];
    if (a >= coins[i - 1]) deps.push([i, a - coins[i - 1]]);
    b.push("recurse-return", [i, a], `f(${i},${a}) = skip ${skip} + use(${coins[i - 1]} again) ${use} = ${v}.`, {
      callId, parentCallId, value: v, deps, codeAnchor: "combine",
    });
    return v;
  }

  const answer = f(coins.length, amount);
  return {
    steps: b.steps,
    meta: {
      mode: "bruteforce",
      answer,
      answerLabel: "combinations",
      tableShape: null,
      axisLabels: null,
      valueFormat: "int",
      stats: { steps: b.count, calls },
    },
  };
}

function genMemo(input: In): GeneratedTrace {
  const { coins, deduped, amount } = prep(input);
  const n = coins.length;
  const b = new TraceBuilder();
  if (deduped) b.push("base-case", [0, 0], "Duplicate denominations merged first.", { codeAnchor: "driver" });
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, a: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i, a], `f(${i},${a}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (a === 0) {
      b.push("base-case", [i, 0], "Amount 0 → one way: pick nothing.", { callId, parentCallId, value: 1, codeAnchor: "base" });
      return 1;
    }
    if (i === 0) {
      b.push("base-case", [0, a], "No coin types left → 0 ways.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    const kk = `${i},${a}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [i, a], `Memo hit! f(${i},${a}) = ${v} fetched instantly.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    const skip = f(i - 1, a, callId);
    let use = 0;
    if (a >= coins[i - 1]) use = f(i, a - coins[i - 1], callId);
    const v = skip + use;
    memo.set(kk, v);
    const deps: number[][] = [[i - 1, a]];
    if (a >= coins[i - 1]) deps.push([i, a - coins[i - 1]]);
    b.push("recurse-return", [i, a], `f(${i},${a}) = ${skip} + ${use} = ${v}, stored in memo.`, {
      callId, parentCallId, value: v, deps, codeAnchor: "memoStore",
    });
    return v;
  }

  const answer = f(n, amount);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "combinations",
      tableShape: { rows: n + 1, cols: amount + 1 },
      axisLabels: AXIS(n, amount),
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const { coins, deduped, amount: A } = prep(input);
  const n = coins.length;
  const b = new TraceBuilder();
  if (deduped) b.push("base-case", [0, 0], "Duplicate denominations merged first.", { codeAnchor: "driver" });

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(A + 1).fill(-1));
  dp[0][0] = 1;
  b.push("base-case", [0, 0], "dp[0][0] = 1: one way to make 0 — choose no coins.", { value: 1, codeAnchor: "base" });
  for (let a = 1; a <= A; a++) {
    dp[0][a] = 0;
    b.push("base-case", [0, a], `No coin types available: dp[0][${a}] = 0.`, { value: 0, codeAnchor: "base" });
  }

  for (let i = 1; i <= n; i++) {
    const c = coins[i - 1];
    for (let a = 0; a <= A; a++) {
      const skip = dp[i - 1][a];
      const use = a >= c ? dp[i][a - c] : 0;
      const v = skip + use;
      const deps: number[][] = [[i - 1, a]];
      if (a >= c) deps.push([i, a - c]);
      b.push("table-write", [i, a],
        a >= c
          ? `With coin ${c}: dp[${i}][${a}] = skip (${skip}) + reuse same row at amount ${a - c} (${use}) = ${v}.`
          : `Coin ${c} too big for amount ${a}: dp[${i}][${a}] = carry down ${skip}.`,
        { value: v, deps, codeAnchor: "transition" });
      dp[i][a] = v;
    }
  }

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer: dp[n][A],
      answerLabel: "combinations",
      tableShape: { rows: n + 1, cols: A + 1 },
      axisLabels: AXIS(n, A),
      valueFormat: "int",
      stats: { steps: b.count, writes: (n + 1) * (A + 1) },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const { coins, deduped, amount: A } = prep(input);
  const n = coins.length;
  const b = new TraceBuilder();
  if (deduped) b.push("base-case", [0, 0], "Duplicate denominations merged first.", { codeAnchor: "driver" });

  const dp = new Array(A + 1).fill(0);
  dp[0] = 1;
  b.push("base-case", [0, 0], "Single array: dp[0] = 1, rest 0 — reused once per coin type.", { value: 1, codeAnchor: "init" });

  for (let i = 1; i <= n; i++) {
    const c = coins[i - 1];
    // left-to-right allows reusing the current coin (unbounded supply)
    for (let a = c; a <= A; a++) {
      const before = dp[a];
      dp[a] += dp[a - c];
      b.push("table-write", [i, a], `Coin ${c}: dp[${a}] += dp[${a - c}] → ${before} + ${dp[a] - before} = ${dp[a]} (left-to-right = unlimited supply).`, {
        value: dp[a],
        deps: [[i - 1, a], [i, a - c]],
        codeAnchor: "transition",
      });
    }
  }

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer: dp[A],
      answerLabel: "combinations",
      tableShape: { rows: n + 1, cols: A + 1 },
      axisLabels: AXIS(n, A),
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: 1 + n * A },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int i, int a, vector<int>& coins) {
    if (a == 0) return 1;                        // base
    if (i == 0) return 0;                        // base
    int skip = f(i - 1, a, coins);               // recurse
    int use = 0;
    if (a >= coins[i - 1])
        use = f(i, a - coins[i - 1], coins);     // same i: unlimited supply
    return skip + use;                           // combine
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int i, int a, int[] coins) {
    if (a == 0) return 1;                         // base
    if (i == 0) return 0;                         // base
    int skip = f(i - 1, a, coins);                // recurse
    int use = 0;
    if (a >= coins[i - 1])
        use = f(i, a - coins[i - 1], coins);      // same i: unlimited supply
    return skip + use;                            // combine
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(i, a, coins):
    if a == 0:                              # base
        return 1
    if i == 0:                              # base
        return 0
    skip = f(i - 1, a, coins)               # recurse
    use = 0
    if a >= coins[i - 1]:
        use = f(i, a - coins[i - 1], coins) # same i: unlimited supply
    return skip + use                       # combine
# anchor: driver
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: transition`,
      { base: "# base", recurse: "# recurse", combine: "# combine", driver: "# anchor: driver", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(i, a, coins) {
  if (a === 0) return 1;                    // base
  if (i === 0) return 0;                    // base
  const skip = f(i - 1, a, coins);          // recurse
  let use = 0;
  if (a >= coins[i - 1])
    use = f(i, a - coins[i - 1], coins);    // same i: unlimited supply
  return skip + use;                        // combine
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
`int f(int i, int a, vector<int>& coins, vector<vector<int>>& memo) {
    if (a == 0) return 1;                             // base
    if (i == 0) return 0;                             // base
    if (memo[i][a] != -1) return memo[i][a];          // memo check
    int skip = f(i - 1, a, coins, memo);
    int use = a >= coins[i - 1]
            ? f(i, a - coins[i - 1], coins, memo) : 0; // recurse
    return memo[i][a] = skip + use;                   // memo store
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
`static int f(int i, int a, int[] coins, int[][] memo) {
    if (a == 0) return 1;                              // base
    if (i == 0) return 0;                              // base
    if (memo[i][a] != -1) return memo[i][a];           // memo check
    int skip = f(i - 1, a, coins, memo);
    int use = a >= coins[i - 1]
            ? f(i, a - coins[i - 1], coins, memo) : 0; // recurse
    return memo[i][a] = skip + use;                    // memo store
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
`def f(i, a, coins, memo):
    if a == 0:                                   # base
        return 1
    if i == 0:                                   # base
        return 0
    if memo[i][a] != -1:                         # memo check
        return memo[i][a]
    skip = f(i - 1, a, coins, memo)
    use = f(i, a - coins[i - 1], coins, memo) if a >= coins[i - 1] else 0  # recurse
    memo[i][a] = skip + use
    return memo[i][a]                            # memo store
# anchor: combine
# anchor: driver
# anchor: init
# anchor: transition
# memoCheck
# memoStore`,
      { base: "# base", recurse: "# recurse", memoCheck: "# memoCheck", memoStore: "# memoStore", combine: "# anchor: combine", driver: "# anchor: driver", init: "# anchor: init", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(i, a, coins, memo) {
  if (a === 0) return 1;                            // base
  if (i === 0) return 0;                            // base
  if (memo[i][a] !== -1) return memo[i][a];         // memo check
  const skip = f(i - 1, a, coins, memo);
  const use = a >= coins[i - 1]
            ? f(i, a - coins[i - 1], coins, memo) : 0; // recurse
  memo[i][a] = skip + use;
  return memo[i][a];                                // memo store
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
`int change(int amount, vector<int>& coins) {
    int n = coins.size();
    vector<vector<long long>> dp(n + 1, vector<long long>(amount + 1, 0));
    dp[0][0] = 1;                                       // base
    for (int i = 1; i <= n; ++i)
        for (int a = 0; a <= amount; ++a) {
            dp[i][a] = dp[i - 1][a];                    // skip coin i-1
            if (a >= coins[i - 1])
                dp[i][a] += dp[i][a - coins[i - 1]];    // transition: reuse coin
        }
    return (int)dp[n][amount];
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
`static int change(int amount, int[] coins) {
    int n = coins.length;
    long[][] dp = new long[n + 1][amount + 1];
    dp[0][0] = 1;                                        // base
    for (int i = 1; i <= n; ++i)
        for (int a = 0; a <= amount; ++a) {
            dp[i][a] = dp[i - 1][a];                     // skip coin i-1
            if (a >= coins[i - 1])
                dp[i][a] += dp[i][a - coins[i - 1]];     // transition
        }
    return (int) dp[n][amount];
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
`def change(amount, coins):
    n = len(coins)
    dp = [[0] * (amount + 1) for _ in range(n + 1)]
    dp[0][0] = 1                                    # base
    for i in range(1, n + 1):
        for a in range(amount + 1):
            dp[i][a] = dp[i - 1][a]                 # skip coin i-1
            if a >= coins[i - 1]:
                dp[i][a] += dp[i][a - coins[i - 1]] # transition
    return dp[n][amount]
# anchor: combine
# anchor: driver
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", transition: "# transition", combine: "# anchor: combine", driver: "# anchor: driver", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function change(amount, coins) {
  const n = coins.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(amount + 1).fill(0));
  dp[0][0] = 1;                                        // base
  for (let i = 1; i <= n; i++)
    for (let a = 0; a <= amount; a++) {
      dp[i][a] = dp[i - 1][a];                         // skip coin i-1
      if (a >= coins[i - 1])
        dp[i][a] += dp[i][a - coins[i - 1]];           // transition
    }
  return dp[n][amount];
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
`int change(int amount, vector<int>& coins) {
    vector<long long> dp(amount + 1, 0);
    dp[0] = 1;                                      // init
    for (int c : coins)
        for (int a = c; a <= amount; ++a)           // left->right = unbounded
            dp[a] += dp[a - c];                     // transition
    return (int)dp[amount];
}
// anchor: base
// anchor: combine
// anchor: driver
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", driver: "// anchor: driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int change(int amount, int[] coins) {
    long[] dp = new long[amount + 1];
    dp[0] = 1;                                       // init
    for (int c : coins)
        for (int a = c; a <= amount; ++a)            // left->right = unbounded
            dp[a] += dp[a - c];                      // transition
    return (int) dp[amount];
}
// anchor: base
// anchor: combine
// anchor: driver
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", driver: "// anchor: driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def change(amount, coins):
    dp = [0] * (amount + 1)
    dp[0] = 1                                     # init
    for c in coins:
        for a in range(c, amount + 1):            # left->right = unbounded
            dp[a] += dp[a - c]                    # transition
    return dp[amount]
# anchor: base
# anchor: combine
# anchor: driver
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { init: "# init", transition: "# transition", base: "# anchor: base", combine: "# anchor: combine", driver: "# anchor: driver", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function change(amount, coins) {
  const dp = new Array(amount + 1).fill(0);
  dp[0] = 1;                                    // init
  for (const c of coins)
    for (let a = c; a <= amount; a++)           // left->right = unbounded
      dp[a] += dp[a - c];                       // transition
  return dp[amount];
}
// anchor: base
// anchor: combine
// anchor: driver
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", driver: "// anchor: driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
};

export const coinChangeII: ProblemServiceDef = {
  slug: "coin-change-ii",
  patternSlug: "dp-subsequences",
  inputDescriptor: [
    { key: "coins", label: "COINS", kind: "array", min: 1, max: 5, valueRange: [1, 9] },
    { key: "amount", label: "AMOUNT", kind: "number", min: 0, max: 10 },
  ],
  schema,
  defaultInput: { coins: [1, 2, 3], amount: 4 },
  randomInput: () => ({
    coins: Array.from({ length: 1 + Math.floor(Math.random() * 4) }, () => 1 + Math.floor(Math.random() * 9)),
    amount: 1 + Math.floor(Math.random() * 10),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : mode === "tabulation" ? genTab(input as In) : genSpace(input as In),
  codes,
};
