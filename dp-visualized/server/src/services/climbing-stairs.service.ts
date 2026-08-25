import { z } from "zod";
import { TraceBuilder, computeStats } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* ------------------------------------------------------------------ */
/* Algorithm                                                           */
/* ------------------------------------------------------------------ */

const schema = z.object({ n: z.number().int().min(1).max(45) });

type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && input.n > 12)
    return "Pure recursion makes ~fib(n) calls (exponential). Reduce n to 12 or switch to Memoization.";
  if (mode === "memo" && input.n > 30) return "Keep n <= 30 for the memoization walkthrough.";
  return null;
}

/** Pure brute force: full exponential expansion. Revisited states are flagged
 * `dup` (red-highlighted) but NOT collapsed — watching the blow-up is the point.
 * Input caps keep traces renderable. */
function genBrute(input: In): GeneratedTrace {
  const { n } = input;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<number>();

  function climb(k: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (k <= 1) {
      b.push("recurse-call", [k], `climb(${k}) called — base case, one way to stand here.`, { callId, parentCallId, codeAnchor: "base" });
      b.push("base-case", [k], `Base case: ways(${k}) = 1.`, { callId, parentCallId, value: 1 });
      return 1;
    }
    const dup = seen.has(k);
    b.push("recurse-call", [k],
      dup
        ? `climb(${k}) called AGAIN — this subproblem was already solved elsewhere; watch this whole subtree repeat.`
        : `climb(${k}) called. It splits into climb(${k - 1}) (take 1 step) + climb(${k - 2}) (take 2 steps).`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(k);
    const left = climb(k - 1, callId);
    const right = climb(k - 2, callId);
    const v = left + right;
    b.push("recurse-return", [k], `ways(${k}) = ways(${k - 1}) + ways(${k - 2}) = ${left} + ${right} = ${v}.`, {
      callId,
      parentCallId,
      value: v,
      deps: [[k - 1], [k - 2]],
      codeAnchor: "combine",
    });
    return v;
  }

  const answer = climb(n, undefined);
  return {
    steps: b.steps,
    meta: {
      mode: "bruteforce",
      answer,
      answerLabel: `ways to reach step ${n}`,
      tableShape: null,
      axisLabels: null,
      valueFormat: "int",
      stats: { steps: b.count, calls },
    },
  };
}

function genMemo(input: In): GeneratedTrace {
  const { n } = input;
  const b = new TraceBuilder();
  const memo = new Map<number, number>();
  let calls = 0;
  let hits = 0;

  function climb(k: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [k], `climb(${k}) called.`, { callId, parentCallId, codeAnchor: "recurse" });

    if (k <= 1) {
      b.push("base-case", [k], `Base case: ways(${k}) = 1.`, { callId, parentCallId, value: 1, codeAnchor: "base" });
      return 1;
    }
    if (memo.has(k)) {
      hits++;
      const v = memo.get(k)!;
      b.push("memo-hit", [k], `Memo hit! ways(${k}) = ${v} fetched in O(1) — no re-expansion.`, {
        callId,
        parentCallId,
        value: v,
        codeAnchor: "memoCheck",
      });
      return v;
    }
    const left = climb(k - 1, callId);
    const right = climb(k - 2, callId);
    const v = left + right;
    memo.set(k, v);
    b.push("recurse-return", [k], `ways(${k}) = ${left} + ${right} = ${v}, stored in memo.`, {
      callId,
      parentCallId,
      value: v,
      deps: [[k - 1], [k - 2]],
      codeAnchor: "memoStore",
    });
    return v;
  }

  const answer = climb(n, undefined);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: `ways to reach step ${n}`,
      tableShape: { rows: 1, cols: n + 1 },
      axisLabels: { rowsTitle: "state", colsTitle: "n", rowLabels: ["ways(k)"] },
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const { n } = input;
  const b = new TraceBuilder();
  const dp: number[] = new Array(n + 1).fill(-1);

  b.push("base-case", [0], "dp[0] = 1 — one way to be standing at the ground.", { value: 1, codeAnchor: "base" });
  dp[0] = 1;
  if (n >= 1) {
    b.push("base-case", [1], "dp[1] = 1 — a single 1-step jump.", { value: 1, codeAnchor: "base" });
    dp[1] = 1;
  }
  for (let i = 2; i <= n; i++) {
    const v = dp[i - 1] + dp[i - 2];
    b.push("table-write", [i], `dp[${i}] = dp[${i - 1}] + dp[${i - 2}] = ${dp[i - 1]} + ${dp[i - 2]} = ${v}.`, {
      value: v,
      deps: [[i - 1], [i - 2]],
      codeAnchor: "transition",
    });
    dp[i] = v;
  }
  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer: dp[n],
      answerLabel: `ways to reach step ${n}`,
      tableShape: { rows: 1, cols: n + 1 },
      axisLabels: { rowsTitle: "state", colsTitle: "n", rowLabels: ["dp[n]"] },
      valueFormat: "int",
      stats: { steps: b.count, writes: n + 1 },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const { n } = input;
  const b = new TraceBuilder();
  let prev2 = 1;
  let prev = 1;
  b.push("base-case", [0], "Two variables replace the whole array: prev2 = ways(0) = 1.", { value: 1, codeAnchor: "init" });
  if (n >= 1) b.push("base-case", [1], "prev = ways(1) = 1.", { value: 1, codeAnchor: "init" });
  for (let i = 2; i <= n; i++) {
    const cur = prev + prev2;
    b.push("table-write", [i],
      `cur = prev + prev2 = ${prev} + ${prev2} = ${cur}. Only these two variables are kept — dp[${i - 2}] is discarded.`,
      { value: cur, deps: [[i - 1], [i - 2]], codeAnchor: "transition" });
    prev2 = prev;
    prev = cur;
  }
  const answer = n <= 1 ? 1 : prev;
  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer,
      answerLabel: `ways to reach step ${n}`,
      tableShape: { rows: 1, cols: Math.max(n + 1, 2) },
      axisLabels: { rowsTitle: "state", colsTitle: "n", rowLabels: ["dp[n]"] },
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: Math.max(0, n - 1) + (n >= 0 ? 2 : 0) },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Code snippets                                                       */
/* ------------------------------------------------------------------ */

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int climb(int n) {
    if (n <= 1) return 1;            // base
    // recurse: take 1 or 2 steps
    return climb(n - 1) + climb(n - 2);
}
// answer: climb(n)
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition
// combine`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int climb(int n) {
    if (n <= 1) return 1;            // base
    // recurse: take 1 or 2 steps
    return climb(n - 1) + climb(n - 2);
}
// answer: climb(n)
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition
// combine`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def climb(n):
    if n <= 1:                    # base
        return 1
    # recurse: take 1 or 2 steps
    return climb(n - 1) + climb(n - 2)

