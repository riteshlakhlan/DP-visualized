import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* LIS via Binary Search / Patience Sorting (Striver DP-43): O(n log n).
 * tails[k] = smallest possible tail of an increasing subsequence of length k+1.
 * For each x: pos = lower_bound(tails, x); replace tails[pos] or append.
 * The array length never shrinks — its final size IS the LIS length.
 * Only ONE algorithm exists for this variant; other modes are declined with
 * an explanation.
 */

const schema = z.object({
  arr: z.array(z.number().int().min(0).max(200)).min(2).max(10),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode): string | null {
  if (mode !== "tabulation")
    return "Patience sorting is a single constructive algorithm — it has no brute-force or memoized twin worth visualizing separately. Use Tabulation.";
  return null;
}

function genTab(input: In): GeneratedTrace {
  const arr = input.arr;
  const n = arr.length;
  const b = new TraceBuilder();
  const tails: number[] = [];

  const lowerBound = (x: number): number => {
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  for (let i = 0; i < n; i++) {
    const x = arr[i];
    const pos = lowerBound(x);
    if (pos === tails.length) {
      tails.push(x);
      b.push("table-write", [0, pos],
        `a[${i}]=${x} extends the longest pile → APPEND at slot ${pos}. tails = [${tails.join(", ")}].`,
        { value: x, deps: [], codeAnchor: "append" });
    } else {
      const old = tails[pos];
      tails[pos] = x;
      b.push("table-write", [0, pos],
        `a[${i}]=${x} REPLACES tails[${pos}] (${old}) — same length, smaller tail keeps options open. tails = [${tails.join(", ")}].`,
        { value: x, deps: pos > 0 ? [[0, pos - 1]] : [], codeAnchor: "replace" });
    }
  }

  const answer = tails.length;
  b.push("table-read", [0, answer - 1], `No more elements. Number of piles = LIS length = ${answer}.`, {
    value: answer, codeAnchor: "driver",
  });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "LIS length (piles)",
      tableShape: { rows: 1, cols: n },
      axisLabels: { rowsTitle: "patience piles", colsTitle: "slot", rowLabels: ["tails"] },
      valueFormat: "int",
      stats: { steps: b.count, writes: n + 1 },
    },
  };
}

const codes = {
  tabulation: {
    cpp: withAnchors(
`int longestIncreasingSubsequence(vector<int>& a) {
    vector<int> tails;
    for (int x : a) {
        auto it = lower_bound(tails.begin(), tails.end(), x);
        if (it == tails.end())
            tails.push_back(x);              // append
        else
            *it = x;                          // replace
    }
    return tails.size();                      // driver
}`,
      { append: "append", replace: "replace", driver: "driver" },
    ),
    java: withAnchors(
`static int lis(int[] a) {
    List<Integer> tails = new ArrayList<>();
    for (int x : a) {
        int pos = Collections.binarySearch(tails, x);
        if (pos < 0) pos = -(pos + 1);
        if (pos == tails.size())
            tails.add(x);                     // append
        else
            tails.set(pos, x);                // replace
    }
    return tails.size();                      // driver
}`,
      { append: "append", replace: "replace", driver: "driver" },
    ),
    python: withAnchors(
`from bisect import bisect_left

def lis(a):
    tails = []
    for x in a:
        pos = bisect_left(tails, x)
        if pos == len(tails):
            tails.append(x)             # append
        else:
            tails[pos] = x              # replace
    return len(tails)                   # driver`,
      { append: "append", replace: "replace", driver: "driver" },
    ),
    js: withAnchors(
`function lis(a) {
  const tails = [];
  for (const x of a) {
    let lo = 0, hi = tails.length;
    while (lo < hi) {                    // binary search
      const mid = (lo + hi) >> 1;
      if (tails[mid] < x) lo = mid + 1; else hi = mid;
    }
    if (lo === tails.length)
      tails.push(x);                     // append
    else
      tails[lo] = x;                     // replace
  }
  return tails.length;                   // driver
}`,
      { append: "append", replace: "replace", driver: "driver" },
    ),
  },
};

export const lisBinarySearch: ProblemServiceDef = {
  slug: "lis-binary-search",
  patternSlug: "dp-lis",
  inputDescriptor: [
    { key: "arr", label: "NUMBERS", kind: "array", min: 2, max: 10, valueRange: [1, 9] },
  ],
  schema,
  defaultInput: { arr: [10, 9, 2, 5, 3, 7, 101, 18] }, // LC300 → 4
  randomInput: () => ({
    arr: Array.from({ length: 3 + Math.floor(Math.random() * 6) }, () => 1 + Math.floor(Math.random() * 9)),
  }),
  limitsPerMode: {
    bruteforce: limits,
    memo: limits,
    tabulation: () => null,
    spaceOptimized: limits,
  },
  buildTrace: (input) => genTab(input as In),
  codes,
};
