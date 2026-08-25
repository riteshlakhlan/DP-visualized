import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Buy/Sell Stock III (Striver DP-37): at most TWO complete transactions.
 * Transaction slots: 0=buy#1 1=sell#1 2=buy#2 3=sell#2.
 * f(i, slot): best profit from day i onward given slot is next allowed.
 *   skip: f(i+1, slot)
 *   even slot → buy: −p[i] + f(i+1, slot+1)
 *   odd slot  → sell: +p[i] + f(i+1, slot+1)
 */

const schema = z.object({
  prices: z.array(z.number().int().min(0).max(20)).min(2).max(8),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && Math.pow(3, input.prices.length) > 3000)
    return "Pure recursion branches ~3 ways per day. Use at most 6 days for Brute Force.";
  return null;
}

const SLOT_LABELS = ["buy#1", "sell#1", "buy#2", "sell#2"];
const axisFor = (n: number) => ({
  rowsTitle: "day",
  colsTitle: "next allowed action",
  rowLabels: [...Array.from({ length: n + 1 }, (_, i) => `d${i}`)],
  colLabels: SLOT_LABELS,
});

function genBrute(input: In): GeneratedTrace {
  const p = input.prices;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<string>();

  function f(i: number, slot: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i === p.length || slot === 4) {
      b.push("base-case", [Math.min(i, p.length), Math.min(slot, 3)], "Out of days or slots done → 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    const dup = seen.has(`${i},${slot}`);
    b.push("recurse-call", [i, slot],
      dup ? `f(${i},${slot}) called AGAIN.` : `f(${i},${slot}) called: next action ${SLOT_LABELS[slot]} at price ${p[i]}.`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(`${i},${slot}`);
    const skip = f(i + 1, slot, callId);
    const delta = slot % 2 === 0 ? -p[i] : p[i];
    const act = delta + f(i + 1, slot + 1, callId);
    const v = Math.max(skip, act);
    b.push("recurse-return", [i, slot],
      `f(${i},${slot}) = max(skip ${skip}, ${SLOT_LABELS[slot]} ${delta}+next=${act}) = ${v}.`,
      { callId, parentCallId, value: v, deps: [[i + 1, slot], [i + 1, slot + 1]], codeAnchor: "combine" });
    return v;
  }

  const answer = f(0, 0);
  return {
    steps: b.steps,
    meta: { mode: "bruteforce", answer, answerLabel: "max profit (≤2 trades)", tableShape: null, axisLabels: null, valueFormat: "int", stats: { steps: b.count, calls } },
  };
}

function genMemo(input: In): GeneratedTrace {
  const p = input.prices;
  const n = p.length;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, slot: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i === n || slot === 4) {
      b.push("base-case", [Math.min(i, n), Math.min(slot, 3)], "Base case → 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
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
      answerLabel: "max profit (≤2 trades)",
      tableShape: { rows: n + 1, cols: 4 },
      axisLabels: axisFor(n),
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const p = input.prices;
  const n = p.length;
  const b = new TraceBuilder();
  const dp: number[][] = Array.from({ length: n + 1 }, () => [0, 0, 0, 0]);

  // fill bottom-up; row n is all zeros (base)
  for (let i = n - 1; i >= 0; i--)
    for (let slot = 3; slot >= 0; slot--) {
      const skip = dp[i + 1][slot];
      const delta = slot % 2 === 0 ? -p[i] : p[i];
      const act = delta + (slot + 1 < dp[i + 1].length ? dp[i + 1][slot + 1] : 0);
      const v = Math.max(skip, act);
      dp[i][slot] = v;
      b.push("table-write", [i, slot],
        `${SLOT_LABELS[slot]}: dp[${i}][${slot}] = max(skip ${skip}, act ${delta}+dp[${i + 1}][${slot + 1}]=${act}) = ${v}.`,
        { value: v, deps: [[i + 1, slot], [i + 1, Math.min(slot + 1, 3)]], codeAnchor: "transition" });
    }

  const answer = dp[0][0];
  b.push("table-read", [0, 0], `Answer at top-left: dp[0][0] = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "max profit (≤2 trades)",
      tableShape: { rows: n + 1, cols: 4 },
      axisLabels: axisFor(n),
      valueFormat: "int",
      stats: { steps: b.count, writes: 4 * n + 1 },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const p = input.prices;
  const n = p.length;
  const b = new TraceBuilder();

  let next = [0, 0, 0, 0];
  for (let s = 0; s < 4; s++)
    b.push("base-case", [n, s], "Bottom row = zeros.", { value: 0, codeAnchor: "init" });

  for (let i = n - 1; i >= 0; i--) {
    const cur = [0, 0, 0, 0];
    for (let slot = 3; slot >= 0; slot--) {
      const delta = slot % 2 === 0 ? -p[i] : p[i];
      cur[slot] = Math.max(next[slot], delta + (slot < 3 ? next[slot + 1] : 0));
      b.push("table-write", [i, slot], `${SLOT_LABELS[slot]}: cur[${slot}] = ${cur[slot]} (from next row only).`, {
        value: cur[slot], deps: [[i + 1, slot]], codeAnchor: "transition",
      });
    }
    next = cur;
  }
  const answer = next[0];
  b.push("table-read", [0, 0], `Answer survives in the last computed row: ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer,
      answerLabel: "max profit (≤2 trades)",
      tableShape: { rows: n + 1, cols: 4 },
      axisLabels: axisFor(n),
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: 4 * n + 1 },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int i, int slot, vector<int>& p) {
    if (i == (int)p.size() || slot == 4) return 0;   // base
    int skip = f(i + 1, slot, p);                    // recurse
    int delta = slot % 2 == 0 ? -p[i] : p[i];
    return max(skip, delta + f(i + 1, slot + 1, p)); // combine
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
`static int f(int i, int slot, int[] p) {
    if (i == p.length || slot == 4) return 0;         // base
    int skip = f(i + 1, slot, p);                     // recurse
    int delta = slot % 2 == 0 ? -p[i] : p[i];
    return Math.max(skip, delta + f(i + 1, slot + 1, p)); // combine
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
`def f(i, slot, p):
    if i == len(p) or slot == 4:              # base
        return 0
    skip = f(i + 1, slot, p)                  # recurse
    delta = -p[i] if slot % 2 == 0 else p[i]
    return max(skip, delta + f(i + 1, slot + 1, p))   # combine
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
`function f(i, slot, p) {
  if (i === p.length || slot === 4) return 0;   // base
  const skip = f(i + 1, slot, p);               // recurse
  const delta = slot % 2 === 0 ? -p[i] : p[i];
  return Math.max(skip, delta + f(i + 1, slot + 1, p)); // combine
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
`int f(int i, int slot, vector<int>& p, vector<vector<int>>& memo) {
    if (i == (int)p.size() || slot == 4) return 0;    // base
    if (memo[i][slot] != -1) return memo[i][slot];    // memo check
    int skip = f(i + 1, slot, p, memo);
    int delta = slot % 2 == 0 ? -p[i] : p[i];         // recurse
    return memo[i][slot] =
        max(skip, delta + f(i + 1, slot + 1, p, memo)); // memo store
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
`static int f(int i, int slot, int[] p, int[][] memo) {
    if (i == p.length || slot == 4) return 0;          // base
    if (memo[i][slot] != -1) return memo[i][slot];     // memo check
    int skip = f(i + 1, slot, p, memo);
    int delta = slot % 2 == 0 ? -p[i] : p[i];          // recurse
    return memo[i][slot] =
        Math.max(skip, delta + f(i + 1, slot + 1, p, memo)); // memo store
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
`def f(i, slot, p, memo):
    if i == len(p) or slot == 4:                # base
        return 0
    if memo[i][slot] != -1:                     # memo check
        return memo[i][slot]
    skip = f(i + 1, slot, p, memo)
    delta = -p[i] if slot % 2 == 0 else p[i]    # recurse
    memo[i][slot] = max(skip, delta + f(i + 1, slot + 1, p, memo))
    return memo[i][slot]                        # memo store
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
`function f(i, slot, p, memo) {
  if (i === p.length || slot === 4) return 0;       // base
  if (memo[i][slot] !== -1) return memo[i][slot];   // memo check
  const skip = f(i + 1, slot, p, memo);
  const delta = slot % 2 === 0 ? -p[i] : p[i];      // recurse
  memo[i][slot] = Math.max(skip, delta + f(i + 1, slot + 1, p, memo));
  return memo[i][slot];                             // memo store
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
    vector<vector<int>> dp(n + 1, vector<int>(4, 0));   // base row zeros
    for (int i = n - 1; i >= 0; --i)
        for (int slot = 3; slot >= 0; --slot) {
            int delta = slot % 2 == 0 ? -p[i] : p[i];
            dp[i][slot] = max(dp[i + 1][slot],           // transition
                              delta + dp[i + 1][slot + 1]);
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
`static int maxProfit(int[] p) {
    int n = p.length;
    int[][] dp = new int[n + 1][4];                      // base row zeros
    for (int i = n - 1; i >= 0; --i)
        for (int slot = 3; slot >= 0; --slot) {
            int delta = slot % 2 == 0 ? -p[i] : p[i];
            dp[i][slot] = Math.max(dp[i + 1][slot],       // transition
                                   delta + dp[i + 1][slot + 1]);
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
`def max_profit(p):
    n = len(p)
    dp = [[0] * 4 for _ in range(n + 1)]             # base row zeros
    for i in range(n - 1, -1, -1):
        for slot in range(3, -1, -1):
            delta = -p[i] if slot % 2 == 0 else p[i]
            dp[i][slot] = max(dp[i + 1][slot],        # transition
                              delta + dp[i + 1][slot + 1])
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
`function maxProfit(p) {
  const n = p.length;
  const dp = Array.from({ length: n + 1 }, () => [0, 0, 0, 0]); // base row zeros
  for (let i = n - 1; i >= 0; i--)
    for (let slot = 3; slot >= 0; slot--) {
      const delta = slot % 2 === 0 ? -p[i] : p[i];
      dp[i][slot] = Math.max(dp[i + 1][slot],         // transition
                             delta + dp[i + 1][slot + 1]);
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
  },
  spaceOptimized: {
    cpp: withAnchors(
`int maxProfit(vector<int>& p) {
    vector<int> next(4, 0), cur(4, 0);              // init
    for (int i = (int)p.size() - 1; i >= 0; --i)
        for (int slot = 3; slot >= 0; --slot) {
            int delta = slot % 2 == 0 ? -p[i] : p[i];
            cur[slot] = max(next[slot],              // transition
                            delta + next[slot + 1]);
        }
        next = cur;
    return next[0];                                 // driver
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
    int[] next = new int[4], cur = new int[4];       // init
    for (int i = p.length - 1; i >= 0; --i)
        for (int slot = 3; slot >= 0; --slot) {
            int delta = slot % 2 == 0 ? -p[i] : p[i];
            cur[slot] = Math.max(next[slot],          // transition
                                 delta + next[slot + 1]);
        }
        next = cur;
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
`def max_profit(p):
    nxt = [0] * 4                                 # init
    for i in range(len(p) - 1, -1, -1):
        cur = [0] * 4
        for slot in range(3, -1, -1):
            delta = -p[i] if slot % 2 == 0 else p[i]
            cur[slot] = max(nxt[slot],             # transition
                            delta + nxt[min(slot + 1, 3)])
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
`function maxProfit(p) {
  let next = new Array(4).fill(0);              // init
  for (let i = p.length - 1; i >= 0; i--) {
    const cur = new Array(4).fill(0);
    for (let slot = 3; slot >= 0; slot--) {
      const delta = slot % 2 === 0 ? -p[i] : p[i];
      cur[slot] = Math.max(next[slot],           // transition
                           delta + next[Math.min(slot + 1, 3)]);
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

export const stockIII: ProblemServiceDef = {
  slug: "stock-iii",
  patternSlug: "dp-stocks",
  inputDescriptor: [
    { key: "prices", label: "PRICES / DAY", kind: "array", min: 2, max: 8, valueRange: [1, 9] },
  ],
  schema,
  defaultInput: { prices: [3, 3, 5, 0, 0, 3] }, // exhaustive-verified → 5
  randomInput: () => ({
    prices: Array.from({ length: 3 + Math.floor(Math.random() * 5) }, () => 1 + Math.floor(Math.random() * 9)),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : mode === "tabulation" ? genTab(input as In) : genSpace(input as In),
  codes,
};
