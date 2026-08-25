import { z } from "zod";
import { TraceBuilder, computeStats } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Partition Array for Maximum Sum (Striver DP-54): partition arr into
 * CONTIGUOUS chunks of size ≤ k; chunk value = max(chunk) × chunkLen.
 * dp[i] = best sum for the first i elements:
 *   dp[i] = max over len 1..min(i,k) of dp[i-len] + max(arr[i-len..i)) * len
 * Deps reach back k cells → true rolling window of size k.
 */

const schema = z.object({
  arr: z.array(z.number().int().min(0).max(200)).min(2).max(8),
  k: z.number().int().min(1).max(4),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && Math.pow(2, input.arr.length) > 256)
    return "Brute force tries every boundary placement. Use at most 8 elements.";
  return null;
}

const AXIS = (n: number) => ({
  rowsTitle: "state",
  colsTitle: "prefix length",
  rowLabels: ["dp(i)"],
  colLabels: Array.from({ length: n + 1 }, (_, i) => String(i)),
});

function genBrute(input: In): GeneratedTrace {
  const { arr, k } = input;
  const n = arr.length;
  const b = new TraceBuilder();
  let calls = 0;

  function f(i: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i === 0) {
      b.push("base-case", [0], "Empty prefix → sum 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    b.push("recurse-call", [i], `f(${i}) called: best value for first ${i} elements.`, { callId, parentCallId, codeAnchor: "recurse" });
    let best = 0;
    let mx = arr[i - 1];
    let bestLen = 1;
    for (let len = 1; len <= Math.min(i, k); len++) {
      // element entering the last chunk as it grows
      const x = arr[i - len];
      mx = Math.max(mx, x);
      const cand = f(i - len, callId) + mx * len;
      if (cand > best) { best = cand; bestLen = len; }
    }
    b.push("recurse-return", [i],
      `Best last-chunk size ${bestLen} → f(${i}) = ${best}.`,
      { callId, parentCallId, value: best, deps: [[Math.max(0, i - bestLen)]], codeAnchor: "combine" });
    return best;
  }

  const answer = f(n);
  return {
    steps: b.steps,
    meta: { mode: "bruteforce", answer, answerLabel: "max partition sum", tableShape: null, axisLabels: null, valueFormat: "int", stats: { steps: b.count, calls } },
  };
}

function genMemo(input: In): GeneratedTrace {
  const { arr, k } = input;
  const n = arr.length;
  const b = new TraceBuilder();
  const memo = new Map<number, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i], `f(${i}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (i === 0) {
      b.push("base-case", [0], "Base case: empty prefix → 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    if (memo.has(i)) {
      hits++;
      const v = memo.get(i)!;
      b.push("memo-hit", [i], `Memo hit! f(${i}) = ${v}.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    let best = 0;
    let mx = arr[i - 1];
    for (let len = 1; len <= Math.min(i, k); len++) {
      mx = Math.max(mx, arr[i - len]);
      best = Math.max(best, f(i - len, callId) + mx * len);
    }
    memo.set(i, best);
    b.push("recurse-return", [i], `f(${i}) = ${best}, stored in memo.`, { callId, parentCallId, value: best, deps: [], codeAnchor: "memoStore" });
    return best;
  }

  const answer = f(n);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "max partition sum",
      tableShape: { rows: 1, cols: n + 1 },
      axisLabels: AXIS(n),
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const { arr, k } = input;
  const n = arr.length;
  const b = new TraceBuilder();
  const dp: number[] = new Array(n + 1).fill(-1);
  dp[0] = 0;
  b.push("base-case", [0], "dp[0] = 0 — empty prefix.", { value: 0, codeAnchor: "base" });

  for (let i = 1; i <= n; i++) {
    let best = 0;
    let mx = arr[i - 1];
    let bestLen = 1;
    for (let len = 1; len <= Math.min(i, k); len++) {
      mx = Math.max(mx, arr[i - len]);
      const cand = dp[i - len] + mx * len;
      if (cand > best) { best = cand; bestLen = len; }
    }
    dp[i] = best;
    b.push("table-write", [i],
      `dp[${i}] = ${best} — best last chunk covers ${bestLen} element(s), max × len.`,
      { value: best, deps: [[Math.max(0, i - bestLen)]], codeAnchor: "transition" });
  }

  const answer = dp[n];
  b.push("table-read", [n], `Answer at the end: dp[${n}] = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "max partition sum",
      tableShape: { rows: 1, cols: n + 1 },
      axisLabels: AXIS(n),
      valueFormat: "int",
      stats: { steps: b.count, writes: n + 2 },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const { arr, k } = input;
  const n = arr.length;
  const b = new TraceBuilder();

  // only the previous k values are ever consulted
  const win: number[] = [0];
  b.push("base-case", [0], `Window starts as [0]; keeps at most ${k} entries.`, { value: 0, codeAnchor: "init" });

  for (let i = 1; i <= n; i++) {
    let best = 0;
    let mx = arr[i - 1];
    for (let len = 1; len <= Math.min(i, k); len++) {
      mx = Math.max(mx, arr[i - len]);
      best = Math.max(best, win[win.length - len] + mx * len);
    }
    win.push(best);
    if (win.length > k + 1) win.shift();
    b.push("table-write", [i], `dp[${i}] = ${best}; window slides forward.`, {
      value: best,
      deps: [[Math.max(0, i - 1)]],
      codeAnchor: "transition",
    });
  }

  const answer = win[win.length - 1];
  b.push("table-read", [n], `Answer survives in the window: ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer,
      answerLabel: "max partition sum",
      tableShape: { rows: 1, cols: n + 1 },
      axisLabels: AXIS(n),
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, ...computeStats(b.steps) },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int i, vector<int>& a, int K) {
    if (i == 0) return 0;                          // base
    int best = 0, mx = a[i - 1];
    for (int len = 1; len <= min(i, K); ++len) {    // recurse
        mx = max(mx, a[i - len]);
        best = max(best, f(i - len, a, K) + mx * len);
    }
    return best;                                   // combine
}`,
      { base: "base", recurse: "recurse", combine: "combine" },
    ),
    java: withAnchors(
`static int f(int i, int[] a, int K) {
    if (i == 0) return 0;                           // base
    int best = 0, mx = a[i - 1];
    for (int len = 1; len <= Math.min(i, K); ++len) { // recurse
        mx = Math.max(mx, a[i - len]);
        best = Math.max(best, f(i - len, a, K) + mx * len);
    }
    return best;                                    // combine
}`,
      { base: "base", recurse: "recurse", combine: "combine" },
    ),
    python: withAnchors(
`def f(i, a, K):
    if i == 0:                                # base
        return 0
    best, mx = 0, a[i - 1]
    for length in range(1, min(i, K) + 1):     # recurse
        mx = max(mx, a[i - length])
        best = max(best, f(i - length, a, K) + mx * length)
    return best                               # combine`,
      { base: "base", recurse: "recurse", combine: "combine" },
    ),
    js: withAnchors(
`function f(i, a, K) {
  if (i === 0) return 0;                    // base
  let best = 0, mx = a[i - 1];
  for (let len = 1; len <= Math.min(i, K); len++) {   // recurse
    mx = Math.max(mx, a[i - len]);
    best = Math.max(best, f(i - len, a, K) + mx * len);
  }
  return best;                              // combine
}`,
      { base: "base", recurse: "recurse", combine: "combine" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int i, vector<int>& a, int K, vector<int>& memo) {
    if (i == 0) return 0;                           // base
    if (memo[i] != -1) return memo[i];              // memo check
    int best = 0, mx = a[i - 1];
    for (int len = 1; len <= min(i, K); ++len) {     // recurse
        mx = max(mx, a[i - len]);
        best = max(best, f(i - len, a, K, memo) + mx * len);
    }
    return memo[i] = best;                          // memo store
}`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store" },
    ),
    java: withAnchors(
`static int f(int i, int[] a, int K, int[] memo) {
    if (i == 0) return 0;                            // base
    if (memo[i] != -1) return memo[i];               // memo check
    int best = 0, mx = a[i - 1];
    for (int len = 1; len <= Math.min(i, K); ++len) { // recurse
        mx = Math.max(mx, a[i - len]);
        best = Math.max(best, f(i - len, a, K, memo) + mx * len);
    }
    return memo[i] = best;                           // memo store
}`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store" },
    ),
    python: withAnchors(
`def f(i, a, K, memo):
    if i == 0:                                 # base
        return 0
    if memo[i] != -1:                          # memo check
        return memo[i]
    best, mx = 0, a[i - 1]
    for length in range(1, min(i, K) + 1):      # recurse
        mx = max(mx, a[i - length])
        best = max(best, f(i - length, a, K, memo) + mx * length)
    memo[i] = best
    return best                                # memo store`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store" },
    ),
    js: withAnchors(
`function f(i, a, K, memo) {
  if (i === 0) return 0;                     // base
  if (memo[i] !== -1) return memo[i];        // memo check
  let best = 0, mx = a[i - 1];
  for (let len = 1; len <= Math.min(i, K); len++) {   // recurse
    mx = Math.max(mx, a[i - len]);
    best = Math.max(best, f(i - len, a, K, memo) + mx * len);
  }
  memo[i] = best;
  return best;                              // memo store
}`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int maxSumAfterPartitioning(vector<int>& a, int k) {
    int n = a.size();
    vector<int> dp(n + 1);
    dp[0] = 0;                                            // base
    for (int i = 1; i <= n; ++i) {
        int best = 0, mx = 0;
        for (int len = 1; len <= min(i, k); ++len) {       // transition
            mx = max(mx, a[i - len]);
            best = max(best, dp[i - len] + mx * len);
        }
        dp[i] = best;
    }
    return dp[n];                                         // driver
}`,
      { base: "base", transition: "transition", driver: "driver" },
    ),
    java: withAnchors(
`static int maxSumAfterPartitioning(int[] a, int k) {
    int n = a.length;
    int[] dp = new int[n + 1];
    dp[0] = 0;                                             // base
    for (int i = 1; i <= n; ++i) {
        int best = 0, mx = 0;
        for (int len = 1; len <= Math.min(i, k); ++len) {   // transition
            mx = Math.max(mx, a[i - len]);
            best = Math.max(best, dp[i - len] + mx * len);
        }
        dp[i] = best;
    }
    return dp[n];                                         // driver
}`,
      { base: "base", transition: "transition", driver: "driver" },
    ),
    python: withAnchors(
`def max_sum_after_partitioning(a, k):
    n = len(a)
    dp = [0] * (n + 1)                          # base
    for i in range(1, n + 1):
        best, mx = 0, 0
        for length in range(1, min(i, k) + 1):   # transition
            mx = max(mx, a[i - length])
            best = max(best, dp[i - length] + mx * length)
        dp[i] = best
    return dp[n]                                # driver`,
      { base: "base", transition: "transition", driver: "driver" },
    ),
    js: withAnchors(
`function maxSumAfterPartitioning(a, k) {
  const n = a.length;
  const dp = new Array(n + 1).fill(0);          // base
  for (let i = 1; i <= n; i++) {
    let best = 0, mx = 0;
    for (let len = 1; len <= Math.min(i, k); len++) {   // transition
      mx = Math.max(mx, a[i - len]);
      best = Math.max(best, dp[i - len] + mx * len);
    }
    dp[i] = best;
  }
  return dp[n];                                 // driver
}`,
      { base: "base", transition: "transition", driver: "driver" },
    ),
  },
  spaceOptimized: {
    cpp: withAnchors(
`int maxSumAfterPartitioning(vector<int>& a, int k) {
    vector<int> win = {0};                      // init: sliding window of k+1
    for (int i = 1; i <= (int)a.size(); ++i) {
        int best = 0, mx = 0;
        for (int len = 1; len <= min(i, k); ++len)
            best = max(best, win[win.size() - len] + mxOfTail(a, i, len) * len);
        win.push_back(best);                     // transition
        if ((int)win.size() > k + 1) win.erase(win.begin());
    }
    return win.back();                          // driver
}`,
      { init: "init", transition: "transition", driver: "driver" },
    ),
    java: withAnchors(
`static int maxSumAfterPartitioning(int[] a, int k) {
    List<Integer> win = new ArrayList<>(List.of(0));   // init
    for (int i = 1; i <= a.length; ++i) {
        int best = 0, mx = 0;
        for (int len = 1; len <= Math.min(i, k); ++len)
            best = Math.max(best, win.get(win.size() - len) + tailMax(a, i, len) * len);
        win.add(best);                           // transition
        if (win.size() > k + 1) win.remove(0);
    }
    return win.get(win.size() - 1);              // driver
}`,
      { init: "init", transition: "transition", driver: "driver" },
    ),
    python: withAnchors(
`def max_sum_after_partitioning(a, k):
    win = deque([0])                          # init: sliding window
    for i in range(1, len(a) + 1):
        best, mx = 0, 0
        for length in range(1, min(i, k) + 1):
            mx = max(mx, a[i - length])
            best = max(best, win[-length] + mx * length)
        win.append(best)                       # transition
        if len(win) > k + 1:
            win.popleft()
    return win[-1]                             # driver`,
      { init: "init", transition: "transition", driver: "driver" },
    ),
    js: withAnchors(
`function maxSumAfterPartitioning(a, k) {
  const win = [0];                          // init: sliding window of k+1
  for (let i = 1; i <= a.length; i++) {
    let best = 0, mx = 0;
    for (let len = 1; len <= Math.min(i, k); len++)
      best = Math.max(best, win[win.length - len] +
        Math.max(...a.slice(i - len, i)) * len);
    win.push(best);                         // transition
    if (win.length > k + 1) win.shift();
  }
  return win[win.length - 1];               // driver
}`,
      { init: "init", transition: "transition", driver: "driver" },
    ),
  },
};

export const partitionMaxSum: ProblemServiceDef = {
  slug: "partition-max-sum",
  patternSlug: "dp-mcm",
  inputDescriptor: [
    { key: "arr", label: "NUMBERS", kind: "array", min: 2, max: 8, valueRange: [1, 9] },
    { key: "k", label: "MAX CHUNK K", kind: "number", min: 1, max: 4 },
  ],
  schema,
  defaultInput: { arr: [1, 15, 7, 9, 2, 5, 10], k: 3 }, // LC1043 → 84
  randomInput: () => ({
    arr: Array.from({ length: 3 + Math.floor(Math.random() * 5) }, () => 1 + Math.floor(Math.random() * 9)),
    k: 1 + Math.floor(Math.random() * 4),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : mode === "tabulation" ? genTab(input as In) : genSpace(input as In),
  codes,
};
