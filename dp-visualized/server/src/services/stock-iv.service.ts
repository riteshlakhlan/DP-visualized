import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Buy/Sell Stock IV (Striver DP-38): at most K complete transactions.
 * Same transaction-slot formulation as III with 2K slots:
 * even slot = buy, odd = sell.
 */

const schema = z.object({
  prices: z.array(z.number().int().min(0).max(20)).min(2).max(8),
  k: z.number().int().min(1).max(3),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  const work = 2 * input.k * input.prices.length;
  if (mode === "bruteforce" && Math.pow(3, input.prices.length) > 3000)
    return "Pure recursion branches ~3 ways per day. Use at most 6 days for Brute Force.";
  void work;
  return null;
}

const axisFor = (n: number, k: number) => ({
  rowsTitle: "day",
  colsTitle: "next allowed action",
  rowLabels: [...Array.from({ length: n + 1 }, (_, i) => `d${i}`)],
  colLabels: Array.from({ length: 2 * k }, (_, s) => (s % 2 === 0 ? `buy#${s / 2 + 1}` : `sell#${(s + 1) / 2}`)),
});

const LABEL = (s: number) => (s % 2 === 0 ? `buy#${s / 2 + 1}` : `sell#${(s + 1) / 2}`);

function genBrute(input: In): GeneratedTrace {
  const { prices: p, k } = input;
  const S = 2 * k;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<string>();

  function f(i: number, slot: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i === p.length || slot === S) {
      b.push("base-case", [Math.min(i, p.length), Math.min(slot, S - 1)], "Out of days or all K trades used → 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    const dup = seen.has(`${i},${slot}`);
    b.push("recurse-call", [i, slot],
      dup ? `f(${i},${slot}) called AGAIN.` : `f(${i},${slot}) called: next ${LABEL(slot)} at price ${p[i]}.`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(`${i},${slot}`);
    const skip = f(i + 1, slot, callId);
    const delta = slot % 2 === 0 ? -p[i] : p[i];
    const act = delta + f(i + 1, slot + 1, callId);
    const v = Math.max(skip, act);
    b.push("recurse-return", [i, slot], `f(${i},${slot}) = max(skip ${skip}, ${LABEL(slot)} → ${act}) = ${v}.`, {
      callId, parentCallId, value: v, deps: [[i + 1, slot], [i + 1, slot + 1]], codeAnchor: "combine",
    });
    return v;
  }

  const answer = f(0, 0);
  return {
    steps: b.steps,
    meta: { mode: "bruteforce", answer, answerLabel: `max profit (≤${k} trades)`, tableShape: null, axisLabels: null, valueFormat: "int", stats: { steps: b.count, calls } },
  };
}

function genMemo(input: In): GeneratedTrace {
  const { prices: p, k } = input;
  const n = p.length;
  const S = 2 * k;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, slot: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i === n || slot === S) {
      b.push("base-case", [Math.min(i, n), Math.min(slot, S - 1)], "Base case → 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    b.push("recurse-call", [i, slot], `f(${i},${slot}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    const kk = `${i},${slot}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [i, slot], `Memo hit! f(${i},${slot}) = ${v}.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    const skip = f(i + 1, slot, callId);
    const delta = slot % 2 === 0 ? -p[i] : p[i];
    const v = Math.max(skip, delta + f(i + 1, slot + 1, callId));
    memo.set(kk, v);
    b.push("recurse-return", [i, slot], `f(${i},${slot}) = ${v}, stored in memo.`, {
      callId, parentCallId, value: v, deps: [[i + 1, slot], [i + 1, slot + 1]], codeAnchor: "memoStore",
    });
    return v;
  }

  const answer = f(0, 0);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: `max profit (≤${k} trades)`,
      tableShape: { rows: n + 1, cols: S },
      axisLabels: axisFor(n, k),
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const { prices: p, k } = input;
  const n = p.length;
  const S = 2 * k;
  const b = new TraceBuilder();
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(S).fill(0));

  for (let i = n - 1; i >= 0; i--)
    for (let slot = S - 1; slot >= 0; slot--) {
      const delta = slot % 2 === 0 ? -p[i] : p[i];
      const actNext = slot + 1 < S ? dp[i + 1][slot + 1] : 0;
      const v = Math.max(dp[i + 1][slot], delta + actNext);
      dp[i][slot] = v;
      b.push("table-write", [i, slot],
        `${LABEL(slot)}: dp[${i}][${slot}] = max(skip ${dp[i + 1][slot]}, act ${delta}+next=${delta + (slot + 1 < S ? dp[i + 1][slot + 1] : 0)}) = ${v}.`,
        { value: v, deps: [[i + 1, slot], [i + 1, Math.min(slot + 1, S - 1)]], codeAnchor: "transition" });
    }

  const answer = dp[0][0];
  b.push("table-read", [0, 0], `Answer at top-left: dp[0][0] = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: `max profit (≤${k} trades)`,
      tableShape: { rows: n + 1, cols: S },
      axisLabels: axisFor(n, k),
      valueFormat: "int",
      stats: { steps: b.count, writes: S * n + 1 },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const { prices: p, k } = input;
  const n = p.length;
  const S = 2 * k;
  const b = new TraceBuilder();

  let next = new Array(S).fill(0);
  for (let s = 0; s < S; s++)
    b.push("base-case", [n, s], "Bottom row zeros.", { value: 0, codeAnchor: "init" });

  for (let i = n - 1; i >= 0; i--) {
    const cur = new Array(S).fill(0);
    for (let slot = S - 1; slot >= 0; slot--) {
      const delta = slot % 2 === 0 ? -p[i] : p[i];
      cur[slot] = Math.max(next[slot], delta + (slot + 1 < S ? next[slot + 1] : 0));
      b.push("table-write", [i, slot], `${LABEL(slot)}: cur[${slot}] = ${cur[slot]} (next row only).`, {
        value: cur[slot], deps: [[i + 1, slot]], codeAnchor: "transition",
      });
    }
    next = cur;
  }
  const answer = next[0];
  b.push("table-read", [0, 0], `Answer survives in the last row: ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer,
      answerLabel: `max profit (≤${k} trades)`,
      tableShape: { rows: n + 1, cols: S },
      axisLabels: axisFor(n, k),
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: S * n + 1 },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int i, int slot, vector<int>& p, int K) {
    if (i == (int)p.size() || slot == 2 * K) return 0;   // base
    int skip = f(i + 1, slot, p, K);                     // recurse
    int delta = slot % 2 == 0 ? -p[i] : p[i];
    return max(skip, delta + f(i + 1, slot + 1, p, K)); // combine
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
`static int f(int i, int slot, int[] p, int K) {
    if (i == p.length || slot == 2 * K) return 0;         // base
    int skip = f(i + 1, slot, p, K);                      // recurse
    int delta = slot % 2 == 0 ? -p[i] : p[i];
    return Math.max(skip, delta + f(i + 1, slot + 1, p, K)); // combine
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
`def f(i, slot, p, K):
    if i == len(p) or slot == 2 * K:            # base
        return 0
    skip = f(i + 1, slot, p, K)                 # recurse
    delta = -p[i] if slot % 2 == 0 else p[i]
    return max(skip, delta + f(i + 1, slot + 1, p, K))   # combine
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
`function f(i, slot, p, K) {
  if (i === p.length || slot === 2 * K) return 0;   // base
  const skip = f(i + 1, slot, p, K);                // recurse
  const delta = slot % 2 === 0 ? -p[i] : p[i];
  return Math.max(skip, delta + f(i + 1, slot + 1, p, K)); // combine
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
`int f(int i, int slot, vector<int>& p, int K, vector<vector<int>>& memo) {
    if (i == (int)p.size() || slot == 2 * K) return 0;     // base
    if (memo[i][slot] != -1) return memo[i][slot];         // memo check
    int skip = f(i + 1, slot, p, K, memo);
    int delta = slot % 2 == 0 ? -p[i] : p[i];              // recurse
    return memo[i][slot] =
        max(skip, delta + f(i + 1, slot + 1, p, K, memo)); // memo store
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
`static int f(int i, int slot, int[] p, int K, int[][] memo) {
    if (i == p.length || slot == 2 * K) return 0;           // base
    if (memo[i][slot] != -1) return memo[i][slot];          // memo check
    int skip = f(i + 1, slot, p, K, memo);
    int delta = slot % 2 == 0 ? -p[i] : p[i];               // recurse
    return memo[i][slot] =
        Math.max(skip, delta + f(i + 1, slot + 1, p, K, memo)); // memo store
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
`def f(i, slot, p, K, memo):
    if i == len(p) or slot == 2 * K:                 # base
        return 0
    if memo[i][slot] != -1:                          # memo check
        return memo[i][slot]
    skip = f(i + 1, slot, p, K, memo)
    delta = -p[i] if slot % 2 == 0 else p[i]         # recurse
    memo[i][slot] = max(skip, delta + f(i + 1, slot + 1, p, K, memo))
    return memo[i][slot]                             # memo store
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
`function f(i, slot, p, K, memo) {
  if (i === p.length || slot === 2 * K) return 0;       // base
  if (memo[i][slot] !== -1) return memo[i][slot];       // memo check
  const skip = f(i + 1, slot, p, K, memo);
  const delta = slot % 2 === 0 ? -p[i] : p[i];          // recurse
  memo[i][slot] = Math.max(skip, delta + f(i + 1, slot + 1, p, K, memo));
  return memo[i][slot];                                 // memo store
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
`int maxProfit(int k, vector<int>& p) {
    int n = p.size(), S = 2 * k;
    vector<vector<int>> dp(n + 1, vector<int>(S, 0));   // base row zeros
    for (int i = n - 1; i >= 0; --i)
        for (int s = S - 1; s >= 0; --s) {
            int delta = s % 2 == 0 ? -p[i] : p[i];
            dp[i][s] = max(dp[i + 1][s],                 // transition
                           delta + dp[i + 1][min(s + 1, S - 1)]);
        }
    return dp[0][0];                                    // driver
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { base: "base row zeros", transition: "transition", driver: "driver",
      combine: "// anchor: combine",
      init: "// anchor: init",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse"
    },
    ),
    java: withAnchors(
`static int maxProfit(int k, int[] p) {
    int n = p.length, S = 2 * k;
    int[][] dp = new int[n + 1][S];                      // base row zeros
    for (int i = n - 1; i >= 0; --i)
        for (int s = S - 1; s >= 0; --s) {
            int delta = s % 2 == 0 ? -p[i] : p[i];
            dp[i][s] = Math.max(dp[i + 1][s],             // transition
                    delta + dp[i + 1][Math.min(s + 1, S - 1)]);
        }
    return dp[0][0];                                     // driver
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { base: "base row zeros", transition: "transition", driver: "driver",
      combine: "// anchor: combine",
      init: "// anchor: init",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse"
    },
    ),
    python: withAnchors(
`def max_profit(k, p):
    n, S = len(p), 2 * k
    dp = [[0] * S for _ in range(n + 1)]            # base row zeros
    for i in range(n - 1, -1, -1):
        for s in range(S - 1, -1, -1):
            delta = -p[i] if s % 2 == 0 else p[i]
            dp[i][s] = max(dp[i + 1][s],             # transition
                           delta + dp[i + 1][min(s + 1, S - 1)])
    return dp[0][0]                                  # driver
# anchor: combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
`,
      { base: "base row zeros", transition: "transition", driver: "driver",
      combine: "# anchor: combine",
      init: "# anchor: init",
      memoCheck: "# anchor: memoCheck",
      memoStore: "# anchor: memoStore",
      recurse: "# anchor: recurse"
    },
    ),
    js: withAnchors(
`function maxProfit(k, p) {
  const n = p.length, S = 2 * k;
  const dp = Array.from({ length: n + 1 }, () => new Array(S).fill(0)); // base
  for (let i = n - 1; i >= 0; i--)
    for (let s = S - 1; s >= 0; s--) {
      const delta = s % 2 === 0 ? -p[i] : p[i];
      dp[i][s] = Math.max(dp[i + 1][s],             // transition
                          delta + dp[i + 1][Math.min(s + 1, S - 1)]);
    }
  return dp[0][0];                                  // driver
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { base: "base row zeros", transition: "transition", driver: "driver",
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
`int maxProfit(int k, vector<int>& p) {
    int S = 2 * k;
    vector<int> next(S, 0), cur(S, 0);               // init
    for (int i = (int)p.size() - 1; i >= 0; --i) {
        for (int s = S - 1; s >= 0; --s) {
            int delta = s % 2 == 0 ? -p[i] : p[i];
            cur[s] = max(next[s],                     // transition
                         delta + next[min(s + 1, S - 1)]);
        }
        next = cur;
    }
    return next[0];                                  // driver
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
`static int maxProfit(int k, int[] p) {
    int S = 2 * k;
    int[] next = new int[S], cur = new int[S];       // init
    for (int i = p.length - 1; i >= 0; --i) {
        for (int s = S - 1; s >= 0; --s) {
            int delta = s % 2 == 0 ? -p[i] : p[i];
            cur[s] = Math.max(next[s],                // transition
                    delta + next[Math.min(s + 1, S - 1)]);
        }
        next = cur;
    }
    return next[0];                                  // driver
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
`def max_profit(k, p):
    S = 2 * k
    nxt = [0] * S                                 # init
    for i in range(len(p) - 1, -1, -1):
        cur = [0] * S
        for s in range(S - 1, -1, -1):
            delta = -p[i] if s % 2 == 0 else p[i]
            cur[s] = max(nxt[s],                   # transition
                         delta + nxt[min(s + 1, S - 1)])
        nxt = cur
    return nxt[0]                                 # driver
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
`function maxProfit(k, p) {
  const S = 2 * k;
  let next = new Array(S).fill(0);              // init
  for (let i = p.length - 1; i >= 0; i--) {
    const cur = new Array(S).fill(0);
    for (let s = S - 1; s >= 0; s--) {
      const delta = s % 2 === 0 ? -p[i] : p[i];
      cur[s] = Math.max(next[s],                 // transition
                        delta + next[Math.min(s + 1, S - 1)]);
    }
    next = cur;
  }
  return next[0];                               // driver
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

export const stockIV: ProblemServiceDef = {
  slug: "stock-iv",
  patternSlug: "dp-stocks",
  inputDescriptor: [
    { key: "prices", label: "PRICES / DAY", kind: "array", min: 2, max: 8, valueRange: [1, 9] },
    { key: "k", label: "MAX TRADES K", kind: "number", min: 1, max: 3 },
  ],
  schema,
  defaultInput: { prices: [2, 4, 1], k: 2 }, // LC188 example → 2
  randomInput: () => ({
    prices: Array.from({ length: 3 + Math.floor(Math.random() * 5) }, () => 1 + Math.floor(Math.random() * 9)),
    k: 1 + Math.floor(Math.random() * 3),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : mode === "tabulation" ? genTab(input as In) : genSpace(input as In),
  codes,
};
