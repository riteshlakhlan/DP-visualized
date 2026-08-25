import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Buy/Sell Stocks With Transaction Fee (Striver DP-40): unlimited trades but
 * each COMPLETED sale costs `fee`. Two-state machine:
 *   flat[i] = max(flat[i-1], hold[i-1] + p[i] − fee)
 *   hold[i] = max(hold[i-1], flat[i-1] − p[i])
 */

const schema = z.object({
  prices: z.array(z.number().int().min(0).max(20)).min(2).max(8),
  fee: z.number().int().min(0).max(5),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && input.prices.length > 7)
    return "Pure recursion branches buy/sell/rest every day. Use at most 7 days for Brute Force.";
  return null;
}

const axisFor = (n: number) => ({
  rowsTitle: "day",
  colsTitle: "end-of-day state",
  colLabels: ["flat", "holding"],
  rowLabels: [...Array.from({ length: n }, (_, i) => `d${i}`), "end"],
});
const HOLD = 1;

function runRecursion(input: In, mode: Extract<DPMode, "bruteforce" | "memo">): GeneratedTrace {
  const { prices: p, fee } = input;
  const n = p.length;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, holding: boolean, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    const c = holding ? HOLD : 0;
    b.push("recurse-call", [i, c], `f(${i},${c}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (i >= n) {
      b.push("base-case", [n, c], "No days left → future profit 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    if (mode === "memo") {
      const kk = `${i},${c}`;
      if (memo.has(kk)) {
        hits++;
        const v = memo.get(kk)!;
        b.push("memo-hit", [i, c], `Memo hit! f(${i},${c}) = ${v}.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
        return v;
      }
    }
    let v: number;
    if (holding) {
      // rest holding OR sell today (pay the fee)
      v = Math.max(f(i + 1, true, callId), p[i] - fee + f(i + 1, false, callId));
    } else {
      // stay flat OR buy today
      v = Math.max(f(i + 1, false, callId), -p[i] + f(i + 1, true, callId));
    }
    if (mode === "memo") {
      memo.set(`${i},${c}`, v);
      b.push("recurse-return", [i, c], `f(${i},${c}) = ${v}, stored in memo.`, {
        callId,
        parentCallId,
        value: v,
        deps: [
          [Math.min(i + 1, n), c],
          [Math.min(i + 1, n), holding ? 0 : HOLD],
        ],
        codeAnchor: "memoStore",
      });
    } else {
      b.push("recurse-return", [i, c],
        holding ? `max(rest, sell +${p[i]}−${fee} fee) = ${v}.` : `max(rest, buy −${p[i]}) = ${v}.`,
        {
          callId,
          parentCallId,
          value: v,
          deps: [
            [Math.min(i + 1, n), c],
            [Math.min(i + 1, n), holding ? 0 : HOLD],
          ],
          codeAnchor: "combine",
        });
    }
    return v;
  }

  const answer = f(0, false);
  return {
    steps: b.steps,
    meta:
      mode === "memo"
        ? {
            mode,
            answer,
            answerLabel: "net max profit",
            tableShape: { rows: n + 1, cols: 2 },
            axisLabels: axisFor(n),
            valueFormat: "int",
            stats: { steps: b.count, calls, memoHits: hits },
          }
        : {
            mode,
            answer,
            answerLabel: "net max profit",
            tableShape: null,
            axisLabels: null,
            valueFormat: "int",
            stats: { steps: b.count, calls },
          },
  };
}

