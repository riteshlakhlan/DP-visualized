import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Buy and Sell Stock II (Striver DP-36): UNLIMITED transactions.
 * State machine per day: dp[i][0] = best cash NOT holding after day i,
 * dp[i][1] = best cash HOLDING after day i.
 *   dp[i][0] = max(dp[i-1][0], dp[i-1][1] + price[i])   // rest or sell
 *   dp[i][1] = max(dp[i-1][1], dp[i-1][0] − price[i])   // rest or buy
 */

const schema = z.object({
  prices: z.array(z.number().int().min(0).max(20)).min(2).max(8),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && input.prices.length > 7)
    return "Pure recursion branches buy/sell/rest every day. Use at most 7 days for Brute Force.";
  return null;
}

const AXIS = {
  rowsTitle: "day",
  colsTitle: "end-of-day state",
  colLabels: ["not holding", "holding"],
};

const HOLD_COL = 1;

function genBrute(input: In): GeneratedTrace {
  const p = input.prices;
  const n = p.length;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<string>();

  function f(i: number, holding: boolean, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    const c = holding ? HOLD_COL : 0;
    if (i === n) {
      b.push("base-case", [n, c], "All days gone — holding stock now would be pointless, so best is 0 cash.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    const dup = seen.has(`${i},${c}`);
    b.push("recurse-call", [i, c],
      dup ? `f(${i},${c}) called AGAIN.` : `f(${i},${c}) called: day ${i}, ${holding ? "currently holding" : "not holding"} (price ${p[i]}).`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(`${i},${c}`);
    let v: number;
    let deps: number[][];
    let actionLabel: string;
    if (holding) {
      const rest = f(i + 1, true, callId);
      const sell = p[i] + f(i + 1, false, callId);
      v = Math.max(rest, sell);
      deps = [[i + 1, HOLD_COL], [i + 1, 0]];
      actionLabel = `max(rest ${rest}, sell +${p[i]}→${sell})`;
    } else {
      const rest = f(i + 1, false, callId);
      const buy = -p[i] + f(i + 1, true, callId);
      v = Math.max(rest, buy);
      deps = [[i + 1, 0], [i + 1, HOLD_COL]];
      actionLabel = `max(rest ${rest}, buy −${p[i]}→${buy})`;
    }
    b.push("recurse-return", [i, c], `f(${i},${c}) = ${actionLabel} = ${v}.`, {
      callId,
      parentCallId,
      value: v,
      deps,
      codeAnchor: holding ? "sell" : "buy",
    });
    return v;
  }

  const answer = f(0, false);
  return {
    steps: b.steps,
    meta: { mode: "bruteforce", answer, answerLabel: "max profit", tableShape: null, axisLabels: null, valueFormat: "int", stats: { steps: b.count, calls } },
  };
}

function genMemo(input: In): GeneratedTrace {
  const p = input.prices;
  const n = p.length;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, holding: boolean, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    const c = holding ? HOLD_COL : 0;
    b.push("recurse-call", [i, c], `f(${i},${c}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (i === n) {
      b.push("base-case", [n, c], "Base case: end of days → 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    const kk = `${i},${c}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [i, c], `Memo hit! f(${i},${c}) = ${v}.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    let v: number;
    if (holding) {
      v = Math.max(f(i + 1, true, callId), p[i] + f(i + 1, false, callId));
    } else {
      v = Math.max(f(i + 1, false, callId), -p[i] + f(i + 1, true, callId));
    }
    memo.set(kk, v);
    b.push("recurse-return", [i, c],
      `f(${i},${c}) = ${v}, stored in memo.`,
      { callId, parentCallId, value: v, deps: [[i + 1, c]], codeAnchor: "memoStore" });
    return v;
  }

  const answer = f(0, false);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "max profit",
      tableShape: { rows: n + 1, cols: 2 },
      axisLabels: { ...AXIS, rowLabels: [...Array.from({ length: n }, (_, i) => `d${i}`), "end"] },
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const p = input.prices;
  const n = p.length;
  const b = new TraceBuilder();
  const dp: number[][] = Array.from({ length: n }, () => [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]);

  dp[0][0] = 0;
  dp[0][1] = -p[0];
  b.push("base-case", [0, 0], "Day 0, not holding: 0 (did nothing).", { value: 0, codeAnchor: "base" });
  b.push("base-case", [0, HOLD_COL], `Day 0, holding: −${p[0]} (bought today).`, { value: -p[0], codeAnchor: "base" });

  for (let i = 1; i < n; i++) {
    const restFlat = dp[i - 1][0];
    const sellNow = dp[i - 1][HOLD_COL] + p[i];
    dp[i][0] = Math.max(restFlat, sellNow);
    b.push("table-write", [i, 0], `dp[${i}][flat] = max(rest ${restFlat}, sell ${dp[i - 1][HOLD_COL]}+${p[i]}=${sellNow}) = ${dp[i][0]}.`, {
      value: dp[i][0], deps: [[i - 1, 0], [i - 1, HOLD_COL]], codeAnchor: "transition",
    });

    const restHold = dp[i - 1][HOLD_COL];
    const buyNow = dp[i - 1][0] - p[i];
    dp[i][HOLD_COL] = Math.max(restHold, buyNow);
    b.push("table-write", [i, HOLD_COL], `dp[${i}][hold] = max(rest ${restHold}, buy ${dp[i - 1][0]}−${p[i]}=${buyNow}) = ${dp[i][HOLD_COL]}.`, {
      value: dp[i][HOLD_COL], deps: [[i - 1, 0], [i - 1, HOLD_COL]], codeAnchor: "transition",
    });
  }

  const answer = dp[n - 1][0];
  b.push("table-read", [n - 1, 0], `Answer: never end holding stock → dp[${n - 1}][flat] = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "max profit",
      tableShape: { rows: n, cols: 2 },
      axisLabels: { ...AXIS, rowLabels: Array.from({ length: n }, (_, i) => `d${i}`) },
      valueFormat: "int",
      stats: { steps: b.count, writes: 2 * n + 1 },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const p = input.prices;
  const n = p.length;
  const b = new TraceBuilder();

  let flat = 0;
  let hold = -p[0];
  b.push("base-case", [0, 0], "Two variables replace the table: flat = 0, hold = −prices[0].", { value: 0, codeAnchor: "init" });

  for (let i = 1; i < n; i++) {
    const newFlat = Math.max(flat, hold + p[i]);
    const newHold = Math.max(hold, flat - p[i]);
    flat = newFlat;
    hold = newHold;
    b.push("table-write", [i, 0], `Day ${i}: flat = ${flat}, hold = ${hold} (both updated from yesterday's pair).`, {
      value: flat, deps: [[i - 1, 0], [i - 1, HOLD_COL]], codeAnchor: "transition",
    });
  }

  const answer = flat;
  b.push("table-read", [n - 1, 0], `Answer survives in flat: ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer,
      answerLabel: "max profit",
      tableShape: { rows: n, cols: 2 },
      axisLabels: { ...AXIS, rowLabels: Array.from({ length: n }, (_, i) => `d${i}`) },
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: n },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int i, int holding, vector<int>& p) {
    if (i == (int)p.size()) return 0;              // base
    int rest = f(i + 1, holding, p);               // recurse
    if (holding)
        return max(rest, p[i]);                    // sell
    return max(rest, -p[i]);                       // buy
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition
`,
      { base: "base", recurse: "recurse", sell: "sell", buy: "buy",
      driver: "// anchor: driver",
      init: "// anchor: init",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      transition: "// anchor: transition"
    },
    ),
    java: withAnchors(
`static int f(int i, boolean holding, int[] p) {
    if (i == p.length) return 0;                    // base
    int rest = f(i + 1, holding, p);                // recurse
    if (holding)
        return Math.max(rest, p[i]);                // sell
    return Math.max(rest, -p[i]);                   // buy
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition
`,
      { base: "base", recurse: "recurse", sell: "sell", buy: "buy",
      driver: "// anchor: driver",
      init: "// anchor: init",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      transition: "// anchor: transition"
    },
    ),
    python: withAnchors(
`def f(i, holding, p):
    if i == len(p):                          # base
        return 0
    rest = f(i + 1, holding, p)              # recurse
    if holding:
        return max(rest, p[i])               # sell
    return max(rest, -p[i])                  # buy
# anchor: driver
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: transition
`,
      { base: "base", recurse: "recurse", sell: "sell", buy: "buy",
      driver: "# anchor: driver",
      init: "# anchor: init",
      memoCheck: "# anchor: memoCheck",
      memoStore: "# anchor: memoStore",
      transition: "# anchor: transition"
    },
    ),
    js: withAnchors(
`function f(i, holding, p) {
  if (i === p.length) return 0;             // base
  const rest = f(i + 1, holding, p);        // recurse
  if (holding)
    return Math.max(rest, p[i]);            // sell
  return Math.max(rest, -p[i]);             // buy
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition
`,
      { base: "base", recurse: "recurse", sell: "sell", buy: "buy",
      driver: "// anchor: driver",
      init: "// anchor: init",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      transition: "// anchor: transition"
    },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int i, bool holding, vector<int>& p, vector<vector<int>>& memo) {
    if (i == (int)p.size()) return 0;                 // base
    int c = holding ? 1 : 0;
    if (memo[i][c] != -1) return memo[i][c];          // memo check
    int rest = f(i + 1, holding, p, memo);          // recurse
    int v = holding ? max(rest, p[i]) : max(rest, -p[i]);
    memo[i][c] = v;
    return v;                                         // memo store
}
// anchor: driver
// anchor: init
// anchor: transition
`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store",
      driver: "// anchor: driver",
      init: "// anchor: init",
      transition: "// anchor: transition"
    },
    ),
    java: withAnchors(
`static int f(int i, boolean holding, int[] p, Integer[][] memo) {
    if (i == p.length) return 0;                       // base
    int c = holding ? 1 : 0;
    if (memo[i][c] != null) return memo[i][c];         // memo check
    int rest = f(i + 1, holding, p, memo);           // recurse
    int v = holding ? Math.max(rest, p[i]) : Math.max(rest, -p[i]);
    memo[i][c] = v;
    return v;                                          // memo store
}
// anchor: driver
// anchor: init
// anchor: transition
`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store",
      driver: "// anchor: driver",
      init: "// anchor: init",
      transition: "// anchor: transition"
    },
    ),
    python: withAnchors(
`def f(i, holding, p, memo):
    if i == len(p):                              # base
        return 0
    c = 1 if holding else 0
    if memo[i][c] != -1:                         # memo check
        return memo[i][c]
    rest = f(i + 1, holding, p, memo)               # recurse
    memo[i][c] = max(rest, p[i]) if holding else max(rest, -p[i])
    return memo[i][c]                            # memo store
# anchor: driver
# anchor: init
# anchor: transition
`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store",
      driver: "# anchor: driver",
      init: "# anchor: init",
      transition: "# anchor: transition"
    },
    ),
    js: withAnchors(
`function f(i, holding, p, memo) {
  if (i === p.length) return 0;                     // base
  const c = holding ? 1 : 0;
  if (memo[i][c] !== -1) return memo[i][c];         // memo check
  const rest = f(i + 1, holding, p, memo);          // recurse
  memo[i][c] = holding ? Math.max(rest, p[i]) : Math.max(rest, -p[i]);
  return memo[i][c];                                // memo store
}
// anchor: driver
// anchor: init
// anchor: transition
`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store",
      driver: "// anchor: driver",
      init: "// anchor: init",
      transition: "// anchor: transition"
    },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int maxProfit(vector<int>& p) {
    int n = p.size();
    vector<vector<int>> dp(n, vector<int>(2));
    dp[0][0] = 0;                                        // base
    dp[0][1] = -p[0];
    for (int i = 1; i < n; ++i) {
        dp[i][0] = max(dp[i - 1][0], dp[i - 1][1] + p[i]);   // transition
        dp[i][1] = max(dp[i - 1][1], dp[i - 1][0] - p[i]);
    }
    return dp[n - 1][0];                                 // driver
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { base: "base", transition: "transition", driver: "driver",
      init: "// anchor: init",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse"
    },
    ),
    java: withAnchors(
`static int maxProfit(int[] p) {
    int n = p.length;
    int[][] dp = new int[n][2];
    dp[0][0] = 0;                                         // base
    dp[0][1] = -p[0];
    for (int i = 1; i < n; ++i) {
        dp[i][0] = Math.max(dp[i - 1][0], dp[i - 1][1] + p[i]);   // transition
        dp[i][1] = Math.max(dp[i - 1][1], dp[i - 1][0] - p[i]);
    }
    return dp[n - 1][0];                                  // driver
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { base: "base", transition: "transition", driver: "driver",
      init: "// anchor: init",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse"
    },
    ),
    python: withAnchors(
`def max_profit(p):
    n = len(p)
    dp = [[0, 0] for _ in range(n)]
    dp[0][0], dp[0][1] = 0, -p[0]                   # base
    for i in range(1, n):
        dp[i][0] = max(dp[i - 1][0], dp[i - 1][1] + p[i])   # transition
        dp[i][1] = max(dp[i - 1][1], dp[i - 1][0] - p[i])
    return dp[n - 1][0]                             # driver
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
`,
      { base: "base", transition: "transition", driver: "driver",
      init: "# anchor: init",
      memoCheck: "# anchor: memoCheck",
      memoStore: "# anchor: memoStore",
      recurse: "# anchor: recurse"
    },
    ),
    js: withAnchors(
`function maxProfit(p) {
  const n = p.length;
  const dp = Array.from({ length: n }, () => [0, 0]);
  dp[0][0] = 0;                                        // base
  dp[0][1] = -p[0];
  for (let i = 1; i < n; i++) {
    dp[i][0] = Math.max(dp[i - 1][0], dp[i - 1][1] + p[i]);   // transition
    dp[i][1] = Math.max(dp[i - 1][1], dp[i - 1][0] - p[i]);
  }
  return dp[n - 1][0];                                 // driver
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { base: "base", transition: "transition", driver: "driver",
      init: "// anchor: init",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse"
    },
    ),
  },
  spaceOptimized: {
    cpp: withAnchors(
`int maxProfit(vector<int>& p) {
    int flat = 0, hold = -p[0];                 // init
    for (int i = 1; i < (int)p.size(); ++i) {
        int nf = max(flat, hold + p[i]);        // transition
        int nh = max(hold, flat - p[i]);
        flat = nf; hold = nh;
    }
    return flat;                                // driver
}
// anchor: base
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { init: "init", transition: "transition", driver: "driver",
      base: "// anchor: base",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse"
    },
    ),
    java: withAnchors(
`static int maxProfit(int[] p) {
    int flat = 0, hold = -p[0];                  // init
    for (int i = 1; i < p.length; ++i) {
        int nf = Math.max(flat, hold + p[i]);    // transition
        int nh = Math.max(hold, flat - p[i]);
        flat = nf; hold = nh;
    }
    return flat;                                 // driver
}
// anchor: base
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { init: "init", transition: "transition", driver: "driver",
      base: "// anchor: base",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse"
    },
    ),
    python: withAnchors(
`def max_profit(p):
    flat, hold = 0, -p[0]                      # init
    for x in p[1:]:
        flat, hold = max(flat, hold + x), max(hold, flat - x)  # transition
    return flat                                # driver
# anchor: base
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
`,
      { init: "init", transition: "transition", driver: "driver",
      base: "# anchor: base",
      memoCheck: "# anchor: memoCheck",
      memoStore: "# anchor: memoStore",
      recurse: "# anchor: recurse"
    },
    ),
    js: withAnchors(
`function maxProfit(p) {
  let flat = 0, hold = -p[0];                // init
  for (let i = 1; i < p.length; i++) {
    const nf = Math.max(flat, hold + p[i]);  // transition
    const nh = Math.max(hold, flat - p[i]);
    flat = nf; hold = nh;
  }
  return flat;                               // driver
}
// anchor: base
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { init: "init", transition: "transition", driver: "driver",
      base: "// anchor: base",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse"
    },
    ),
  },
};

export const stockII: ProblemServiceDef = {
  slug: "stock-ii",
  patternSlug: "dp-stocks",
  inputDescriptor: [
    { key: "prices", label: "PRICES / DAY", kind: "array", min: 2, max: 8, valueRange: [1, 9] },
  ],
  schema,
  defaultInput: { prices: [7, 1, 5, 3, 6, 4] }, // → 7 (LC122)
  randomInput: () => ({
    prices: Array.from({ length: 3 + Math.floor(Math.random() * 5) }, () => 1 + Math.floor(Math.random() * 9)),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : mode === "tabulation" ? genTab(input as In) : genSpace(input as In),
  codes,
};
