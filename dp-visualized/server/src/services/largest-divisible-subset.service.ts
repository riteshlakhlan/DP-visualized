import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Largest Divisible Subset (Striver DP-44): largest subset where every pair
 * divides cleanly. Sort first — then it is LIS on the divisibility relation:
 * dp[i] = largest chain ending at sorted index i.
 */

const schema = z.object({
  arr: z.array(z.number().int().min(0).max(200)).min(2).max(8),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode): string | null {
  if (mode === "spaceOptimized")
    return "dp[] spans all earlier indices as dependencies — no rolling window exists. Use Memoization or Tabulation.";
  return null;
}

const sortedArr = (input: In): number[] => [...input.arr].sort((a, b) => a - b);
const AXIS = (n: number) => ({
  rowsTitle: "state",
  colsTitle: "sorted index",
  rowLabels: ["chain ending here"],
  colLabels: Array.from({ length: n }, (_, i) => String(i)),
});

function genBrute(input: In): GeneratedTrace {
  const arr = sortedArr(input);
  const b = new TraceBuilder();
  let calls = 0;

  function f(i: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i], `f(${i}) called: largest chain ending at ${arr[i]}.`, { callId, parentCallId, codeAnchor: "recurse" });
    let best = 0;
    for (let j = 0; j < i; j++)
      if (arr[i] % arr[j] === 0) best = Math.max(best, f(j, callId));
    const v = 1 + best;
    b.push("recurse-return", [i], `Chain length ${v} ending at ${arr[i]}.`, {
      callId, parentCallId, value: v, codeAnchor: "combine",
    });
    return v;
  }

  let answer = 0;
  for (let i = 0; i < arr.length; i++) answer = Math.max(answer, f(i));
  b.push("base-case", [arr.length - 1], `Largest divisible subset size = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: { mode: "bruteforce", answer, answerLabel: "largest subset size", tableShape: null, axisLabels: null, valueFormat: "int", stats: { steps: b.count, calls } },
  };
}

function genMemo(input: In): GeneratedTrace {
  const arr = sortedArr(input);
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
    for (let j = 0; j < i; j++)
      if (arr[i] % arr[j] === 0) best = Math.max(best, f(j, callId));
    const v = 1 + best;
    memo.set(i, v);
    b.push("recurse-return", [i], `f(${i}) = ${v}, stored in memo.`, { callId, parentCallId, value: v, codeAnchor: "memoStore" });
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
      answerLabel: "largest subset size",
      tableShape: { rows: 1, cols: n },
      axisLabels: AXIS(n),
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const arr = sortedArr(input);
  const n = arr.length;
  const b = new TraceBuilder();

  b.push("base-case", [0, 0], `Sorted first (divisibility only needs smaller values): [${arr.join(", ")}].`, { codeAnchor: "sort" });

  const dp: number[] = new Array(n).fill(1);
  for (let i = 0; i < n; i++)
    b.push("base-case", [i], `dp[${i}] = 1 (${arr[i]} alone).`, { value: 1, codeAnchor: "base" });

  let answer = 1;
  for (let i = 1; i < n; i++) {
    let best = 0;
    let bestJ = -1;
    for (let j = 0; j < i; j++)
      if (arr[i] % arr[j] === 0 && dp[j] > best) { best = dp[j]; bestJ = j; }
    dp[i] = 1 + best;
    b.push("table-write", [i],
      bestJ >= 0
        ? `${arr[i]} % ${arr[bestJ]} == 0 → dp[${i}] = 1 + dp[${bestJ}] = ${dp[i]}.`
        : `${arr[i]} divides nothing smaller → stays 1.`,
      { value: dp[i], deps: bestJ >= 0 ? [[bestJ]] : [], codeAnchor: "transition" });
    answer = Math.max(answer, dp[i]);
  }

  b.push("table-read", [n - 1], `Answer = max over the row = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "largest subset size",
      tableShape: { rows: 1, cols: n },
      axisLabels: AXIS(n),
      valueFormat: "int",
      derived: `sorted = [${arr.join(", ")}]`,
      stats: { steps: b.count, writes: 2 * n + 2 },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int i, vector<int>& a) {
    int best = 0;
    for (int j = 0; j < i; ++j)              // recurse
        if (a[i] % a[j] == 0)
            best = max(best, f(j, a));
    return 1 + best;                         // combine
}
// anchor: base
// anchor: driver
// anchor: memoCheck
// anchor: memoStore
// anchor: sort
// anchor: transition
`,
      { recurse: "recurse", combine: "combine",
      base: "// anchor: base",
      driver: "// anchor: driver",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      sort: "// anchor: sort",
      transition: "// anchor: transition"
    },
    ),
    java: withAnchors(
`static int f(int i, int[] a) {
    int best = 0;
    for (int j = 0; j < i; ++j)               // recurse
        if (a[i] % a[j] == 0)
            best = Math.max(best, f(j, a));
    return 1 + best;                          // combine
}
// anchor: base
// anchor: driver
// anchor: memoCheck
// anchor: memoStore
// anchor: sort
// anchor: transition
`,
      { recurse: "recurse", combine: "combine",
      base: "// anchor: base",
      driver: "// anchor: driver",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      sort: "// anchor: sort",
      transition: "// anchor: transition"
    },
    ),
    python: withAnchors(
`def f(i, a):
    best = 0
    for j in range(i):                  # recurse
        if a[i] % a[j] == 0:
            best = max(best, f(j, a))
    return 1 + best                     # combine
