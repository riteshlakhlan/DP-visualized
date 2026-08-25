import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Number of Longest Increasing Subsequences (Striver DP-47): count how many
 * distinct LIS exist. Pair DP:
 *   len[i], cnt[i] — over predecessors j < i with a[j] < a[i]:
 *     len[j]+1 >  len[i] → len[i]=len[j]+1, cnt[i]=cnt[j]
 *     len[j]+1 == len[i] → cnt[i] += cnt[j]
 * Answer = Σ cnt[i] where len[i] == max. Two-row table: lengths + counts.
 */

const schema = z.object({
  arr: z.array(z.number().int().min(0).max(200)).min(2).max(8),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode): string | null {
  if (mode === "bruteforce")
    return "Brute force enumerates every subsequence and counts the longest ones — exponential. Keep inputs small.";
  if (mode === "memo" || mode === "spaceOptimized")
    return "The pair formulation needs full len[] and cnt[] arrays simultaneously — no memoized twin or rolling window exists. Use Tabulation.";
  return null;
}

const AXIS = (n: number) => ({
  rowsTitle: "state",
  colsTitle: "index",
  rowLabels: ["len(i)", "count(i)"],
  colLabels: Array.from({ length: n }, (_, i) => String(i)),
});

function genTab(input: In): GeneratedTrace {
  const arr = input.arr;
  const n = arr.length;
  const b = new TraceBuilder();
  const len = new Array(n).fill(1);
  const cnt = new Array(n).fill(1);

  for (let i = 0; i < n; i++)
    b.push("base-case", [0, i], `len[${i}] = cnt[${i}] = 1 (${arr[i]} alone).`, { value: 1, codeAnchor: "base" });

  for (let i = 1; i < n; i++)
    for (let j = 0; j < i; j++)
      if (arr[j] < arr[i]) {
        if (len[j] + 1 > len[i]) {
          const oldLen = len[i];
          len[i] = len[j] + 1;
          cnt[i] = cnt[j];
          b.push("table-write", [0, i], `Found LONGER chain via a[${j}]: len[${i}] ${oldLen} → ${len[i]}, count resets to cnt[${j}] = ${cnt[i]}.`, {
            value: len[i], deps: [[0, j]], codeAnchor: "transition",
          });
          b.push("table-write", [1, i], `count[${i}] = ${cnt[i]} (inherited from index ${j}).`, {
            value: cnt[i], deps: [[1, j]], codeAnchor: "transition",
          });
        } else if (len[j] + 1 === len[i]) {
          const oldCnt = cnt[i];
          cnt[i] += cnt[j];
          b.push("table-write", [1, i], `Another route of the SAME best length via a[${j}]: count[${i}] ${oldCnt} + ${cnt[j] - oldCnt} = ${cnt[i]}.`, {
            value: cnt[i], deps: [[1, j]], codeAnchor: "combine",
          });
        }
      }

  const maxLen = Math.max(...len);
  let answer = 0;
  for (let i = 0; i < n; i++) if (len[i] === maxLen) answer += cnt[i];

  b.push("table-read", [1, n - 1], `maxLen = ${maxLen}; total LIS count = sum of counts at that length = ${answer}.`, {
    value: answer, codeAnchor: "driver",
  });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "number of LIS",
      tableShape: { rows: 2, cols: n },
      axisLabels: AXIS(n),
      valueFormat: "int",
      stats: { steps: b.count, writes: 2 * n },
    },
  };
}

const codes = {
  tabulation: {
    cpp: withAnchors(
`int findNumberOfLIS(vector<int>& a) {
    int n = a.size();
    vector<int> len(n, 1), cnt(n, 1);                // base
    for (int i = 1; i < n; ++i)
        for (int j = 0; j < i; ++j)
            if (a[j] < a[i]) {
                if (len[j] + 1 > len[i]) {           // transition
                    len[i] = len[j] + 1;
                    cnt[i] = cnt[j];
                } else if (len[j] + 1 == len[i])     // combine
                    cnt[i] += cnt[j];
            }
    int mx = *max_element(len.begin(), len.end());
    int ans = 0;
    for (int i = 0; i < n; ++i)
        if (len[i] == mx) ans += cnt[i];             // driver
    return ans;
}`,
      { base: "base", transition: "transition", combine: "combine", driver: "driver" },
    ),
    java: withAnchors(
`static int findNumberOfLIS(int[] a) {
    int n = a.length;
    int[] len = new int[n], cnt = new int[n];
    Arrays.fill(len, 1); Arrays.fill(cnt, 1);         // base
    for (int i = 1; i < n; ++i)
        for (int j = 0; j < i; ++j)
            if (a[j] < a[i]) {
                if (len[j] + 1 > len[i]) {             // transition
                    len[i] = len[j] + 1;
                    cnt[i] = cnt[j];
                } else if (len[j] + 1 == len[i])       // combine
                    cnt[i] += cnt[j];
            }
    int mx = Arrays.stream(len).max().getAsInt(), ans = 0;
    for (int i = 0; i < n; ++i)
        if (len[i] == mx) ans += cnt[i];               // driver
    return ans;
}`,
      { base: "base", transition: "transition", combine: "combine", driver: "driver" },
    ),
    python: withAnchors(
`def find_number_of_lis(a):
    n = len(a)
    length = [1] * n                       # base
    count = [1] * n
    for i in range(1, n):
        for j in range(i):
            if a[j] < a[i]:
                if length[j] + 1 > length[i]:        # transition
                    length[i] = length[j] + 1
                    count[i] = count[j]
                elif length[j] + 1 == length[i]:     # combine
                    count[i] += count[j]
    mx = max(length)
    return sum(c for l, c in zip(length, count) if l == mx)   # driver`,
      { base: "base", transition: "transition", combine: "combine", driver: "driver" },
    ),
    js: withAnchors(
`function findNumberOfLIS(a) {
  const n = a.length;
  const len = new Array(n).fill(1), cnt = new Array(n).fill(1); // base
  for (let i = 1; i < n; i++)
    for (let j = 0; j < i; j++)
      if (a[j] < a[i]) {
        if (len[j] + 1 > len[i]) {              // transition
          len[i] = len[j] + 1;
          cnt[i] = cnt[j];
        } else if (len[j] + 1 === len[i]) {     // combine
          cnt[i] += cnt[j];
        }
      }
  const mx = Math.max(...len);
  let ans = 0;
  for (let i = 0; i < n; i++)
    if (len[i] === mx) ans += cnt[i];           // driver
  return ans;
}`,
      { base: "base", transition: "transition", combine: "combine", driver: "driver" },
    ),
  },
};

export const numberOfLIS: ProblemServiceDef = {
  slug: "number-of-lis",
  patternSlug: "dp-lis",
  inputDescriptor: [
    { key: "arr", label: "NUMBERS", kind: "array", min: 2, max: 8, valueRange: [1, 9] },
  ],
  schema,
  defaultInput: { arr: [1, 3, 5, 4, 7] }, // LC673 → 2 ([1,3,5,7] and [1,3,4,7])
  randomInput: () => ({
    arr: Array.from({ length: 3 + Math.floor(Math.random() * 5) }, () => 1 + Math.floor(Math.random() * 5)),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: () => null, spaceOptimized: limits },
  buildTrace: (input) => genTab(input as In),
  codes,
};
