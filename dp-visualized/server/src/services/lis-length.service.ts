import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Longest Increasing Subsequence (Striver DP-41): classic O(n^2) DP.
 * dp[i] = length of the LIS ENDING at index i.
 *   dp[i] = 1 + max(dp[j]) over j < i with a[j] < a[i]
 * NOTE: dp[] already IS the minimal storage — deps span the whole prefix, so
 * no rolling-window variant exists. spaceOptimized is intentionally absent.
 */

const schema = z.object({
  arr: z.array(z.number().int().min(0).max(200)).min(2).max(8),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && Math.pow(2, input.arr.length) > 400)
    return "Brute force enumerates all subsequences. Use at most 7 elements for Brute Force.";
  if (mode === "spaceOptimized")
    return "dp[i] already stores only what is needed (every earlier cell can be a dependency), so no further compression exists. Use Memoization or Tabulation.";
  return null;
}

const AXIS = (n: number) => ({
  rowsTitle: "state",
  colsTitle: "index",
  rowLabels: ["LIS ending here"],
  colLabels: Array.from({ length: n }, (_, i) => String(i)),
});

function genBrute(input: In): GeneratedTrace {
  const arr = input.arr;
  const b = new TraceBuilder();
  let calls = 0;

  /** f(i): LIS length ending exactly at index i (no memo). */
  function f(i: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i], `f(${i}) called: best increasing run that ENDS at ${arr[i]}.`, { callId, parentCallId, codeAnchor: "recurse" });
    let best = 0;
    let bestJ = -1;
    for (let j = 0; j < i; j++) {
      if (arr[j] < arr[i]) {
        const sub = f(j, callId);
        if (sub > best) { best = sub; bestJ = j; }
      }
    }
    const v = 1 + best;
    b.push("recurse-return", [i],
      bestJ >= 0
        ? `Best predecessor a[${bestJ}]=${arr[bestJ]} → f(${i}) = 1 + ${best} = ${v}.`
        : `Nothing smaller before it → f(${i}) = 1.`,
      { callId, parentCallId, value: v, deps: bestJ >= 0 ? [[bestJ]] : [], codeAnchor: "combine" });
    return v;
  }

  let answer = 0;
  for (let i = 0; i < arr.length; i++) answer = Math.max(answer, f(i));
  b.push("base-case", [Math.max(0, arr.length - 1)], `Answer = max over all end positions = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: { mode: "bruteforce", answer, answerLabel: "LIS length", tableShape: null, axisLabels: null, valueFormat: "int", stats: { steps: b.count, calls } },
  };
}

function genMemo(input: In): GeneratedTrace {
  const arr = input.arr;
  const n = arr.length;
  const b = new TraceBuilder();
  const memo = new Map<number, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i], `f(${i}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (memo.has(i)) {
      hits++;
      const v = memo.get(i)!;
      b.push("memo-hit", [i], `Memo hit! f(${i}) = ${v}.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    let best = 0;
    let bestJ = -1;
    for (let j = 0; j < i; j++)
      if (arr[j] < arr[i]) {
        const sub = f(j, callId);
        if (sub > best) { best = sub; bestJ = j; }
      }
    const v = 1 + best;
    memo.set(i, v);
    b.push("recurse-return", [i], `f(${i}) = ${v}, stored in memo.`, {
      callId, parentCallId, value: v, deps: bestJ >= 0 ? [[bestJ]] : [], codeAnchor: "memoStore",
    });
    return v;
  }

  let answer = 0;
  for (let i = 0; i < n; i++) answer = Math.max(answer, f(i));
  b.push("base-case", [n - 1], `Answer = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "LIS length",
      tableShape: { rows: 1, cols: n },
      axisLabels: AXIS(n),
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const arr = input.arr;
  const n = arr.length;
  const b = new TraceBuilder();
  const dp: number[] = new Array(n).fill(1);
  for (let i = 0; i < n; i++)
    b.push("base-case", [i], `dp[${i}] starts at 1 (the element alone).`, { value: 1, codeAnchor: "base" });

  let answer = 1;
  for (let i = 1; i < n; i++) {
    let best = 0;
    let bestJ = -1;
    for (let j = 0; j < i; j++)
      if (arr[j] < arr[i] && dp[j] > best) { best = dp[j]; bestJ = j; }
    dp[i] = 1 + best;
    b.push("table-write", [i],
      bestJ >= 0
        ? `Extend from a[${bestJ}]=${arr[bestJ]}: dp[${i}] = 1 + dp[${bestJ}] = ${dp[i]}.`
        : `${arr[i]} has no smaller predecessor → stays 1.`,
      { value: dp[i], deps: bestJ >= 0 ? [[bestJ]] : [], codeAnchor: "transition" });
    answer = Math.max(answer, dp[i]);
  }

  b.push("table-read", [arr.indexOf(answer) >= 0 ? arr.length - 1 : n - 1], `Answer = max of the whole row = ${answer}.`, {
    value: answer, codeAnchor: "driver",
  });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "LIS length",
      tableShape: { rows: 1, cols: n },
      axisLabels: AXIS(n),
      valueFormat: "int",
      stats: { steps: b.count, writes: 2 * n },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int i, vector<int>& a) {
    int best = 0;
    for (int j = 0; j < i; ++j)          // recurse
        if (a[j] < a[i]) best = max(best, f(j, a));
    return 1 + best;                     // combine
}
// driver: answer = max f(i) over all end positions
// anchor: base
// anchor: memoCheck
// anchor: memoStore
// anchor: transition
`,
      { recurse: "recurse", combine: "combine", driver: "driver",
      base: "// anchor: base",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      transition: "// anchor: transition"
    },
    ),
    java: withAnchors(
`static int f(int i, int[] a) {
    int best = 0;
    for (int j = 0; j < i; ++j)           // recurse
        if (a[j] < a[i]) best = Math.max(best, f(j, a));
    return 1 + best;                      // combine
}
// driver: answer = max f(i) over all end positions
// anchor: base
// anchor: memoCheck
// anchor: memoStore
// anchor: transition
`,
      { recurse: "recurse", combine: "combine", driver: "driver",
      base: "// anchor: base",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      transition: "// anchor: transition"
    },
    ),
    python: withAnchors(
`def f(i, a):
    best = 0
    for j in range(i):                  # recurse
        if a[j] < a[i]:
            best = max(best, f(j, a))
    return 1 + best                     # combine

# driver: answer = max f(i) over all end positions
# anchor: base
# anchor: memoCheck
# anchor: memoStore
# anchor: transition
`,
      { recurse: "recurse", combine: "combine", driver: "driver",
      base: "# anchor: base",
      memoCheck: "# anchor: memoCheck",
      memoStore: "# anchor: memoStore",
      transition: "# anchor: transition"
    },
    ),
    js: withAnchors(
`function f(i, a) {
  let best = 0;
  for (let j = 0; j < i; j++)         // recurse
    if (a[j] < a[i]) best = Math.max(best, f(j, a));
  return 1 + best;                    // combine
}
// driver: answer = max f(i) over all end positions
// anchor: base
// anchor: memoCheck
// anchor: memoStore
// anchor: transition
`,
      { recurse: "recurse", combine: "combine", driver: "driver",
      base: "// anchor: base",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      transition: "// anchor: transition"
    },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int i, vector<int>& a, vector<int>& memo) {
    if (memo[i] != -1) return memo[i];             // memo check
    int best = 0;
    for (int j = 0; j < i; ++j)                    // recurse
        if (a[j] < a[i]) best = max(best, f(j, a, memo));
    return memo[i] = 1 + best;                     // memo store
// anchor: driver
}
// anchor: base
// anchor: combine
// anchor: transition
`,
      { recurse: "recurse", memoCheck: "memo check", memoStore: "memo store",
      base: "// anchor: base",
      combine: "// anchor: combine",
      driver: "// anchor: driver",
      transition: "// anchor: transition"
    },
    ),
    java: withAnchors(
`static int f(int i, int[] a, int[] memo) {
    if (memo[i] != -1) return memo[i];              // memo check
    int best = 0;
    for (int j = 0; j < i; ++j)                     // recurse
        if (a[j] < a[i]) best = Math.max(best, f(j, a, memo));
    return memo[i] = 1 + best;                      // memo store
}
// anchor: base
// anchor: combine
// anchor: driver
// anchor: transition
`,
      { recurse: "recurse", memoCheck: "memo check", memoStore: "memo store",
      base: "// anchor: base",
      combine: "// anchor: combine",
      driver: "// anchor: driver",
      transition: "// anchor: transition"
    },
    ),
    python: withAnchors(
`def f(i, a, memo):
    if memo[i] != -1:                        # memo check
        return memo[i]
    best = 0
    for j in range(i):                       # recurse
        if a[j] < a[i]:
            best = max(best, f(j, a, memo))
    memo[i] = 1 + best
    return memo[i]                           # memo store
# anchor: base
# anchor: combine
# anchor: driver
# anchor: transition
`,
      { recurse: "recurse", memoCheck: "memo check", memoStore: "memo store",
      base: "# anchor: base",
      combine: "# anchor: combine",
      driver: "# anchor: driver",
      transition: "# anchor: transition"
    },
    ),
    js: withAnchors(
`function f(i, a, memo) {
  if (memo[i] !== -1) return memo[i];         // memo check
  let best = 0;
  for (let j = 0; j < i; j++)                 // recurse
    if (a[j] < a[i]) best = Math.max(best, f(j, a, memo));
  memo[i] = 1 + best;
  return memo[i];                             // memo store
}
// anchor: base
// anchor: combine
// anchor: driver
// anchor: transition
`,
      { recurse: "recurse", memoCheck: "memo check", memoStore: "memo store",
      base: "// anchor: base",
      combine: "// anchor: combine",
      driver: "// anchor: driver",
      transition: "// anchor: transition"
    },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int longestIncreasingSubsequence(vector<int>& a) {
    int n = a.size(), ans = 1;
    vector<int> dp(n, 1);                            // base
    for (int i = 1; i < n; ++i)
        for (int j = 0; j < i; ++j)
            if (a[j] < a[i])
                dp[i] = max(dp[i], 1 + dp[j]);       // transition
    return *max_element(dp.begin(), dp.end());       // driver
}
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { base: "base", transition: "transition", driver: "driver",
      combine: "// anchor: combine",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse"
    },
    ),
    java: withAnchors(
`static int longestIncreasingSubsequence(int[] a) {
    int n = a.length, ans = 1;
    int[] dp = new int[n];
    Arrays.fill(dp, 1);                               // base
    for (int i = 1; i < n; ++i)
        for (int j = 0; j < i; ++j)
            if (a[j] < a[i])
                dp[i] = Math.max(dp[i], 1 + dp[j]);   // transition
    return Arrays.stream(dp).max().getAsInt();        // driver
}
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { base: "base", transition: "transition", driver: "driver",
      combine: "// anchor: combine",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse"
    },
    ),
    python: withAnchors(
`def lis(a):
    n = len(a)
    dp = [1] * n                                  # base
    for i in range(1, n):
        for j in range(i):
            if a[j] < a[i]:
                dp[i] = max(dp[i], 1 + dp[j])     # transition
    return max(dp)                                # driver
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
`,
      { base: "base", transition: "transition", driver: "driver",
      combine: "# anchor: combine",
      memoCheck: "# anchor: memoCheck",
      memoStore: "# anchor: memoStore",
      recurse: "# anchor: recurse"
    },
    ),
    js: withAnchors(
`function lis(a) {
  const n = a.length;
  const dp = new Array(n).fill(1);               // base
  for (let i = 1; i < n; i++)
    for (let j = 0; j < i; j++)
      if (a[j] < a[i])
        dp[i] = Math.max(dp[i], 1 + dp[j]);      // transition
  return Math.max(...dp);                        // driver
}
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { base: "base", transition: "transition", driver: "driver",
      combine: "// anchor: combine",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse"
    },
    ),
  },
};

export const lisLength: ProblemServiceDef = {
  slug: "lis-length",
  patternSlug: "dp-lis",
  inputDescriptor: [
    { key: "arr", label: "NUMBERS", kind: "array", min: 2, max: 8, valueRange: [1, 9] },
  ],
  schema,
  defaultInput: { arr: [10, 9, 2, 5, 3, 7, 101, 18] }, // LC300 → 4
  randomInput: () => ({
    arr: Array.from({ length: 3 + Math.floor(Math.random() * 5) }, () => 1 + Math.floor(Math.random() * 9)),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : mode === "tabulation" ? genTab(input as In) : genTab(input as In),
  codes,
};


