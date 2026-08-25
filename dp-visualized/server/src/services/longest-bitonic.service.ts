import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Longest Bitonic Subsequence (Striver DP-46): strictly rises then strictly
 * falls (either side may be empty). bitonic[i] = lisLR[i] + lisRL[i] − 1
 * (index i is counted twice — once per direction).
 * Visualized as a 3-row table: increasing / decreasing / combined.
 */

const schema = z.object({
  arr: z.array(z.number().int().min(0).max(200)).min(2).max(8),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode): string | null {
  if (mode === "bruteforce")
    return "Brute force enumerates all subsequences. Keep inputs small.";
  if (mode === "memo" || mode === "spaceOptimized")
    return "The two-pass formulation fills two full arrays (LIS from left + LIS from right) before combining — no memoized twin or rolling window exists. Use Tabulation.";
  return null;
}

const AXIS = (n: number) => ({
  rowsTitle: "pass",
  colsTitle: "index",
  rowLabels: ["lis ←", "lis →", "bitonic"],
  colLabels: Array.from({ length: n }, (_, i) => String(i)),
});

/** classic O(n^2) LIS-lengths array with strict comparator */
function lisLengths(arr: number[], strictLess: (x: number, y: number) => boolean): number[] {
  const n = arr.length;
  const dp = new Array(n).fill(1);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < i; j++)
      if (strictLess(arr[j], arr[i]) && dp[j] + 1 > dp[i]) dp[i] = dp[j] + 1;
  return dp;
}

function genTab(input: In): GeneratedTrace {
  const arr = input.arr;
  const n = arr.length;
  const b = new TraceBuilder();

  const inc = lisLengths(arr, (x, y) => x < y);
  const dec = lisLengths([...arr].reverse(), (x, y) => x < y).reverse();

  b.push("base-case", [0, 0], `Pass 1 (left→right): standard LIS lengths ending at each index.`, { codeAnchor: "pass1" });
  for (let i = 0; i < n; i++) {
    b.push("table-write", [0, i], `inc[${i}] = ${inc[i]} (rising run ending at a[${i}]=${arr[i]}).`, {
      value: inc[i], deps: i > 0 ? [[0, i - 1]] : [], codeAnchor: "transition",
    });
  }
  b.push("base-case", [1, 0], `Pass 2 (right→left): same DP on the reversed view = falling runs STARTING at each index.`, { codeAnchor: "pass2" });
  for (let i = 0; i < n; i++) {
    b.push("table-write", [1, i], `dec[${i}] = ${dec[i]} (falling run starting at a[${i}]=${arr[i]}).`, {
      value: dec[i], deps: [], codeAnchor: "transition",
    });
  }

  let answer = 0;
  let argmax = 0;
  for (let i = 0; i < n; i++) {
    const v = inc[i] + dec[i] - 1;
    b.push("table-write", [2, i], `bitonic[${i}] = inc ${inc[i]} + dec ${dec[i]} − 1 (peak counted twice) = ${v}.`, {
      value: v, deps: [[0, i], [1, i]], codeAnchor: "combine",
    });
    if (v > answer) { answer = v; argmax = i; }
  }

  b.push("table-read", [2, argmax], `Answer = peak at index ${argmax}: ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "longest bitonic length",
      tableShape: { rows: 3, cols: n },
      axisLabels: AXIS(n),
      valueFormat: "int",
      stats: { steps: b.count, writes: 3 * n + 3 },
    },
  };
}

const codes = {
  tabulation: {
    cpp: withAnchors(
`int longestBitonic(vector<int>& a) {
    int n = a.size();
    vector<int> inc(n, 1), dec(n, 1);
    for (int i = 1; i < n; ++i)
        for (int j = 0; j < i; ++j)
            if (a[j] < a[i]) inc[i] = max(inc[i], inc[j] + 1);   // pass1
    for (int i = n - 2; i >= 0; --i)
        for (int j = n - 1; j > i; --j)
            if (a[j] < a[i]) dec[i] = max(dec[i], dec[j] + 1);   // pass2
    int ans = 0;
    for (int i = 0; i < n; ++i)                                   // combine
        ans = max(ans, inc[i] + dec[i] - 1);
    return ans;   // driver
}`,
      { base: "// base", pass1: "pass1", pass2: "pass2", transition: "pass1", combine: "combine", driver: "driver" },
    ),
    java: withAnchors(
`static int longestBitonic(int[] a) {
    int n = a.length;
    int[] inc = new int[n], dec = new int[n];
    Arrays.fill(inc, 1); Arrays.fill(dec, 1);
    for (int i = 1; i < n; ++i)
        for (int j = 0; j < i; ++j)
            if (a[j] < a[i]) inc[i] = Math.max(inc[i], inc[j] + 1); // pass1
    for (int i = n - 2; i >= 0; --i)
        for (int j = n - 1; j > i; --j)
            if (a[j] < a[i]) dec[i] = Math.max(dec[i], dec[j] + 1); // pass2
    int ans = 0;                                                     // combine
    for (int i = 0; i < n; ++i) ans = Math.max(ans, inc[i] + dec[i] - 1);
    return ans;   // driver
}`,
      { base: "// base", pass1: "pass1", pass2: "pass2", transition: "pass1", combine: "combine", driver: "driver" },
    ),
    python: withAnchors(
`def longest_bitonic(a):
    n = len(a)
    inc = lis_len(a)                       # pass1
    dec = lis_len(a[::-1])[::-1]           # pass2 (reversed view)
    return max(i + d - 1                   # combine
               for i, d in zip(inc, dec))   # driver

def lis_len(arr):
    dp = [1] * len(arr)                    # transition inside helper
    for i in range(len(arr)):
        for j in range(i):
            if arr[j] < arr[i]:
                dp[i] = max(dp[i], dp[j] + 1)
    return dp`,
      { base: "# base", pass1: "pass1", pass2: "pass2", transition: "pass1", combine: "combine", driver: "driver" },
    ),
    js: withAnchors(
`function longestBitonic(a) {
  const n = a.length;
  const inc = new Array(n).fill(1), dec = new Array(n).fill(1);
  for (let i = 1; i < n; i++)
    for (let j = 0; j < i; j++)
      if (a[j] < a[i]) inc[i] = Math.max(inc[i], inc[j] + 1);   // pass1
  for (let i = n - 2; i >= 0; i--)
    for (let j = n - 1; j > i; j--)
      if (a[j] < a[i]) dec[i] = Math.max(dec[i], dec[j] + 1);   // pass2
  let ans = 0;
  for (let i = 0; i < n; i++)                                    // combine
    ans = Math.max(ans, inc[i] + dec[i] - 1);
  return ans;   // driver
}`,
      { base: "// base", pass1: "pass1", pass2: "pass2", transition: "pass1", combine: "combine", driver: "driver" },
    ),
  },
};

export const longestBitonic: ProblemServiceDef = {
  slug: "longest-bitonic",
  patternSlug: "dp-lis",
  inputDescriptor: [
    { key: "arr", label: "NUMBERS", kind: "array", min: 2, max: 8, valueRange: [1, 9] },
  ],
  schema,
  defaultInput: { arr: [1, 11, 2, 10, 4, 5, 2, 1] }, // Striver classic → 6
  randomInput: () => ({
    arr: Array.from({ length: 3 + Math.floor(Math.random() * 5) }, () => 1 + Math.floor(Math.random() * 9)),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: () => null, spaceOptimized: limits },
  buildTrace: (input) => genTab(input as In),
  codes,
};
