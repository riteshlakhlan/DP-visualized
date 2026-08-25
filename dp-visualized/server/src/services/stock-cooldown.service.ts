import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Buy/Sell Stocks With Cooldown (Striver DP-39): unlimited trades, but after
 * selling you must skip the NEXT day before buying again.
 * Three end-of-day states: holding / justSold (cooldown tomorrow) / free.
 *   hold[i] = max(hold[i-1], free[i-1] − p[i])
 *   sold[i] = hold[i-1] + p[i]
 *   free[i] = max(free[i-1], sold[i-1])
 * Answer = max(sold[n-1], free[n-1]) — ending while holding is never better.
 */

const schema = z.object({
  prices: z.array(z.number().int().min(0).max(20)).min(2).max(8),
});
type In = z.infer<typeof schema>;

const COLS = ["holding", "just-sold", "free"];
const HOLD = 0, SOLD = 1, FREE = 2;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && input.prices.length > 7)
    return "Pure recursion branches buy/sell/rest with cooldown memory. Use at most 7 days for Brute Force.";
  return null;
}

function axisFor(n: number) {
  return {
    rowsTitle: "day",
    colsTitle: "end-of-day state",
    colLabels: COLS,
    rowLabels: [...Array.from({ length: n }, (_, i) => `d${i}`), "end"],
  };
}

