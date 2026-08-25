import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Frog Jump (Striver DP-3): frog on stair 0 wants to reach stair n-1.
 * It can jump 1 or 2 stairs; energy lost = |h[i] - h[j]|. Minimize total energy.
 */

const schema = z.object({
  heights: z.array(z.number().int().min(1).max(100)).min(2).max(12),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && input.heights.length > 9)
    return "Pure recursion explores ~2^n jump paths. Use at most 9 stones for Brute Force, or switch to Memoization.";
  return null;
}

function genBrute(input: In): GeneratedTrace {
  const h = input.heights;
  const n = h.length;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<number>();

  function f(i: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i === 0) {
      b.push("recurse-call", [i], "f(0) called: the frog starts here.", { callId, parentCallId, codeAnchor: "base" });
      b.push("base-case", [i], "Base case: cost to be at the start is 0.", { callId, value: 0, codeAnchor: "base" });
      return 0;
    }
    const dup = seen.has(i);
    b.push("recurse-call", [i],
      dup ? `f(${i}) called AGAIN — already solved elsewhere; this subtree repeats.`
          : `f(${i}) called: cheapest cost to reach stone ${i} (height ${h[i]}).`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(i);
    const one = f(i - 1, callId) + Math.abs(h[i] - h[i - 1]);
    let two = Infinity;
    if (i > 1) two = f(i - 2, callId) + Math.abs(h[i] - h[i - 2]);
    const v = Math.min(one, two);
    b.push("recurse-return", [i],
      i > 1
        ? `f(${i}) = min(jump-1: ${one}, jump-2: ${two}) = ${v}.`
        : `f(${i}) = ${one} (only a 1-jump reaches stone ${i}).`,
      { callId, parentCallId, value: v, deps: [[Math.max(0, i - 1)], [Math.max(0, i - 2)]], codeAnchor: "combine" });
    return v;
  }

  const answer = f(n - 1);
  return {
    steps: b.steps,
    meta: {
      mode: "bruteforce",
      answer,
      answerLabel: "minimum total energy",
      tableShape: null,
      axisLabels: null,
      valueFormat: "int",
      stats: { steps: b.count, calls },
    },
  };
}

