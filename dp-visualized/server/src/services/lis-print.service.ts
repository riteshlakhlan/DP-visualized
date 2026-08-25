import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Printing LIS (Striver DP-42): fill the O(n^2) length table while recording
 * a parent[] pointer (best predecessor), then walk back from the argmax to
 * reconstruct one actual increasing subsequence.
 * spaceOptimized intentionally absent — parents are required for printing.
 */

const schema = z.object({
  arr: z.array(z.number().int().min(0).max(200)).min(2).max(8),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode): string | null {
  if (mode === "spaceOptimized")
    return "Printing needs the full parent-pointer table — two rolling rows would forget the path. Use Memoization or Tabulation.";
  return null;
}

const AXIS = (n: number) => ({
  rowsTitle: "state",
  colsTitle: "index",
  rowLabels: ["len(i)"],
  colLabels: Array.from({ length: n }, (_, i) => String(i)),
});

function fillAndWalk(input: In, mode: "memo" | "tabulation"): GeneratedTrace {
  const arr = input.arr;
  const n = arr.length;
  const b = new TraceBuilder();
  const dp: number[] = new Array(n).fill(0);
  const parent: number[] = new Array(n).fill(-1);
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
    dp[i] = 1 + best;
    parent[i] = bestJ;
    memo.set(i, dp[i]);
    b.push("recurse-return", [i], `f(${i}) = ${dp[i]}, parent[${i}] = ${bestJ}.`, {
      callId, parentCallId, value: dp[i], deps: bestJ >= 0 ? [[bestJ]] : [], codeAnchor: "memoStore",
    });
    return dp[i];
  }

  if (mode === "memo") {
    for (let i = 0; i < n; i++) f(i);
  } else {
    for (let i = 0; i < n; i++) {
      dp[i] = 1;
      b.push("base-case", [i], `dp[${i}] = 1.`, { value: 1, codeAnchor: "base" });
    }
    for (let i = 1; i < n; i++) {
      let best = 0;
      let bestJ = -1;
      for (let j = 0; j < i; j++)
        if (arr[j] < arr[i] && dp[j] > best) { best = dp[j]; bestJ = j; }
      dp[i] = 1 + best;
      parent[i] = bestJ;
      b.push("table-write", [i],
        bestJ >= 0
          ? `dp[${i}] = 1 + dp[${bestJ}] = ${dp[i]}; parent[${i}] = ${bestJ}.`
          : `${arr[i]} starts its own chain.`,
        { value: dp[i], deps: bestJ >= 0 ? [[bestJ]] : [], codeAnchor: "transition" });
    }
  }

  /* ---- walk back from argmax ---- */
  let endIdx = 0;
  for (let i = 1; i < n; i++) if (dp[i] > dp[endIdx]) endIdx = i;
  const answer = dp[endIdx];

  const collected: number[] = [];
  let cur = endIdx;
  while (cur !== -1) {
    collected.unshift(arr[cur]);
    const prev = parent[cur];
    b.push("table-read", [cur],
      prev === -1
        ? `parent[${cur}] = −1 → chain start. Rebuilt so far: [${collected.join(", ")}].`
        : `Take a[${cur}]=${arr[cur]}, jump to parent ${prev} (a[${prev}]=${arr[prev]}). Rebuilt so far: [${collected.join(", ")}].`,
      { value: dp[cur], deps: prev === -1 ? [] : [[prev]], codeAnchor: "walk" });
    cur = prev;
  }

  b.push("table-read", [endIdx], `One longest increasing subsequence: [${collected.join(", ")}].`, {
    value: answer, codeAnchor: "driver",
  });

  return {
    steps: b.steps,
    meta: {
      mode,
      answer,
      answerLabel: "LIS length",
      tableShape: { rows: 1, cols: n },
      axisLabels: AXIS(n),
      valueFormat: "int",
      derived: `LIS = [${collected.join(", ")}]`,
      stats:
        mode === "memo"
          ? { steps: b.count, calls, memoHits: hits }
          : { steps: b.count, writes: n + (n * (n - 1)) / 2 + n + 2 },
    },
  };
}