/** Shared recursion core for brute/memo (mode switches memo behaviour). */
function runRecursion(input: In, mode: Extract<DPMode, "bruteforce" | "memo">): GeneratedTrace {
  const p = input.prices;
  const n = p.length;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, state: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i, state],
      `f(${i},${COLS[state]}) called.`,
      { callId, parentCallId, codeAnchor: "recurse" });
    if (i >= n) {
      b.push("base-case", [n, state], "No days left → future profit 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    if (mode === "memo") {
      const kk = `${i},${state}`;
      if (memo.has(kk)) {
        hits++;
        const v = memo.get(kk)!;
        b.push("memo-hit", [i, state], `Memo hit! f(${i},${COLS[state]}) = ${v}.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
        return v;
      }
    }
    let v: number;
    let deps: number[][];
    let how: string;
    if (state === HOLD) {
      // rest holding OR sell today (+price) → cooldown state next
      const rest = f(i + 1, HOLD, callId);
      const sell = p[i] + f(i + 1, SOLD, callId);
      v = Math.max(rest, sell);
      deps = [[i + 1, HOLD], [i + 1, SOLD]];
      how = `max(keep ${rest}, sell +${p[i]}→${sell})`;
    } else if (state === SOLD) {
      // mandatory cooldown: becomes free tomorrow
      const rest = f(i + 1, FREE, callId);
      v = rest;
      deps = [[i + 1, FREE]];
      how = `cooldown → free (${rest})`;
    } else {
      // free: rest OR buy today (−price)
      const rest = f(i + 1, FREE, callId);
      const buy = -p[i] + f(i + 1, HOLD, callId);
      v = Math.max(rest, buy);
      deps = [[i + 1, FREE], [i + 1, HOLD]];
      how = `max(rest ${rest}, buy ${buy})`;
    }
    if (mode === "memo") {
      memo.set(`${i},${state}`, v);
      b.push("recurse-return", [i, state], `f(${i},${COLS[state]}) = ${how} = ${v}, stored.`, { callId, parentCallId, value: v, deps, codeAnchor: "memoStore" });
    } else {
      b.push("recurse-return", [i, state], `f(${i},${COLS[state]}) = ${how} = ${v}.`, { callId, parentCallId, value: v, deps, codeAnchor: "combine" });
    }
    return v;
  }

  const answer = f(0, FREE);
  const meta = {
    mode,
    answer,
    answerLabel: "max profit",
    tableShape: mode === "memo" ? ({ rows: n + 1, cols: 3 } as const) : null,
    axisLabels: mode === "memo" ? axisFor(n) : null,
    valueFormat: "int" as const,
    stats: mode === "memo" ? { steps: b.count, calls, memoHits: hits } : { steps: b.count, calls },
  };
  return { steps: b.steps, meta };
}

function genTab(input: In): GeneratedTrace {
  const p = input.prices;
  const n = p.length;
  const b = new TraceBuilder();
  const dp: number[][] = Array.from({ length: n }, () => new Array(3).fill(Number.NEGATIVE_INFINITY));

  dp[0][HOLD] = -p[0];
  dp[0][SOLD] = 0;   // degenerate same-day buy+sell; equals doing nothing
  dp[0][FREE] = 0;
  b.push("base-case", [0, HOLD], `Day 0 holding: −${p[0]} (bought).`, { value: -p[0], codeAnchor: "base" });
  b.push("base-case", [0, SOLD], "Day 0 just-sold: 0 by convention.", { value: 0, codeAnchor: "base" });
  b.push("base-case", [0, FREE], "Day 0 free: 0.", { value: 0, codeAnchor: "base" });

  for (let i = 1; i < n; i++) {
    dp[i][HOLD] = Math.max(dp[i - 1][HOLD], dp[i - 1][FREE] - p[i]);
    b.push("table-write", [i, HOLD], `hold[${i}] = max(keep ${dp[i - 1][HOLD]}, buy ${dp[i - 1][FREE]}−${p[i]}=${dp[i - 1][FREE] - p[i]}) = ${dp[i][HOLD]}.`, {
      value: dp[i][HOLD], deps: [[i - 1, HOLD], [i - 1, FREE]], codeAnchor: "transition",
    });
    dp[i][SOLD] = dp[i - 1][HOLD] + p[i];
    b.push("table-write", [i, SOLD], `sold[${i}] = hold[${i - 1}] + ${p[i]} = ${dp[i][SOLD]} (then cooldown).`, {
      value: dp[i][SOLD], deps: [[i - 1, HOLD]], codeAnchor: "transition",
    });
    dp[i][FREE] = Math.max(dp[i - 1][FREE], dp[i - 1][SOLD]);
    b.push("table-write", [i, FREE], `free[${i}] = max(free ${dp[i - 1][FREE]}, sold ${dp[i - 1][SOLD]}) = ${dp[i][FREE]}.`, {
      value: dp[i][FREE], deps: [[i - 1, FREE], [i - 1, SOLD]], codeAnchor: "transition",
    });
  }

  const answer = Math.max(dp[n - 1][SOLD], dp[n - 1][FREE]);
  b.push("table-read", [n - 1, SOLD], `Answer = max(last sold, last free) = max(${dp[n - 1][SOLD]}, ${dp[n - 1][FREE]}) = ${answer}.`, {
    value: answer, codeAnchor: "driver",
  });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "max profit",
      tableShape: { rows: n, cols: 3 },
      axisLabels: axisFor(n),
      valueFormat: "int",
      stats: { steps: b.count, writes: 3 * n },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const p = input.prices;
  const n = p.length;
  const b = new TraceBuilder();

  let hold = -p[0];
  let sold = 0;
  let free = 0;
  b.push("base-case", [0, HOLD], "Three variables: hold=−p0, sold=0, free=0.", { value: hold, codeAnchor: "init" });

  for (let i = 1; i < n; i++) {
    const nh = Math.max(hold, free - p[i]);
    const ns = hold + p[i];
    const nf = Math.max(free, sold);
    hold = nh; sold = ns; free = nf;
    b.push("table-write", [i, HOLD], `Day ${i}: hold=${hold}, sold=${sold}, free=${free}.`, {
      value: free, deps: [[i - 1, HOLD], [i - 1, FREE]], codeAnchor: "transition",
    });
  }

  const answer = Math.max(sold, free);
  b.push("table-read", [n - 1, SOLD], `Answer = max(sold ${sold}, free ${free}) = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer,
      answerLabel: "max profit",
      tableShape: { rows: n, cols: 3 },
      axisLabels: axisFor(n),
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: n },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int i, int st, vector<int>& p) {
    if (i >= (int)p.size()) return 0;               // base
    if (st == HOLD)
        return max(f(i + 1, HOLD, p),               // recurse
                   f(i + 1, SOLD, p));
    if (st == SOLD)                                  // cooldown day
        return f(i + 1, FREE, p);
    return max(f(i + 1, FREE, p),                    // recurse
               f(i + 1, HOLD, p));                   // combine
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition
`,
      { base: "base", recurse: "recurse", combine: "combine",
      driver: "// anchor: driver",
      init: "// anchor: init",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      transition: "// anchor: transition"
    },
    ),
    java: withAnchors(
`static int f(int i, int st, int[] p) {
    if (i >= p.length) return 0;                     // base
    if (st == HOLD)
        return Math.max(f(i + 1, HOLD, p),           // recurse
                        f(i + 1, SOLD, p));
    if (st == SOLD)                                   // cooldown day
        return f(i + 1, FREE, p);
    return Math.max(f(i + 1, FREE, p),                // recurse
                    f(i + 1, HOLD, p));               // combine
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition
`,
      { base: "base", recurse: "recurse", combine: "combine",
      driver: "// anchor: driver",
      init: "// anchor: init",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      transition: "// anchor: transition"
    },
    ),
    python: withAnchors(
`def f(i, st, p):
    if i >= len(p):                             # base
        return 0
    if st == HOLD:
        return max(f(i + 1, HOLD, p),           # recurse
                   f(i + 1, SOLD, p))
    if st == SOLD:                              # cooldown day
        return f(i + 1, FREE, p)
    return max(f(i + 1, FREE, p),               # recurse
               f(i + 1, HOLD, p))                  # combine
# anchor: driver
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: transition
`,
      { base: "base", recurse: "recurse", combine: "combine",
      driver: "# anchor: driver",
      init: "# anchor: init",
      memoCheck: "# anchor: memoCheck",
      memoStore: "# anchor: memoStore",
      transition: "# anchor: transition"
    },
    ),
    js: withAnchors(
`function f(i, st, p) {
  if (i >= p.length) return 0;                 // base
  if (st === HOLD)
    return Math.max(f(i + 1, HOLD, p),         // recurse
                    f(i + 1, SOLD, p));
  if (st === SOLD)                             // cooldown day
    return f(i + 1, FREE, p);
  return Math.max(f(i + 1, FREE, p),           // recurse
                  f(i + 1, HOLD, p));         // combine
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition
`,
      { base: "base", recurse: "recurse", combine: "combine",
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
`int f(int i, int st, vector<int>& p, vector<vector<int>>& memo) {
    if (i >= (int)p.size()) return 0;               // base
    if (memo[i][st] != -1) return memo[i][st];      // memo check
    int v;
    if (st == HOLD)                                  // recurse
        v = max(f(i + 1, HOLD, p, memo), f(i + 1, SOLD, p, memo));
    else if (st == SOLD)
        v = f(i + 1, FREE, p, memo);
    else
        v = max(f(i + 1, FREE, p, memo), f(i + 1, HOLD, p, memo));
    return memo[i][st] = v;                          // memo store
}
// anchor: combine
// anchor: driver
// anchor: init
// anchor: transition
`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store",
      combine: "// anchor: combine",
      driver: "// anchor: driver",
      init: "// anchor: init",
      transition: "// anchor: transition"
    },
    ),
    java: withAnchors(
`static int f(int i, int st, int[] p, int[][] memo) {
    if (i >= p.length) return 0;                      // base
    if (memo[i][st] != -1) return memo[i][st];        // memo check
    int v;
    if (st == HOLD)                                   // recurse
        v = Math.max(f(i + 1, HOLD, p, memo), f(i + 1, SOLD, p, memo));
    else if (st == SOLD)
        v = f(i + 1, FREE, p, memo);
    else
        v = Math.max(f(i + 1, FREE, p, memo), f(i + 1, HOLD, p, memo));
    return memo[i][st] = v;                           // memo store
}
// anchor: combine
// anchor: driver
// anchor: init
// anchor: transition
`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store",
      combine: "// anchor: combine",
      driver: "// anchor: driver",
      init: "// anchor: init",
      transition: "// anchor: transition"
    },
    ),
    python: withAnchors(
`def f(i, st, p, memo):
    if i >= len(p):                              # base
        return 0
    if memo[i][st] != -1:                        # memo check
        return memo[i][st]
    if st == HOLD:                               # recurse
        v = max(f(i + 1, HOLD, p, memo), f(i + 1, SOLD, p, memo))
    elif st == SOLD:
        v = f(i + 1, FREE, p, memo)
    else:
        v = max(f(i + 1, FREE, p, memo), f(i + 1, HOLD, p, memo))
    memo[i][st] = v
    return v                                     # memo store
# anchor: combine
# anchor: driver
# anchor: init
# anchor: transition
`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store",
      combine: "# anchor: combine",
      driver: "# anchor: driver",
      init: "# anchor: init",
      transition: "# anchor: transition"
    },
    ),
    js: withAnchors(
`function f(i, st, p, memo) {
  if (i >= p.length) return 0;                    // base
  if (memo[i][st] !== -1) return memo[i][st];     // memo check
  let v;
  if (st === HOLD)                                // recurse
    v = Math.max(f(i + 1, HOLD, p, memo), f(i + 1, SOLD, p, memo));
  else if (st === SOLD)
    v = f(i + 1, FREE, p, memo);
  else
    v = Math.max(f(i + 1, FREE, p, memo), f(i + 1, HOLD, p, memo));
  memo[i][st] = v;
  return v;                                       // memo store
}
// anchor: combine
// anchor: driver
// anchor: init
// anchor: transition
`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store",
      combine: "// anchor: combine",
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
    vector<vector<int>> dp(n, vector<int>(3, INT_MIN));   // base row below
    dp[0][HOLD] = -p[0]; dp[0][SOLD] = 0; dp[0][FREE] = 0;
    for (int i = 1; i < n; ++i) {
        dp[i][HOLD] = max(dp[i - 1][HOLD], dp[i - 1][FREE] - p[i]); // transition
        dp[i][SOLD] = dp[i - 1][HOLD] + p[i];
        dp[i][FREE] = max(dp[i - 1][FREE], dp[i - 1][SOLD]);
    }
    return max(dp[n - 1][SOLD], dp[n - 1][FREE]);          // driver
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { base: "base row below", transition: "transition", driver: "driver",
      combine: "// anchor: combine",
      init: "// anchor: init",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse"
    },
    ),
    java: withAnchors(
`static int maxProfit(int[] p) {
    int n = p.length;
    int[][] dp = new int[n][3];                            // base row set next
    dp[0][HOLD] = -p[0]; dp[0][SOLD] = 0; dp[0][FREE] = 0;
    for (int i = 1; i < n; ++i) {
        dp[i][HOLD] = Math.max(dp[i - 1][HOLD], dp[i - 1][FREE] - p[i]); // transition
        dp[i][SOLD] = dp[i - 1][HOLD] + p[i];
        dp[i][FREE] = Math.max(dp[i - 1][FREE], dp[i - 1][SOLD]);
    }
    return Math.max(dp[n - 1][SOLD], dp[n - 1][FREE]);     // driver
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { base: "base row set next", transition: "transition", driver: "driver",
      combine: "// anchor: combine",
      init: "// anchor: init",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse"
    },
    ),
    python: withAnchors(
`def max_profit(p):
    n = len(p)
    NEG = float("-inf")
    dp = [[NEG] * 3 for _ in range(n)]            # base row filled next
    dp[0][HOLD], dp[0][SOLD], dp[0][FREE] = -p[0], 0, 0
    for i in range(1, n):
        dp[i][HOLD] = max(dp[i - 1][HOLD], dp[i - 1][FREE] - p[i])   # transition
        dp[i][SOLD] = dp[i - 1][HOLD] + p[i]
        dp[i][FREE] = max(dp[i - 1][FREE], dp[i - 1][SOLD])
    return max(dp[n - 1][SOLD], dp[n - 1][FREE])  # driver
# anchor: combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
`,
      { base: "base row filled next", transition: "transition", driver: "driver",
      combine: "# anchor: combine",
      init: "# anchor: init",
      memoCheck: "# anchor: memoCheck",
      memoStore: "# anchor: memoStore",
      recurse: "# anchor: recurse"
    },
    ),
    js: withAnchors(
`function maxProfit(p) {
  const n = p.length;
  const dp = Array.from({ length: n }, () => new Array(3).fill(-Infinity)); // base
  dp[0][HOLD] = -p[0]; dp[0][SOLD] = 0; dp[0][FREE] = 0;
  for (let i = 1; i < n; i++) {
    dp[i][HOLD] = Math.max(dp[i - 1][HOLD], dp[i - 1][FREE] - p[i]);   // transition
    dp[i][SOLD] = dp[i - 1][HOLD] + p[i];
    dp[i][FREE] = Math.max(dp[i - 1][FREE], dp[i - 1][SOLD]);
  }
  return Math.max(dp[n - 1][SOLD], dp[n - 1][FREE]);   // driver
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { base: "base", transition: "transition", driver: "driver",
      combine: "// anchor: combine",
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
    int hold = -p[0], sold = 0, free = 0;       // init
    for (int i = 1; i < (int)p.size(); ++i) {
        int nh = max(hold, free - p[i]);         // transition
        int ns = hold + p[i];
        int nf = max(free, sold);
        hold = nh; sold = ns; free = nf;
    }
    return max(sold, free);                      // driver
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { init: "init", transition: "transition", driver: "driver",
      base: "// anchor: base",
      combine: "// anchor: combine",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse"
    },
    ),
    java: withAnchors(
`static int maxProfit(int[] p) {
    int hold = -p[0], sold = 0, free = 0;        // init
    for (int i = 1; i < p.length; ++i) {
        int nh = Math.max(hold, free - p[i]);     // transition
        int ns = hold + p[i];
        int nf = Math.max(free, sold);
        hold = nh; sold = ns; free = nf;
    }
    return Math.max(sold, free);                  // driver
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { init: "init", transition: "transition", driver: "driver",
      base: "// anchor: base",
      combine: "// anchor: combine",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse"
    },
    ),
    python: withAnchors(
`def max_profit(p):
    hold, sold, free = -p[0], 0, 0             # init
    for x in p[1:]:
        hold, sold, free = (max(hold, free - x),   # transition
                            hold + x,
                            max(free, sold))
    return max(sold, free)                     # driver
# anchor: base
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
`,
      { init: "init", transition: "transition", driver: "driver",
      base: "# anchor: base",
      combine: "# anchor: combine",
      memoCheck: "# anchor: memoCheck",
      memoStore: "# anchor: memoStore",
      recurse: "# anchor: recurse"
    },
    ),
    js: withAnchors(
`function maxProfit(p) {
  let hold = -p[0], sold = 0, free = 0;     // init
  for (let i = 1; i < p.length; i++) {
    const nh = Math.max(hold, free - p[i]);  // transition
    const ns = hold + p[i];
    const nf = Math.max(free, sold);
    hold = nh; sold = ns; free = nf;
  }
  return Math.max(sold, free);               // driver
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { init: "init", transition: "transition", driver: "driver",
      base: "// anchor: base",
      combine: "// anchor: combine",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse"
    },
    ),
  },
};

export const stockCooldown: ProblemServiceDef = {
  slug: "stock-cooldown",
  patternSlug: "dp-stocks",
  inputDescriptor: [
    { key: "prices", label: "PRICES / DAY", kind: "array", min: 2, max: 8, valueRange: [1, 9] },
  ],
  schema,
  defaultInput: { prices: [1, 2, 3, 0, 2] }, // LC309 → 3
  randomInput: () => ({
    prices: Array.from({ length: 3 + Math.floor(Math.random() * 5) }, () => 1 + Math.floor(Math.random() * 9)),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? runRecursion(input as In, "bruteforce")
    : mode === "memo" ? runRecursion(input as In, "memo")
    : mode === "tabulation" ? genTab(input as In)
    : genSpace(input as In),
  codes,
};