# anchor: base
# anchor: driver
# anchor: memoCheck
# anchor: memoStore
# anchor: sort
# anchor: transition
`,
      { recurse: "recurse", combine: "combine",
      base: "# anchor: base",
      driver: "# anchor: driver",
      memoCheck: "# anchor: memoCheck",
      memoStore: "# anchor: memoStore",
      sort: "# anchor: sort",
      transition: "# anchor: transition"
    },
    ),
    js: withAnchors(
`function f(i, a) {
  let best = 0;
  for (let j = 0; j < i; j++)         // recurse
    if (a[i] % a[j] === 0)
      best = Math.max(best, f(j, a));
  return 1 + best;                    // combine
}
// anchor: base
// anchor: driver
// anchor: memoCheck
// anchor: memoStore
// anchor: sort
// anchor: transition
`,
      { recurse: "recurse", combine: "combine",
      base: "// anchor: base",
      driver: "// anchor: driver",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      sort: "// anchor: sort",
      transition: "// anchor: transition"
    },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int i, vector<int>& a, vector<int>& memo) {
    if (memo[i] != -1) return memo[i];       // memo check
    int best = 0;
    for (int j = 0; j < i; ++j)               // recurse
        if (a[i] % a[j] == 0)
            best = max(best, f(j, a, memo));
    return memo[i] = 1 + best;               // memo store
}
// anchor: base
// anchor: combine
// anchor: driver
// anchor: sort
// anchor: transition
`,
      { recurse: "recurse", memoCheck: "memo check", memoStore: "memo store",
      base: "// anchor: base",
      combine: "// anchor: combine",
      driver: "// anchor: driver",
      sort: "// anchor: sort",
      transition: "// anchor: transition"
    },
    ),
    java: withAnchors(
`static int f(int i, int[] a, int[] memo) {
    if (memo[i] != -1) return memo[i];        // memo check
    int best = 0;
    for (int j = 0; j < i; ++j)               // recurse
        if (a[i] % a[j] == 0)
            best = Math.max(best, f(j, a, memo));
    return memo[i] = 1 + best;                // memo store
}
// anchor: base
// anchor: combine
// anchor: driver
// anchor: sort
// anchor: transition
`,
      { recurse: "recurse", memoCheck: "memo check", memoStore: "memo store",
      base: "// anchor: base",
      combine: "// anchor: combine",
      driver: "// anchor: driver",
      sort: "// anchor: sort",
      transition: "// anchor: transition"
    },
    ),
    python: withAnchors(
`def f(i, a, memo):
    if memo[i] != -1:                   # memo check
        return memo[i]
    best = 0
    for j in range(i):                  # recurse
        if a[i] % a[j] == 0:
            best = max(best, f(j, a, memo))
    memo[i] = 1 + best
    return memo[i]                      # memo store
# anchor: base
# anchor: combine
# anchor: driver
# anchor: sort
# anchor: transition
`,
      { recurse: "recurse", memoCheck: "memo check", memoStore: "memo store",
      base: "# anchor: base",
      combine: "# anchor: combine",
      driver: "# anchor: driver",
      sort: "# anchor: sort",
      transition: "# anchor: transition"
    },
    ),
    js: withAnchors(
`function f(i, a, memo) {
  if (memo[i] !== -1) return memo[i];   // memo check
  let best = 0;
  for (let j = 0; j < i; j++)           // recurse
    if (a[i] % a[j] === 0)
      best = Math.max(best, f(j, a, memo));
  memo[i] = 1 + best;
  return memo[i];                       // memo store
}
// anchor: base
// anchor: combine
// anchor: driver
// anchor: sort
// anchor: transition
`,
      { recurse: "recurse", memoCheck: "memo check", memoStore: "memo store",
      base: "// anchor: base",
      combine: "// anchor: combine",
      driver: "// anchor: driver",
      sort: "// anchor: sort",
      transition: "// anchor: transition"
    },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int largestDivisibleSubset(vector<int>& nums) {
    sort(nums.begin(), nums.end());                 // sort
    int n = nums.size(), ans = 1;
    vector<int> dp(n, 1);                            // base
    for (int i = 1; i < n; ++i)
        for (int j = 0; j < i; ++j)
            if (nums[i] % nums[j] == 0)
                dp[i] = max(dp[i], 1 + dp[j]);       // transition
    return *max_element(dp.begin(), dp.end());       // driver
}
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// anchor: sort
`,
      { transition: "transition", base: "base", driver: "driver",
      combine: "// anchor: combine",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse",
      sort: "// anchor: sort"
    },
    ),
    java: withAnchors(
`static int largestDivisibleSubset(int[] nums) {
    Arrays.sort(nums);                               // sort
    int n = nums.length, ans = 1;
    int[] dp = new int[n];
    Arrays.fill(dp, 1);                              // base
    for (int i = 1; i < n; ++i)
        for (int j = 0; j < i; ++j)
            if (nums[i] % nums[j] == 0)
                dp[i] = Math.max(dp[i], 1 + dp[j]);  // transition
    return Arrays.stream(dp).max().getAsInt();       // driver
}
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// anchor: sort
`,
      { transition: "transition", base: "base", driver: "driver",
      combine: "// anchor: combine",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse",
      sort: "// anchor: sort"
    },
    ),
    python: withAnchors(
`def largest_divisible_subset(nums):
    nums.sort()                                   # sort
    n = len(nums)
    dp = [1] * n                                  # base
    for i in range(1, n):
        for j in range(i):
            if nums[i] % nums[j] == 0:
                dp[i] = max(dp[i], 1 + dp[j])     # transition
    return max(dp)                                # driver
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
# anchor: sort
`,
      { transition: "transition", base: "base", driver: "driver",
      combine: "# anchor: combine",
      memoCheck: "# anchor: memoCheck",
      memoStore: "# anchor: memoStore",
      recurse: "# anchor: recurse",
      sort: "# anchor: sort"
    },
    ),
    js: withAnchors(
`function largestDivisibleSubset(nums) {
  nums.sort((x, y) => x - y);                   // sort
  const n = nums.length;
  const dp = new Array(n).fill(1);              // base
  for (let i = 1; i < n; i++)
    for (let j = 0; j < i; j++)
      if (nums[i] % nums[j] === 0)
        dp[i] = Math.max(dp[i], 1 + dp[j]);     // transition
  return Math.max(...dp);                       // driver
}
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// anchor: sort
`,
      { transition: "transition", base: "base", driver: "driver",
      combine: "// anchor: combine",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse",
      sort: "// anchor: sort"
    },
    ),
  },
};

export const largestDivisibleSubset: ProblemServiceDef = {
  slug: "largest-divisible-subset",
  patternSlug: "dp-lis",
  inputDescriptor: [
    { key: "arr", label: "NUMBERS", kind: "array", min: 2, max: 8, valueRange: [1, 9] },
  ],
  schema,
  defaultInput: { arr: [1, 3, 5, 15] }, // → {1,3,15} or {1,5,15} → 3
  randomInput: () => ({
    arr: Array.from({ length: 3 + Math.floor(Math.random() * 4) }, () => 1 + Math.floor(Math.random() * 9)),
  }),
  limitsPerMode: { bruteforce: limits, memo: () => null, tabulation: () => null, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : genTab(input as In),
  codes,
};