const codes = {
  memoization: {
    cpp: withAnchors(
`int f(int i, vector<int>& a, vector<int>& dp, vector<int>& par) {
    if (dp[i]) return dp[i];                    // memo check
    int best = 0, bi = -1;
    for (int j = 0; j < i; ++j)                  // recurse
        if (a[j] < a[i] && f(j, a, dp, par) > best) {
            best = f(j, a, dp, par); bi = j;
        }
    dp[i] = 1 + best; par[i] = bi;
    return dp[i];                               // memo store
}
// then follow parent[] from the argmax           // walk
// anchor: base
// anchor: driver
// anchor: transition
`,
      { recurse: "recurse", memoCheck: "memo check", memoStore: "memo store", walk: "walk",
      base: "// anchor: base",
      driver: "// anchor: driver",
      transition: "// anchor: transition"
    },
    ),
    java: withAnchors(
`static int f(int i, int[] a, int[] dp, int[] par) {
    if (dp[i] != 0) return dp[i];                // memo check
    int best = 0, bi = -1;
    for (int j = 0; j < i; ++j)                   // recurse
        if (a[j] < a[i] && f(j, a, dp, par) > best) {
            best = f(j, a, dp, par); bi = j;
        }
    dp[i] = 1 + best; par[i] = bi;
    return dp[i];                                // memo store
}
// then follow parent[] from the argmax            // walk
// anchor: base
// anchor: driver
// anchor: transition
`,
      { recurse: "recurse", memoCheck: "memo check", memoStore: "memo store", walk: "walk",
      base: "// anchor: base",
      driver: "// anchor: driver",
      transition: "// anchor: transition"
    },
    ),
    python: withAnchors(
`def f(i, a, dp, par):
    if dp[i]:                                 # memo check
        return dp[i]
    best, bi = 0, -1
    for j in range(i):                        # recurse
        if a[j] < a[i] and f(j, a, dp, par) > best:
            best, bi = f(j, a, dp, par), j
    dp[i], par[i] = 1 + best, bi
    return dp[i]                              # memo store

# then follow parent[] from the argmax           # walk
# anchor: base
# anchor: driver
# anchor: transition
`,
      { recurse: "recurse", memoCheck: "memo check", memoStore: "memo store", walk: "walk",
      base: "# anchor: base",
      driver: "# anchor: driver",
      transition: "# anchor: transition"
    },
    ),
    js: withAnchors(
`function f(i, a, dp, par) {
  if (dp[i]) return dp[i];                  // memo check
  let best = 0, bi = -1;
  for (let j = 0; j < i; j++)               // recurse
    if (a[j] < a[i] && f(j, a, dp, par) > best) {
      best = f(j, a, dp, par); bi = j;
    }
  dp[i] = 1 + best; par[i] = bi;
  return dp[i];                             // memo store
}
// then follow parent[] from the argmax       // walk
// anchor: base
// anchor: driver
// anchor: transition
`,
      { recurse: "recurse", memoCheck: "memo check", memoStore: "memo store", walk: "walk",
      base: "// anchor: base",
      driver: "// anchor: driver",
      transition: "// anchor: transition"
    },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`vector<int> printLIS(vector<int>& a) {
    int n = a.size(), ans = 0, endI = 0;
    vector<int> dp(n, 1), par(n, -1);              // base
    for (int i = 1; i < n; ++i)
        for (int j = 0; j < i; ++j)
            if (a[j] < a[i] && dp[j] + 1 > dp[i]) {
                dp[i] = dp[j] + 1;                 // transition
                par[i] = j;
            }
    for (int i = 0; i < n; ++i)
        if (dp[i] > ans) { ans = dp[i]; endI = i; }
    // walk back                                    // walk
    vector<int> out;
    for (int i = endI; i != -1; i = par[i]) out.push_back(a[i]);
    reverse(out.begin(), out.end());
    return out;                                     // driver
}
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { base: "base", transition: "transition", walk: "walk", driver: "driver",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse"
    },
    ),
    java: withAnchors(
`static List<Integer> printLIS(int[] a) {
    int n = a.length, ans = 0, endI = 0;
    int[] dp = new int[n]; int[] par = new int[n];
    Arrays.fill(dp, 1); Arrays.fill(par, -1);       // base
    for (int i = 1; i < n; ++i)
        for (int j = 0; j < i; ++j)
            if (a[j] < a[i] && dp[j] + 1 > dp[i]) {
                dp[i] = dp[j] + 1;                  // transition
                par[i] = j;
            }
    for (int i = 0; i < n; ++i)
        if (dp[i] > ans) { ans = dp[i]; endI = i; }
    List<Integer> out = new ArrayList<>();          // walk
    for (int i = endI; i != -1; i = par[i]) out.add(a[i]);
    Collections.reverse(out);
    return out;                                     // driver
}
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { base: "base", transition: "transition", walk: "walk", driver: "driver",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse"
    },
    ),
    python: withAnchors(
`def print_lis(a):
    n = len(a)
    dp = [1] * n                     # base
    par = [-1] * n
    for i in range(1, n):
        for j in range(i):
            if a[j] < a[i] and dp[j] + 1 > dp[i]:
                dp[i] = dp[j] + 1    # transition
                par[i] = j
    end = max(range(n), key=lambda i: dp[i])
    # walk back                       # walk
    out = []
    i = end
    while i != -1:
        out.append(a[i]); i = par[i]
    return out[::-1]                  # driver
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
`,
      { base: "base", transition: "transition", walk: "walk", driver: "driver",
      memoCheck: "# anchor: memoCheck",
      memoStore: "# anchor: memoStore",
      recurse: "# anchor: recurse"
    },
    ),
    js: withAnchors(
`function printLIS(a) {
  const n = a.length;
  const dp = new Array(n).fill(1);   // base
  const par = new Array(n).fill(-1);
  for (let i = 1; i < n; i++)
    for (let j = 0; j < i; j++)
      if (a[j] < a[i] && dp[j] + 1 > dp[i]) {
        dp[i] = dp[j] + 1;           // transition
        par[i] = j;
      }
  let end = 0;
  for (let i = 0; i < n; i++) if (dp[i] > dp[end]) end = i;
  const out = [];                    // walk
  for (let i = end; i !== -1; i = par[i]) out.unshift(a[i]);
  return out;                        // driver
}
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
`,
      { base: "base", transition: "transition", walk: "walk", driver: "driver",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse"
    },
    ),
  },
};

