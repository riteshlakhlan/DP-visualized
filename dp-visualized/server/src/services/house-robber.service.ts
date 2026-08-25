import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Maximum sum of non-adjacent elements / House Robber (Striver DP-5). */

const schema = z.object({
  nums: z.array(z.number().int().min(0).max(99)).min(1).max(12),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && input.nums.length > 9)
    return "Pure recursion explores every pick/skip combination (~2^n). Use at most 9 houses for Brute Force.";
  return null;
}

function genBrute(input: In): GeneratedTrace {
  const a = input.nums;
  const n = a.length;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<number>();

  function f(i: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i < 0) {
      b.push("recurse-call", [0], "rob(-1): nothing left before house 0 — value 0.", { callId, parentCallId, codeAnchor: "base" });
      b.push("base-case", [0], "Base case: no houses left, best is 0.", { callId, parentCallId, value: 0 });
      return 0;
    }
    const dup = seen.has(i);
    b.push("recurse-call", [i],
      dup ? `rob(${i}) called AGAIN — subproblem repeats; watch this subtree duplicate.`
          : `rob(${i}) called: best loot using houses 0..${i}. Either rob house ${i} or skip it.`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(i);
    const pick = a[i] + f(i - 2, callId);
    const skip = f(i - 1, callId);
    const v = Math.max(pick, skip);
    b.push("recurse-return", [i], `rob(${i}) = max(pick: ${a[i]} + rob(${i - 2}) = ${pick}, skip: rob(${i - 1}) = ${skip}) = ${v}.`, {
      callId,
      parentCallId,
      value: v,
      deps: [[Math.max(0, i - 2)], [Math.max(0, i - 1)]],
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
      answerLabel: "max non-adjacent sum",
      tableShape: null,
      axisLabels: null,
      valueFormat: "int",
      stats: { steps: b.count, calls },
    },
  };
}

function genMemo(input: In): GeneratedTrace {
  const a = input.nums;
  const n = a.length;
  const b = new TraceBuilder();
  const memo = new Map<number, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i], `rob(${i}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (i < 0) {
      b.push("base-case", [i >= 0 ? i : 0], "Base case: no houses left → 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    if (memo.has(i)) {
      hits++;
      const v = memo.get(i)!;
      b.push("memo-hit", [i], `Memo hit! rob(${i}) = ${v} fetched in O(1).`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    const pick = a[i] + f(i - 2, callId);
    const skip = f(i - 1, callId);
    const v = Math.max(pick, skip);
    memo.set(i, v);
    b.push("recurse-return", [i], `rob(${i}) = max(${pick}, ${skip}) = ${v}, stored in memo.`, {
      callId,
      parentCallId,
      value: v,
      deps: [[Math.max(0, i - 2)], [Math.max(0, i - 1)]],
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
      answerLabel: "max non-adjacent sum",
      tableShape: { rows: 1, cols: n },
      axisLabels: { rowsTitle: "state", colsTitle: "house index", rowLabels: ["rob(i)"] },
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const a = input.nums;
  const n = a.length;
  const b = new TraceBuilder();
  const dp: number[] = new Array(Math.max(n, 1)).fill(-1);
  dp[0] = a[0];
  b.push("base-case", [0], `dp[0] = nums[0] = ${a[0]} — only one house to consider.`, { value: a[0], codeAnchor: "base" });
  if (n > 1) {
    dp[1] = Math.max(a[0], a[1]);
    b.push("base-case", [1], `dp[1] = max(nums[0], nums[1]) = ${dp[1]}.`, { value: dp[1], deps: [[0]], codeAnchor: "base" });
  }
  for (let i = 2; i < n; i++) {
    const pick = a[i] + dp[i - 2];
    const skip = dp[i - 1];
    const v = Math.max(pick, skip);
    b.push("table-write", [i], `dp[${i}] = max(pick: ${a[i]} + dp[${i - 2}] = ${pick}, skip: dp[${i - 1}] = ${skip}) = ${v}.`, {
      value: v,
      deps: [[i - 2], [i - 1]],
      codeAnchor: "transition",
    });
    dp[i] = v;
  }
  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer: dp[n - 1],
      answerLabel: "max non-adjacent sum",
      tableShape: { rows: 1, cols: n },
      axisLabels: { rowsTitle: "state", colsTitle: "house index", rowLabels: ["dp[i]"] },
      valueFormat: "int",
      stats: { steps: b.count, writes: n },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const a = input.nums;
  const n = a.length;
  const b = new TraceBuilder();
  let prev2 = 0; // rob(-1)
  let prev = a[0];
  b.push("base-case", [0], `prev2 represents "no houses" = 0; prev = dp[0] = ${a[0]}.`, { value: a[0], codeAnchor: "init" });
  for (let i = 1; i < n; i++) {
    const pick = a[i] + prev2;
    const v = Math.max(pick, prev);
    b.push("table-write", [i], `cur = max(pick: ${a[i]} + ${prev2} = ${pick}, skip: ${prev}) = ${v}.`, {
      value: v,
      deps: [[Math.max(0, i - 2)], [Math.max(0, i - 1)]],
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
      answerLabel: "max non-adjacent sum",
      tableShape: { rows: 1, cols: n },
      axisLabels: { rowsTitle: "state", colsTitle: "house index", rowLabels: ["dp[i]"] },
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: n },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int rob(int i, vector<int>& a) {
    if (i < 0) return 0;                        // base
    // pick vs skip
    int pick = a[i] + rob(i - 2, a);            // recurse
    int skip = rob(i - 1, a);
    return max(pick, skip);                     // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int rob(int i, int[] a) {
    if (i < 0) return 0;                        // base
    int pick = a[i] + rob(i - 2, a);            // recurse
    int skip = rob(i - 1, a);
    return Math.max(pick, skip);                // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def rob(i, a):
    if i < 0:                      # base
        return 0
    pick = a[i] + rob(i - 2, a)    # recurse (pick)
    skip = rob(i - 1, a)           # skip
    return max(pick, skip)         # combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: transition`,
      { base: "# base", recurse: "# recurse", combine: "# combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function rob(i, a) {
  if (i < 0) return 0;                 // base
  const pick = a[i] + rob(i - 2, a);   // recurse
  const skip = rob(i - 1, a);
  return Math.max(pick, skip);         // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int rob(int i, vector<int>& a, vector<int>& memo) {
    if (i < 0) return 0;                       // base
    if (memo[i] != -1) return memo[i];         // memo check
    int pick = a[i] + rob(i - 2, a, memo);
    int skip = rob(i - 1, a, memo);
    return memo[i] = max(pick, skip);          // memo store
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
`static int rob(int i, int[] a, int[] memo) {
    if (i < 0) return 0;                       // base
    if (memo[i] != -1) return memo[i];         // memo check
    int pick = a[i] + rob(i - 2, a, memo);
    int skip = rob(i - 1, a, memo);
    return memo[i] = Math.max(pick, skip);     // memo store
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
`def rob(i, a, memo):
    if i < 0:                         # base
        return 0
    if memo[i] != -1:                 # memo check
        return memo[i]
    memo[i] = max(a[i] + rob(i - 2, a, memo), rob(i - 1, a, memo))
    return memo[i]                    # memo store
# anchor: combine
# anchor: init
# anchor: recurse
# anchor: transition
# memoCheck
# memoStore`,
      { base: "# base", memoCheck: "# memoCheck", memoStore: "# memoStore", combine: "# anchor: combine", init: "# anchor: init", recurse: "# anchor: recurse", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function rob(i, a, memo) {
  if (i < 0) return 0;                          // base
  if (memo[i] !== -1) return memo[i];           // memo check
  memo[i] = Math.max(a[i] + rob(i - 2, a, memo), rob(i - 1, a, memo));
  return memo[i];                               // memo store
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
`int rob(vector<int>& a) {
    int n = a.size();
    vector<int> dp(n);
    dp[0] = a[0];                                    // base
    if (n > 1) dp[1] = max(a[0], a[1]);              // base
    for (int i = 2; i < n; ++i)
        dp[i] = max(a[i] + dp[i - 2], dp[i - 1]);    // transition
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
`static int rob(int[] a) {
    int n = a.length;
    int[] dp = new int[n];
    dp[0] = a[0];                                    // base
    if (n > 1) dp[1] = Math.max(a[0], a[1]);         // base
    for (int i = 2; i < n; ++i)
        dp[i] = Math.max(a[i] + dp[i - 2], dp[i - 1]); // transition
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
`def rob(a):
    n = len(a)
    dp = [0] * n
    dp[0] = a[0]                                   # base
    if n > 1:
        dp[1] = max(a[0], a[1])                    # base
    for i in range(2, n):
        dp[i] = max(a[i] + dp[i - 2], dp[i - 1])   # transition
    return dp[n - 1]
# anchor: combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", transition: "# transition", combine: "# anchor: combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function rob(a) {
  const n = a.length;
  const dp = new Array(n).fill(0);
  dp[0] = a[0];                                          // base
  if (n > 1) dp[1] = Math.max(a[0], a[1]);               // base
  for (let i = 2; i < n; i++)
    dp[i] = Math.max(a[i] + dp[i - 2], dp[i - 1]);       // transition
  return dp[n - 1];
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
`int rob(vector<int>& a) {
    int prev2 = 0;                       // init: rob(-1)
    int prev = a[0];                     // init: dp[0]
    for (int i = 1; i < (int)a.size(); ++i) {
        int cur = max(a[i] + prev2, prev);   // transition
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
`static int rob(int[] a) {
    int prev2 = 0;                       // init
    int prev = a[0];                     // init
    for (int i = 1; i < a.length; ++i) {
        int cur = Math.max(a[i] + prev2, prev);   // transition
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
`def rob(a):
    prev2 = 0                  # init
    prev = a[0]                # init
    for i in range(1, len(a)):
        prev2, prev = prev, max(a[i] + prev2, prev)   # transition
    return prev
# anchor: base
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { init: "# init", transition: "# transition", base: "# anchor: base", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function rob(a) {
  let prev2 = 0;                            // init
  let prev = a[0];                          // init
  for (let i = 1; i < a.length; i++) {
    const cur = Math.max(a[i] + prev2, prev);   // transition
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

export const houseRobber: ProblemServiceDef = {
  slug: "house-robber",
  patternSlug: "1d-dp",
  inputDescriptor: [
    { key: "nums", label: "HOUSE LOOT", kind: "array", min: 1, max: 10, valueRange: [0, 99] },
  ],
  schema,
  defaultInput: { nums: [2, 7, 9, 3, 1] },
  randomInput: () => ({
    nums: Array.from({ length: 4 + Math.floor(Math.random() * 5) }, () => Math.floor(Math.random() * 60)),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input) : mode === "memo" ? genMemo(input) : mode === "tabulation" ? genTab(input) : genSpace(input),
  codes,
};
