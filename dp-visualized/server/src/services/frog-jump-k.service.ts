import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Frog Jump with K distances (Striver DP-4 generalization): the frog may
 * jump 1..K stairs ahead from stone i; each jump costs |h[i] - h[j]|.
 * Minimize total energy to reach the last stone.
 */

const schema = z.object({
  heights: z.array(z.number().int().min(1).max(50)).min(2).max(8),
  k: z.number().int().min(2).max(4),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && Math.pow(input.k, input.heights.length - 1) > 900)
    return `Pure recursion branches k=${input.k} ways per stone (~${input.k}^n paths). Use fewer stones for Brute Force, or switch to Memoization.`;
  return null;
}

const AXIS = { rowsTitle: "state", colsTitle: "stone index", rowLabels: ["f(i)"] };

function genBrute(input: In): GeneratedTrace {
  const { heights: h, k } = input;
  const n = h.length;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<number>();

  function f(i: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i === 0) {
      b.push("recurse-call", [0], "f(0) called: the frog starts here.", { callId, parentCallId, codeAnchor: "base" });
      b.push("base-case", [0], "Base case: standing at stone 0 costs 0.", { callId, value: 0, codeAnchor: "base" });
      return 0;
    }
    const dup = seen.has(i);
    b.push("recurse-call", [i],
      dup ? `f(${i}) called AGAIN — this subtree was already solved elsewhere.`
          : `f(${i}) called: cheapest cost to reach stone ${i} using jumps of 1..${k}.`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(i);
    const options: number[] = [];
    for (let j = 1; j <= Math.min(i, k); j++) options.push(f(i - j, callId) + Math.abs(h[i] - h[i - j]));
    const v = Math.min(...options);
    b.push("recurse-return", [i], `f(${i}) = min(${options.join(", ")}) = ${v}.`, {
      callId,
      parentCallId,
      value: v,
      deps: Array.from({ length: Math.min(i, k) }, (_, idx) => [i - idx - 1]),
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
      answerLabel: "minimum total energy",
      tableShape: null,
      axisLabels: null,
      valueFormat: "int",
      stats: { steps: b.count, calls },
    },
  };
}

function genMemo(input: In): GeneratedTrace {
  const { heights: h, k } = input;
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
      b.push("base-case", [0], "Base case: f(0) = 0.", { callId, value: 0, codeAnchor: "base" });
      return 0;
    }
    if (memo.has(i)) {
      hits++;
      const v = memo.get(i)!;
      b.push("memo-hit", [i], `Memo hit! f(${i}) = ${v} fetched instantly — subtree skipped.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    const options: number[] = [];
    for (let j = 1; j <= Math.min(i, k); j++) options.push(f(i - j, callId) + Math.abs(h[i] - h[i - j]));
    const v = Math.min(...options);
    memo.set(i, v);
    b.push("recurse-return", [i], `f(${i}) = min(${options.join(", ")}) = ${v}, stored in memo.`, {
      callId,
      parentCallId,
      value: v,
      deps: Array.from({ length: Math.min(i, k) }, (_, idx) => [i - idx - 1]),
      codeAnchor: "memoStore",
    });
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
      axisLabels: AXIS,
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const { heights: h, k } = input;
  const n = h.length;
  const b = new TraceBuilder();
  const dp: number[] = new Array(n).fill(-1);
  dp[0] = 0;
  b.push("base-case", [0], "dp[0] = 0 — the start costs nothing.", { value: 0, codeAnchor: "base" });
  for (let i = 1; i < n; i++) {
    let best = Infinity;
    let bestJ = 0;
    for (let j = 1; j <= Math.min(i, k); j++) {
      const cand = dp[i - j] + Math.abs(h[i] - h[i - j]);
      if (cand < best) { best = cand; bestJ = j; }
    }
    const depList = Array.from({ length: Math.min(i, k) }, (_, idx) => [i - idx - 1]);
    b.push("table-write", [i],
      `dp[${i}] = min over jumps j=1..${Math.min(i, k)} → best is j=${bestJ}: dp[${i - bestJ}] + ${Math.abs(h[i] - h[i - bestJ])} = ${best}.`,
      { value: best, deps: depList, codeAnchor: "transition" });
    dp[i] = best;
  }
  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer: dp[n - 1],
      answerLabel: "minimum total energy",
      tableShape: { rows: 1, cols: n },
      axisLabels: AXIS,
      valueFormat: "int",
      stats: { steps: b.count, writes: n },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const { heights: h, k } = input;
  const n = h.length;
  const b = new TraceBuilder();
  // window holds dp values of the last K stones (most recent last).
  const win: number[] = [];
  b.push("base-case", [0], "window = [0]: only the last k values ever matter.", { value: 0, codeAnchor: "init" });
  win.push(0);
  for (let i = 1; i < n; i++) {
    const options: number[] = [];
    for (let j = 1; j <= Math.min(i, k); j++) options.push(win[win.length - j] + Math.abs(h[i] - h[i - j]));
    const v = Math.min(...options);
    if (win.length === k) win.shift();
    win.push(v);
    b.push("table-write", [i],
      `cur = min(${options.join(", ")}) = ${v}; window keeps only the last ${k} values.`,
      { value: v, deps: Array.from({ length: Math.min(i, k) }, (_, idx) => [i - idx - 1]), codeAnchor: "transition" });
  }
  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer: win[win.length - 1],
      answerLabel: "minimum total energy",
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
`int frog(int i, vector<int>& h, int k) {
    if (i == 0) return 0;                                   // base
    int best = INT_MAX;
    for (int j = 1; j <= min(i, k); ++j)                    // recurse
        best = min(best, frog(i - j, h, k) + abs(h[i] - h[i - j]));
    return best;                                            // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int frog(int i, int[] h, int k) {
    if (i == 0) return 0;                                   // base
    int best = Integer.MAX_VALUE;
    for (int j = 1; j <= Math.min(i, k); ++j)               // recurse
        best = Math.min(best, frog(i - j, h, k) + Math.abs(h[i] - h[i - j]));
    return best;                                            // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def frog(i, h, k):
    if i == 0:                                        # base
        return 0
    best = math.inf
    for j in range(1, min(i, k) + 1):                 # recurse
        best = min(best, frog(i - j, h, k) + abs(h[i] - h[i - j]))
    return best                                       # combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: transition`,
      { base: "# base", recurse: "# recurse", combine: "# combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function frog(i, h, k) {
  if (i === 0) return 0;                            // base
  let best = Infinity;
  for (let j = 1; j <= Math.min(i, k); j++)         // recurse
    best = Math.min(best, frog(i - j, h, k) + Math.abs(h[i] - h[i - j]));
  return best;                                      // combine
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
`int frog(int i, vector<int>& h, int k, vector<int>& memo) {
    if (i == 0) return 0;                              // base
    if (memo[i] != -1) return memo[i];                 // memo check
    int best = INT_MAX;
    for (int j = 1; j <= min(i, k); ++j)          // recurse
        best = min(best, frog(i - j, h, k, memo) + abs(h[i] - h[i - j]));
    return memo[i] = best;                             // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int frog(int i, int[] h, int k, int[] memo) {
    if (i == 0) return 0;                              // base
    if (memo[i] != -1) return memo[i];                 // memo check
    int best = Integer.MAX_VALUE;
    for (int j = 1; j <= Math.min(i, k); ++j)     // recurse
        best = Math.min(best, frog(i - j, h, k, memo) + Math.abs(h[i] - h[i - j]));
    return memo[i] = best;                             // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def frog(i, h, k, memo):
    if i == 0:                                   # base
        return 0
    if memo[i] != -1:                            # memo check
        return memo[i]
    best = math.inf
    for j in range(1, min(i, k) + 1):             # recurse
        best = min(best, frog(i - j, h, k, memo) + abs(h[i] - h[i - j]))
    memo[i] = best
    return memo[i]                               # memo store
# anchor: combine
# anchor: init
# anchor: transition
# memoCheck
# memoStore`,
      { base: "# base", recurse: "# recurse", memoCheck: "# memoCheck", memoStore: "# memoStore", combine: "# anchor: combine", init: "# anchor: init", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function frog(i, h, k, memo) {
  if (i === 0) return 0;                          // base
  if (memo[i] !== -1) return memo[i];             // memo check
  let best = Infinity;
  for (let j = 1; j <= Math.min(i, k); j++)       // recurse
    best = Math.min(best, frog(i - j, h, k, memo) + Math.abs(h[i] - h[i - j]));
  memo[i] = best;
  return memo[i];                                 // memo store
}
// anchor: combine
// anchor: transition
// memoCheck
// memoStore
// anchor: init`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", transition: "// anchor: transition", init: "// anchor: init" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int frogJump(vector<int>& h, int k) {
    int n = h.size();
    vector<int> dp(n, INT_MAX);
    dp[0] = 0;                                              // base
    for (int i = 1; i < n; ++i)
        for (int j = 1; j <= min(i, k); ++j)
            dp[i] = min(dp[i], dp[i - j] + abs(h[i] - h[i - j])); // transition
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
`static int frogJump(int[] h, int k) {
    int n = h.length;
    int[] dp = new int[n];
    Arrays.fill(dp, Integer.MAX_VALUE);
    dp[0] = 0;                                              // base
    for (int i = 1; i < n; ++i)
        for (int j = 1; j <= Math.min(i, k); ++j)
            dp[i] = Math.min(dp[i], dp[i - j] + Math.abs(h[i] - h[i - j])); // transition
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
`def frog_jump(h, k):
    n = len(h)
    dp = [math.inf] * n
    dp[0] = 0                                          # base
    for i in range(1, n):
        for j in range(1, min(i, k) + 1):
            dp[i] = min(dp[i], dp[i - j] + abs(h[i] - h[i - j]))  # transition
    return dp[n - 1]
# anchor: combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", transition: "# transition", combine: "# anchor: combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function frogJump(h, k) {
  const n = h.length;
  const dp = new Array(n).fill(Infinity);
  dp[0] = 0;                                                   // base
  for (let i = 1; i < n; i++)
    for (let j = 1; j <= Math.min(i, k); j++)
      dp[i] = Math.min(dp[i], dp[i - j] + Math.abs(h[i] - h[i - j])); // transition
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
`int frogJump(vector<int>& h, int k) {
    deque<int> win = {0};                        // init: last k dp values
    for (int i = 1; i < (int)h.size(); ++i) {
        int cur = INT_MAX;
        for (int j = 1; j <= min(i, k); ++j)
            cur = min(cur, win[win.size() - j] + abs(h[i] - h[i - j]));
        if ((int)win.size() == k) win.pop_front();   // drop value out of window
        win.push_back(cur);                      // transition
    }
    return win.back();
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int frogJump(int[] h, int k) {
    Deque<Integer> win = new ArrayDeque<>(List.of(0));   // init: last k values
    for (int i = 1; i < h.length; ++i) {
        int cur = Integer.MAX_VALUE;
        for (int j = 1; j <= Math.min(i, k); ++j)
            cur = Math.min(cur, getLast(win, j) + Math.abs(h[i] - h[i - j]));
        if (win.size() == k) win.pollFirst();        // drop out-of-window value
        win.addLast(cur);                            // transition
    }
    return win.peekLast();
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`from collections import deque

def frog_jump(h, k):
    win = deque([0])                             # init: last k values
    for i in range(1, len(h)):
        cur = math.inf
        for j in range(1, min(i, k) + 1):
            cur = min(cur, win[-j] + abs(h[i] - h[i - j]))
        if len(win) == k:
            win.popleft()                        # drop out-of-window value
        win.append(cur)                          # transition
    return win[-1]
# anchor: base
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { init: "# init", transition: "# transition", base: "# anchor: base", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function frogJump(h, k) {
  const win = [0];                                 // init: last k values
  for (let i = 1; i < h.length; i++) {
    let cur = Infinity;
    for (let j = 1; j <= Math.min(i, k); j++)
      cur = Math.min(cur, win[win.length - j] + Math.abs(h[i] - h[i - j]));
    if (win.length === k) win.shift();             // drop out-of-window value
    win.push(cur);                                 // transition
  }
  return win[win.length - 1];
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

export const frogJumpK: ProblemServiceDef = {
  slug: "frog-jump-k",
  patternSlug: "1d-dp",
  inputDescriptor: [
    { key: "heights", label: "STONE HEIGHTS", kind: "array", min: 2, max: 8, valueRange: [1, 50] },
    { key: "k", label: "MAX JUMP K", kind: "number", min: 2, max: 4 },
  ],
  schema,
  defaultInput: { heights: [10, 30, 40, 20, 50, 35], k: 3 },
  randomInput: () => ({
    heights: Array.from({ length: 3 + Math.floor(Math.random() * 5) }, () => 5 + Math.floor(Math.random() * 45)),
    k: 2 + Math.floor(Math.random() * 3),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input) : mode === "memo" ? genMemo(input) : mode === "tabulation" ? genTab(input) : genSpace(input),
  codes,
};