function genTab(input: In): GeneratedTrace {
  const { prices: p, fee } = input;
  const n = p.length;
  const b = new TraceBuilder();
  const dp: number[][] = Array.from({ length: n }, () => new Array(2).fill(Number.NEGATIVE_INFINITY));

  dp[0][0] = 0;
  dp[0][HOLD] = -p[0];
  b.push("base-case", [0, 0], "Day 0 flat: 0.", { value: 0, codeAnchor: "base" });
  b.push("base-case", [0, HOLD], `Day 0 holding: −${p[0]}.`, { value: -p[0], codeAnchor: "base" });

  for (let i = 1; i < n; i++) {
    dp[i][0] = Math.max(dp[i - 1][0], dp[i - 1][HOLD] + p[i] - fee);
    b.push("table-write", [i, 0], `flat[${i}] = max(rest ${dp[i - 1][0]}, sell ${dp[i - 1][HOLD]}+${p[i]}−fee${fee}=${dp[i - 1][HOLD] + p[i] - fee}) = ${dp[i][0]}.`, {
      value: dp[i][0], deps: [[i - 1, 0], [i - 1, HOLD]], codeAnchor: "transition",
    });
    dp[i][HOLD] = Math.max(dp[i - 1][HOLD], dp[i - 1][0] - p[i]);
    b.push("table-write", [i, HOLD], `hold[${i}] = max(rest ${dp[i - 1][HOLD]}, buy ${dp[i - 1][0]}−${p[i]}=${dp[i - 1][0] - p[i]}) = ${dp[i][HOLD]}.`, {
      value: dp[i][HOLD], deps: [[i - 1, 0], [i - 1, HOLD]], codeAnchor: "transition",
    });
  }

  const answer = dp[n - 1][0];
  b.push("table-read", [n - 1, 0], `Answer: end flat → ${answer} (after all fees).`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "net max profit",
      tableShape: { rows: n, cols: 2 },
      axisLabels: axisFor(n),
      valueFormat: "int",
      stats: { steps: b.count, writes: 2 * n + 1 },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const { prices: p, fee } = input;
  const n = p.length;
  const b = new TraceBuilder();

  let flat = 0;
  let hold = -p[0];
  b.push("base-case", [0, 0], "Two variables: flat=0, hold=−p0.", { value: 0, codeAnchor: "init" });

  for (let i = 1; i < n; i++) {
    const nf = Math.max(flat, hold + p[i] - fee);
    const nh = Math.max(hold, flat - p[i]);
    flat = nf;
    hold = nh;
    b.push("table-write", [i, 0], `Day ${i}: flat=${flat}, hold=${hold} (sell pays ${fee} fee).`, {
      value: flat, deps: [[i - 1, 0], [i - 1, HOLD]], codeAnchor: "transition",
    });
  }

  const answer = flat;
  b.push("table-read", [n - 1, 0], `Answer survives in flat: ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer,
      answerLabel: "net max profit",
      tableShape: { rows: n, cols: 2 },
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
`int f(int i, bool hold, vector<int>& p, int fee) {
    if (i == (int)p.size()) return 0;                    // base
    if (hold)
        return max(f(i + 1, true, p, fee),               // recurse
                   p[i] - fee + f(i + 1, false, p, fee));
    return max(f(i + 1, false, p, fee),                  // recurse
               -p[i] + f(i + 1, true, p, fee));
}   // combine
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
`static int f(int i, boolean hold, int[] p, int fee) {
    if (i == p.length) return 0;                          // base
    if (hold)
        return Math.max(f(i + 1, true, p, fee),           // recurse
                        p[i] - fee + f(i + 1, false, p, fee));
    return Math.max(f(i + 1, false, p, fee),              // recurse
                    -p[i] + f(i + 1, true, p, fee));        // combine
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
`def f(i, hold, p, fee):
    if i == len(p):                                 # base
        return 0
    if hold:
        return max(f(i + 1, True, p, fee),           # recurse
                   p[i] - fee + f(i + 1, False, p, fee))
    return max(f(i + 1, False, p, fee),             # recurse
               -p[i] + f(i + 1, True, p, fee))         # combine
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
`function f(i, hold, p, fee) {
  if (i === p.length) return 0;                       // base
  if (hold)
    return Math.max(f(i + 1, true, p, fee),           // recurse
                    p[i] - fee + f(i + 1, false, p, fee));
  return Math.max(f(i + 1, false, p, fee),            // recurse
                  -p[i] + f(i + 1, true, p, fee));      // combine
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
`int f(int i, bool hold, vector<int>& p, int fee, vector<vector<int>>& memo) {
    if (i == (int)p.size()) return 0;                     // base
    int c = hold ? 1 : 0;
    if (memo[i][c] != -1) return memo[i][c];              // memo check
    int v = hold
        ? max(f(i + 1, true, p, fee, memo),               // recurse
              p[i] - fee + f(i + 1, false, p, fee, memo))
        : max(f(i + 1, false, p, fee, memo),
              -p[i] + f(i + 1, true, p, fee, memo));
    return memo[i][c] = v;                                // memo store
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
`static int f(int i, boolean hold, int[] p, int fee, Integer[][] memo) {
    if (i == p.length) return 0;                           // base
    int c = hold ? 1 : 0;
    if (memo[i][c] != null) return memo[i][c];             // memo check
    int v = hold
        ? Math.max(f(i + 1, true, p, fee, memo),           // recurse
                   p[i] - fee + f(i + 1, false, p, fee, memo))
        : Math.max(f(i + 1, false, p, fee, memo),
                   -p[i] + f(i + 1, true, p, fee, memo));
    return memo[i][c] = v;                                 // memo store
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
`def f(i, hold, p, fee, memo):
    if i == len(p):                                  # base
        return 0
    c = 1 if hold else 0
    if memo[i][c] != -1:                             # memo check
        return memo[i][c]
    if hold:
        v = max(f(i + 1, True, p, fee, memo),         # recurse
                p[i] - fee + f(i + 1, False, p, fee, memo))
    else:
        v = max(f(i + 1, False, p, fee, memo),
                -p[i] + f(i + 1, True, p, fee, memo))
    memo[i][c] = v
    return v                                         # memo store
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
`function f(i, hold, p, fee, memo) {
  if (i === p.length) return 0;                       // base
  const c = hold ? 1 : 0;
  if (memo[i][c] !== -1) return memo[i][c];           // memo check
  let v;
  if (hold)
    v = Math.max(f(i + 1, true, p, fee, memo),        // recurse
                 p[i] - fee + f(i + 1, false, p, fee, memo));
  else
    v = Math.max(f(i + 1, false, p, fee, memo),
                 -p[i] + f(i + 1, true, p, fee, memo));
  memo[i][c] = v;
  return v;                                           // memo store
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
`int maxProfit(vector<int>& p, int fee) {
    int n = p.size();
    vector<vector<int>> dp(n, vector<int>(2, INT_MIN));
    dp[0][FLAT] = 0;                                     // base
    dp[0][HOLD] = -p[0];
    for (int i = 1; i < n; ++i) {
        dp[i][FLAT] = max(dp[i - 1][FLAT],               // transition
                          dp[i - 1][HOLD] + p[i] - fee);
        dp[i][HOLD] = max(dp[i - 1][HOLD], dp[i - 1][FLAT] - p[i]);
    }
    return dp[n - 1][FLAT];                              // driver
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
    java: withAnchors(
`static int maxProfit(int[] p, int fee) {
    int n = p.length;
    int[][] dp = new int[n][2];
    dp[0][FLAT] = 0;                                      // base
    dp[0][HOLD] = -p[0];
    for (int i = 1; i < n; ++i) {
        dp[i][FLAT] = Math.max(dp[i - 1][FLAT],           // transition
                    dp[i - 1][HOLD] + p[i] - fee);
        dp[i][HOLD] = Math.max(dp[i - 1][HOLD], dp[i - 1][FLAT] - p[i]);
    }
    return dp[n - 1][FLAT];                               // driver
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
    python: withAnchors(
`def max_profit(p, fee):
    n = len(p)
    NEG = float("-inf")
    dp = [[NEG] * 2 for _ in range(n)]
    dp[0][FLAT], dp[0][HOLD] = 0, -p[0]             # base
    for i in range(1, n):
        dp[i][FLAT] = max(dp[i - 1][FLAT],           # transition
                          dp[i - 1][HOLD] + p[i] - fee)
        dp[i][HOLD] = max(dp[i - 1][HOLD], dp[i - 1][FLAT] - p[i])
    return dp[n - 1][FLAT]                          # driver
# anchor: combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
`,
      { base: "base", transition: "transition", driver: "driver",
      combine: "# anchor: combine",
      init: "# anchor: init",
      memoCheck: "# anchor: memoCheck",
      memoStore: "# anchor: memoStore",
      recurse: "# anchor: recurse"
    },
    ),
    js: withAnchors(
`function maxProfit(p, fee) {
  const n = p.length;
  const dp = Array.from({ length: n }, () => new Array(2).fill(-Infinity)); // base next
  dp[0][FLAT] = 0; dp[0][HOLD] = -p[0];
  for (let i = 1; i < n; i++) {
    dp[i][FLAT] = Math.max(dp[i - 1][FLAT],       // transition
                           dp[i - 1][HOLD] + p[i] - fee);
    dp[i][HOLD] = Math.max(dp[i - 1][HOLD], dp[i - 1][FLAT] - p[i]);
  }
  return dp[n - 1][FLAT];                         // driver
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { base: "base next", transition: "transition", driver: "driver",
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
`int maxProfit(vector<int>& p, int fee) {
    int flat = 0, hold = -p[0];                 // init
    for (int i = 1; i < (int)p.size(); ++i) {
        int nf = max(flat, hold + p[i] - fee);   // transition
        int nh = max(hold, flat - p[i]);
        flat = nf; hold = nh;
    }
    return flat;                                 // driver
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
`static int maxProfit(int[] p, int fee) {
    int flat = 0, hold = -p[0];                  // init
    for (int i = 1; i < p.length; ++i) {
        int nf = Math.max(flat, hold + p[i] - fee);   // transition
        int nh = Math.max(hold, flat - p[i]);
        flat = nf; hold = nh;
    }
    return flat;                                 // driver
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
`def max_profit(p, fee):
    flat, hold = 0, -p[0]                      # init
    for x in p[1:]:
        flat, hold = (max(flat, hold + x - fee),   # transition
                      max(hold, flat - x))
    return flat                                 # driver
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
`function maxProfit(p, fee) {
  let flat = 0, hold = -p[0];                // init
  for (let i = 1; i < p.length; i++) {
    const nf = Math.max(flat, hold + p[i] - fee);   // transition
    const nh = Math.max(hold, flat - p[i]);
    flat = nf; hold = nh;
  }
  return flat;                                 // driver
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

export const stockFee: ProblemServiceDef = {
  slug: "stock-fee",
  patternSlug: "dp-stocks",
  inputDescriptor: [
    { key: "prices", label: "PRICES / DAY", kind: "array", min: 2, max: 8, valueRange: [1, 9] },
    { key: "fee", label: "FEE / TRADE", kind: "number", min: 0, max: 5 },
  ],
  schema,
  defaultInput: { prices: [1, 3, 2, 8, 4, 9], fee: 2 }, // LC714 → 8
  randomInput: () => ({
    prices: Array.from({ length: 3 + Math.floor(Math.random() * 5) }, () => 1 + Math.floor(Math.random() * 9)),
    fee: Math.floor(Math.random() * 3),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? runRecursion(input as In, "bruteforce")
    : mode === "memo" ? runRecursion(input as In, "memo")
    : mode === "tabulation" ? genTab(input as In)
    : genSpace(input as In),
  codes,
};