# answer: climb(n)
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: transition
# combine`,
      { base: "# base", recurse: "# recurse", combine: "# combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function climb(n) {
  if (n <= 1) return 1;          // base
  // recurse: take 1 or 2 steps
  return climb(n - 1) + climb(n - 2);
}
// answer: climb(n)
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition
// combine`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int climb(int n, vector<int>& memo) {
    if (n <= 1) return 1;                 // base
    if (memo[n] != -1) return memo[n];    // memo check
    memo[n] = climb(n - 1, memo) + climb(n - 2, memo);
    return memo[n];                       // memo store
}
// anchor: combine
// anchor: init
// anchor: recurse
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", recurse: "// anchor: recurse", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int climb(int n, int[] memo) {
    if (n <= 1) return 1;                 // base
    if (memo[n] != -1) return memo[n];    // memo check
    memo[n] = climb(n - 1, memo) + climb(n - 2, memo);
    return memo[n];                       // memo store
}
// anchor: combine
// anchor: init
// anchor: recurse
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", recurse: "// anchor: recurse", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def climb(n, memo):
    if n <= 1:                       # base
        return 1
    if memo[n] != -1:                # memo check
        return memo[n]
    memo[n] = climb(n - 1, memo) + climb(n - 2, memo)
    return memo[n]                   # memo store