export const lisPrint: ProblemServiceDef = {
  slug: "lis-print",
  patternSlug: "dp-lis",
  inputDescriptor: [
    { key: "arr", label: "NUMBERS", kind: "array", min: 2, max: 8, valueRange: [1, 9] },
  ],
  schema,
  defaultInput: { arr: [5, 4, 11, 1, 16, 8] }, // Striver example → [5,11,16]? verified in tests → LIS len 3
  randomInput: () => ({
    arr: Array.from({ length: 3 + Math.floor(Math.random() * 5) }, () => 1 + Math.floor(Math.random() * 9)),
  }),
  limitsPerMode: {
    bruteforce: () => "Reconstruction needs the parent table; enumerating raw subsequences cannot print efficiently. Use Memoization or Tabulation.",
    memo: () => null,
    tabulation: () => null,
    spaceOptimized: () => "Two rolling rows would forget parent pointers. Use Memoization or Tabulation.",
  },
  buildTrace: (input, mode) =>
    mode === "bruteforce" || mode === "spaceOptimized"
      ? (() => {
          const b = new TraceBuilder();
          b.push("base-case", [0, 0], "This variant cannot reconstruct the subsequence — use Memoization or Tabulation.", { codeAnchor: "driver" });
          return { steps: b.steps, meta: { mode: mode as DPMode, answer: null as null, answerLabel: "LIS length", tableShape: null, axisLabels: null, valueFormat: "int" as const, stats: { steps: b.count } } };
        })()
      : fillAndWalk(input as In, mode as "memo" | "tabulation"),
  codes,
};