function genMemo(input: In): GeneratedTrace {
  const h = input.heights;
  const n = h.length;
  const b = new TraceBuilder();
  const memo = new Map<number, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i], `f(${i}) called: cheapest cost to reach stone ${i}.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (i === 0) {
      b.push("base-case", [i], "Base case: f(0) = 0.", { callId, value: 0, codeAnchor: "base" });
      return 0;
    }
    if (memo.has(i)) {
      hits++;
      const v = memo.get(i)!;
      b.push("memo-hit", [i], `Memo hit! f(${i}) = ${v} fetched instantly.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    const one = f(i - 1, callId) + Math.abs(h[i] - h[i - 1]);
    let two = Infinity;
    if (i > 1) two = f(i - 2, callId) + Math.abs(h[i] - h[i - 2]);
    const v = Math.min(one, two);
    memo.set(i, v);
    b.push("recurse-return", [i],
      i > 1 ? `f(${i}) = min(${one}, ${two}) = ${v}, stored in memo.` : `f(${i}) = ${v}, stored in memo.`,
      { callId, parentCallId, value: v, deps: [[Math.max(0, i - 1)], [Math.max(0, i - 2)]], codeAnchor: "memoStore" });
    return v;
  }

  const answer = f(n - 1);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "minimum total energy",
      tableShape: { rows: 1, cols: n },
      axisLabels: { rowsTitle: "state", colsTitle: "stone index", rowLabels: ["f(i)"] },
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const h = input.heights;
  const n = h.length;
  const b = new TraceBuilder();
  const dp: number[] = new Array(n).fill(-1);
  dp[0] = 0;
  b.push("base-case", [0], "dp[0] = 0 — standing at the start costs nothing.", { value: 0, codeAnchor: "base" });
  for (let i = 1; i < n; i++) {
    const one = dp[i - 1] + Math.abs(h[i] - h[i - 1]);
    let two = Infinity;
    if (i > 1) two = dp[i - 2] + Math.abs(h[i] - h[i - 2]);
    const v = Math.min(one, two);
    b.push("table-write", [i],
      i > 1
        ? `dp[${i}] = min(dp[${i - 1}] + ${Math.abs(h[i] - h[i - 1])}, dp[${i - 2}] + ${Math.abs(h[i] - h[i - 2])}) = min(${one}, ${two}) = ${v}.`
        : `dp[${i}] = dp[0] + ${Math.abs(h[i] - h[0])} = ${v}.`,
      { value: v, deps: [[Math.max(0, i - 1)], [Math.max(0, i - 2)]], codeAnchor: "transition" });
    dp[i] = v;
  }
  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer: dp[n - 1],
      answerLabel: "minimum total energy",
      tableShape: { rows: 1, cols: n },
      axisLabels: { rowsTitle: "state", colsTitle: "stone index", rowLabels: ["dp[i]"] },
      valueFormat: "int",
      stats: { steps: b.count, writes: n },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const h = input.heights;
  const n = h.length;
  const b = new TraceBuilder();
  let prev2 = 0;
  let prev = 0;
  b.push("base-case", [0], "prev2 = prev = 0: two variables replace the array.", { value: 0, codeAnchor: "init" });
  for (let i = 1; i < n; i++) {
    const one = prev + Math.abs(h[i] - h[i - 1]);
    let two = Infinity;
    if (i > 1) two = prev2 + Math.abs(h[i] - h[i - 2]);
    const v = Math.min(one, two);
    b.push("table-write", [i], `cur = min(${one === Infinity ? "∞" : one}, ${two === Infinity ? "∞" : two}) = ${v}; older variable discarded.`, {
      value: v,
      deps: [[Math.max(0, i - 1)], [Math.max(0, i - 2)]],
      codeAnchor: "transition",
    });
    prev2 = prev;
    prev = v;
  }
  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer: prev,
      answerLabel: "minimum total energy",
      tableShape: { rows: 1, cols: n },
      axisLabels: { rowsTitle: "state", colsTitle: "stone index", rowLabels: ["dp[i]"] },
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: n - 1 + 1 },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int frog(int i, vector<int>& h) {
    if (i == 0) return 0;                                  // base
    int one = frog(i - 1, h) + abs(h[i] - h[i - 1]);
    int two = INT_MAX;
    if (i > 1)
        two = frog(i - 2, h) + abs(h[i] - h[i - 2]);       // recurse
    return min(one, two);                                  // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int frog(int i, int[] h) {
    if (i == 0) return 0;                                  // base
    int one = frog(i - 1, h) + Math.abs(h[i] - h[i - 1]);
    int two = Integer.MAX_VALUE;
    if (i > 1)
        two = frog(i - 2, h) + Math.abs(h[i] - h[i - 2]);  // recurse
    return Math.min(one, two);                             // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`import math

def frog(i, h):
    if i == 0:                                   # base
        return 0
    one = frog(i - 1, h) + abs(h[i] - h[i - 1])
    two = math.inf
    if i > 1:
        two = frog(i - 2, h) + abs(h[i] - h[i - 2])   # recurse
    return min(one, two)                         # combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: transition`,
      { base: "# base", recurse: "# recurse", combine: "# combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function frog(i, h) {
  if (i === 0) return 0;                              // base
  const one = frog(i - 1, h) + Math.abs(h[i] - h[i - 1]);
  let two = Infinity;
  if (i > 1) two = frog(i - 2, h) + Math.abs(h[i] - h[i - 2]); // recurse
  return Math.min(one, two);                          // combine
}
// anchor: memoCheck
// anchor: memoStore
// anchor: transition
// anchor: init`,
      { base: "// base", recurse: "// recurse", combine: "// combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition", init: "// anchor: init" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int frog(int i, vector<int>& h, vector<int>& memo) {
    if (i == 0) return 0;                               // base
    if (memo[i] != -1) return memo[i];                  // memo check
    int one = frog(i - 1, h, memo) + abs(h[i] - h[i - 1]);
    int two = INT_MAX;
    if (i > 1)
        two = frog(i - 2, h, memo) + abs(h[i] - h[i - 2]);
    return memo[i] = min(one, two);                     // memo store
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
`static int frog(int i, int[] h, int[] memo) {
    if (i == 0) return 0;                               // base
    if (memo[i] != -1) return memo[i];                  // memo check
    int one = frog(i - 1, h, memo) + Math.abs(h[i] - h[i - 1]);
    int two = Integer.MAX_VALUE;
    if (i > 1)
        two = frog(i - 2, h, memo) + Math.abs(h[i] - h[i - 2]);
    return memo[i] = Math.min(one, two);                // memo store
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
`import math

def frog(i, h, memo):
    if i == 0:                                    # base
        return 0
    if memo[i] != -1:                             # memo check
        return memo[i]
    one = frog(i - 1, h, memo) + abs(h[i] - h[i - 1])
    two = math.inf
    if i > 1:
        two = frog(i - 2, h, memo) + abs(h[i] - h[i - 2])
    memo[i] = min(one, two)
    return memo[i]                                # memo store
# anchor: combine
# anchor: init
# anchor: recurse
# anchor: transition
# memoCheck
# memoStore`,
      { base: "# base", memoCheck: "# memoCheck", memoStore: "# memoStore", combine: "# anchor: combine", init: "# anchor: init", recurse: "# anchor: recurse", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function frog(i, h, memo) {
  if (i === 0) return 0;                                // base
  if (memo[i] !== -1) return memo[i];                   // memo check
  const one = frog(i - 1, h, memo) + Math.abs(h[i] - h[i - 1]);
  let two = Infinity;
  if (i > 1) two = frog(i - 2, h, memo) + Math.abs(h[i] - h[i - 2]);
  memo[i] = Math.min(one, two);
  return memo[i];                                       // memo store
}
// anchor: combine
// anchor: recurse
// anchor: transition
// memoCheck
// memoStore
// anchor: init`,
      { base: "// base", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", recurse: "// anchor: recurse", transition: "// anchor: transition", init: "// anchor: init" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int frogJump(vector<int>& h) {
    int n = h.size();
    vector<int> dp(n, -1);
    dp[0] = 0;                                              // base
    for (int i = 1; i < n; ++i) {
        int one = dp[i - 1] + abs(h[i] - h[i - 1]);
        int two = INT_MAX;
        if (i > 1) two = dp[i - 2] + abs(h[i] - h[i - 2]);
        dp[i] = min(one, two);                              // transition
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
`static int frogJump(int[] h) {
    int n = h.length;
    int[] dp = new int[n];
    Arrays.fill(dp, -1);
    dp[0] = 0;                                              // base
    for (int i = 1; i < n; ++i) {
        int one = dp[i - 1] + Math.abs(h[i] - h[i - 1]);
        int two = Integer.MAX_VALUE;
        if (i > 1) two = dp[i - 2] + Math.abs(h[i] - h[i - 2]);
        dp[i] = Math.min(one, two);                         // transition
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
`import math

def frog_jump(h):
    n = len(h)
    dp = [-1] * n
    dp[0] = 0                                          # base
    for i in range(1, n):
        one = dp[i - 1] + abs(h[i] - h[i - 1])
        two = math.inf
        if i > 1:
            two = dp[i - 2] + abs(h[i] - h[i - 2])
        dp[i] = min(one, two)                          # transition
    return dp[n - 1]
# anchor: combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", transition: "# transition", combine: "# anchor: combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function frogJump(h) {
  const n = h.length;
  const dp = new Array(n).fill(-1);
  dp[0] = 0;                                                 // base
  for (let i = 1; i < n; i++) {
    const one = dp[i - 1] + Math.abs(h[i] - h[i - 1]);
    let two = Infinity;
    if (i > 1) two = dp[i - 2] + Math.abs(h[i] - h[i - 2]);
    dp[i] = Math.min(one, two);                              // transition
  }
  return dp[n - 1];
}
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// anchor: init`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse", init: "// anchor: init" },
    ),
  },
  spaceOptimized: {
    cpp: withAnchors(
`int frogJump(vector<int>& h) {
    int prev2 = 0, prev = 0;                        // init
    for (int i = 1; i < (int)h.size(); ++i) {
        int one = prev + abs(h[i] - h[i - 1]);
        int two = INT_MAX;
        if (i > 1) two = prev2 + abs(h[i] - h[i - 2]);
        int cur = min(one, two);                    // transition
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
`static int frogJump(int[] h) {
    int prev2 = 0, prev = 0;                        // init
    for (int i = 1; i < h.length; ++i) {
        int one = prev + Math.abs(h[i] - h[i - 1]);
        int two = Integer.MAX_VALUE;
        if (i > 1) two = prev2 + Math.abs(h[i] - h[i - 2]);
        int cur = Math.min(one, two);               // transition
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
`import math

def frog_jump(h):
    prev2 = prev = 0                              # init
    for i in range(1, len(h)):
        one = prev + abs(h[i] - h[i - 1])
        two = math.inf
        if i > 1:
            two = prev2 + abs(h[i] - h[i - 2])
        prev2, prev = prev, min(one, two)         # transition
    return prev
# anchor: base
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { init: "# init", transition: "# transition", base: "# anchor: base", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function frogJump(h) {
  let prev2 = 0, prev = 0;                    // init
  for (let i = 1; i < h.length; i++) {
    const one = prev + Math.abs(h[i] - h[i - 1]);
    let two = Infinity;
    if (i > 1) two = prev2 + Math.abs(h[i] - h[i - 2]);
    const cur = Math.min(one, two);           // transition
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

export const frogJump: ProblemServiceDef = {
  slug: "frog-jump",
  patternSlug: "1d-dp",
  inputDescriptor: [
    { key: "heights", label: "STONE HEIGHTS", kind: "array", min: 2, max: 10, valueRange: [1, 100] },
  ],
  schema,
  defaultInput: { heights: [30, 10, 60, 10, 60, 50] },
  randomInput: () => ({
    heights: Array.from({ length: 4 + Math.floor(Math.random() * 5) }, () => 5 + Math.floor(Math.random() * 45)),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input) : mode === "memo" ? genMemo(input) : mode === "tabulation" ? genTab(input) : genSpace(input),
  codes,
};