# anchor: combine
# anchor: init
# anchor: recurse
# anchor: transition
# memoCheck
# memoStore`,
      { base: "# base", memoCheck: "# memoCheck", memoStore: "# memoStore", combine: "# anchor: combine", init: "# anchor: init", recurse: "# anchor: recurse", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function climb(n, memo) {
  if (n <= 1) return 1;               // base
  if (memo[n] !== -1) return memo[n]; // memo check
  memo[n] = climb(n - 1, memo) + climb(n - 2, memo);
  return memo[n];                     // memo store
}
// anchor: combine
// anchor: init
// anchor: recurse
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", recurse: "// anchor: recurse", transition: "// anchor: transition" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int climb(int n) {
    vector<int> dp(n + 1);
    dp[0] = 1;                          // base
    if (n >= 1) dp[1] = 1;              // base
    for (int i = 2; i <= n; ++i)
        dp[i] = dp[i - 1] + dp[i - 2];  // transition
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
`static int climb(int n) {
    int[] dp = new int[n + 1];
    dp[0] = 1;                          // base
    if (n >= 1) dp[1] = 1;              // base
    for (int i = 2; i <= n; ++i)
        dp[i] = dp[i - 1] + dp[i - 2];  // transition
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
`def climb(n):
    dp = [0] * (n + 1)
    dp[0] = 1                        # base
    if n >= 1: dp[1] = 1             # base
    for i in range(2, n + 1):
        dp[i] = dp[i - 1] + dp[i - 2]   # transition
    return dp[n]
# anchor: combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", transition: "# transition", combine: "# anchor: combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function climb(n) {
  const dp = new Array(n + 1).fill(0);
  dp[0] = 1;                              // base
  if (n >= 1) dp[1] = 1;                  // base
  for (let i = 2; i <= n; i++)
    dp[i] = dp[i - 1] + dp[i - 2];        // transition
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
`int climb(int n) {
    int prev2 = 1, prev = 1;             // init
    for (int i = 2; i <= n; ++i) {
        int cur = prev + prev2;          // transition
        prev2 = prev; prev = cur;
    }
    return prev;
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int climb(int n) {
    int prev2 = 1, prev = 1;             // init
    for (int i = 2; i <= n; ++i) {
        int cur = prev + prev2;          // transition
        prev2 = prev; prev = cur;
    }
    return prev;
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def climb(n):
    prev2 = prev = 1                  # init
    for _ in range(2, n + 1):
        prev2, prev = prev, prev + prev2   # transition
    return prev
# anchor: base
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { init: "# init", transition: "# transition", base: "# anchor: base", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function climb(n) {
  let prev2 = 1, prev = 1;         // init
  for (let i = 2; i <= n; i++) {
    const cur = prev + prev2;      // transition
    prev2 = prev; prev = cur;
  }
  return prev;
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

export const climbingStairs: ProblemServiceDef = {
  slug: "climbing-stairs",
  patternSlug: "1d-dp",
  inputDescriptor: [{ key: "n", label: "STAIRS", kind: "number", min: 1, max: 30 }],
  schema,
  defaultInput: { n: 10 },
  randomInput: () => ({ n: 5 + Math.floor(Math.random() * 21) }),
  limitsPerMode: {
    bruteforce: limits,
    memo: limits,
    tabulation: limits,
    spaceOptimized: limits,
  },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input) : mode === "memo" ? genMemo(input) : mode === "tabulation" ? genTab(input) : genSpace(input),
  codes,
};

export type { In as ClimbingStairsInput };
