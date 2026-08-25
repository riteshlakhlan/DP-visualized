import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Partition Set Into 2 Subsets With Min Absolute Difference (Striver DP-16):
 * split arr into S1/S2 minimising |sum(S1) − sum(S2)|.
 * Tabulate all achievable subset sums S up to total/2; the best split has
 * S1 = the largest reachable S ≤ total/2 → diff = total − 2S.
 */

const schema = z.object({
  arr: z.array(z.number().int().min(1).max(9)).min(1).max(8),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && Math.pow(2, input.arr.length) > 256)
    return "Brute force walks all 2^n subsets. Use at most 8 numbers.";
  return null;
}

const AXIS = (arr: number[], k: number) => ({
  rowsTitle: "items considered",
  colsTitle: "S1 sum",
  rowLabels: ["∅", ...arr.map((v, i) => `${v}[${i}]`)],
  colLabels: Array.from({ length: k + 1 }, (_, t) => String(t)),
});

function genBrute(input: In): GeneratedTrace {
  const arr = input.arr;
  const total = arr.reduce((a, b) => a + b, 0);
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<string>();

  b.push("base-case", [0, Math.floor(total / 2)], `Total sum is ${total}. We look for the reachable S closest to ${total}/2 — diff = ${total} − 2·S.`, { codeAnchor: "driver" });

  /** can(i, t): can some subset of first i items sum to exactly t? */
  function can(i: number, t: number, parentCallId?: number): boolean {
    const callId = b.allocCallId();
    calls++;
    if (t === 0) {
      b.push("base-case", [0, 0], "Sum 0 always reachable via the empty subset.", { callId, parentCallId, value: true, codeAnchor: "base" });
      return true;
    }
    if (i === 0) {
      b.push("base-case", [0, t], `No items left for sum ${t}.`, { callId, parentCallId, value: false, codeAnchor: "base" });
      return false;
    }
    const dup = seen.has(`${i},${t}`);
    b.push("recurse-call", [i, t], dup ? `can(${i},${t}) called AGAIN.` : `can(${i},${t}) called.`, { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(`${i},${t}`);
    if (can(i - 1, t, callId)) {
      b.push("recurse-return", [i, t], `Reachable without item ${i - 1} → true.`, { callId, parentCallId, value: true, deps: [[i - 1, t]], codeAnchor: "combine" });
      return true;
    }
    if (arr[i - 1] <= t && can(i - 1, t - arr[i - 1], callId)) {
      b.push("recurse-return", [i, t], `Reachable using item ${arr[i - 1]} → true.`, { callId, parentCallId, value: true, deps: [[i - 1, t]], codeAnchor: "combine" });
      return true;
    }
    b.push("recurse-return", [i, t], `Not reachable.`, { callId, parentCallId, value: false, deps: [[i - 1, t]], codeAnchor: "combine" });
    return false;
  }

  let bestS = 0;
  for (let s = Math.floor(total / 2); s >= 1; s--) {
    if (can(arr.length, s)) {
      bestS = s;
      break;
    }
  }
  const answer = total - 2 * bestS;
  b.push("table-read", [arr.length, bestS],
    `Best S1 sum ≤ half is ${bestS}: |${total} − 2×${bestS}| = ${answer}.`,
    { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: { mode: "bruteforce", answer, answerLabel: "min |S1 − S2| difference", tableShape: null, axisLabels: null, valueFormat: "int", stats: { steps: b.count, calls } },
  };
}

function genMemo(input: In): GeneratedTrace {
  const arr = input.arr;
  const n = arr.length;
  const total = arr.reduce((a, b) => a + b, 0);
  const k = Math.floor(total / 2);
  const b = new TraceBuilder();
  const memo = new Map<string, boolean>();
  let calls = 0;
  let hits = 0;

  function can(i: number, t: number, parentCallId?: number): boolean {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i, t], `can(${i},${t}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (t === 0) {
      b.push("base-case", [0, 0], "Sum 0 reachable.", { callId, parentCallId, value: true, codeAnchor: "base" });
      return true;
    }
    if (i === 0) {
      b.push("base-case", [0, t], `Unreachable.`, { callId, parentCallId, value: false, codeAnchor: "base" });
      return false;
    }
    const kk = `${i},${t}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [i, t], `Memo hit! = ${v}.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    const skip = can(i - 1, t, callId);
    const pick = arr[i - 1] <= t ? can(i - 1, t - arr[i - 1], callId) : false;
    const v = skip || pick;
    memo.set(kk, v);
    const deps: number[][] = [[i - 1, t]];
    if (arr[i - 1] <= t && !skip) deps.push([i - 1, t - arr[i - 1]]);
    b.push("recurse-return", [i, t], `${v ? "Reachable" : "Not reachable"}, stored in memo.`, { callId, parentCallId, value: v, deps, codeAnchor: "memoStore" });
    return v;
  }

  // evaluate reachability top-down across the whole band so the table fills
  for (let t = k; t >= 1; t--) can(n, t);
  let bestS = 0;
  for (let s = k; s >= 1; s--) {
    if (memo.get(`${n},${s}`)) {
      bestS = s;
      break;
    }
  }
  const answer = total - 2 * bestS;
  b.push("table-read", [n, bestS], `Largest reachable S ≤ ${k} is ${bestS} → answer |${total} − 2×${bestS}| = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "min |S1 − S2| difference",
      tableShape: { rows: n + 1, cols: k + 1 },
      axisLabels: AXIS(arr, k),
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const arr = input.arr;
  const n = arr.length;
  const total = arr.reduce((a, b) => a + b, 0);
  const k = Math.floor(total / 2);
  const b = new TraceBuilder();

  const dp: boolean[][] = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(false));
  dp[0][0] = true;
  b.push("base-case", [0, 0], "dp[0][0] = T — the empty subset.", { value: true, codeAnchor: "base" });
  for (let t = 1; t <= k; t++) {
    b.push("base-case", [0, t], `No items → sum ${t} impossible.`, { value: false, codeAnchor: "base" });
  }

  for (let i = 1; i <= n; i++)
    for (let t = 0; t <= k; t++) {
      const v = dp[i - 1][t] || (arr[i - 1] <= t && dp[i - 1][t - arr[i - 1]]);
      const deps: number[][] = [[i - 1, t]];
      if (arr[i - 1] <= t) deps.push([i - 1, t - arr[i - 1]]);
      b.push("table-write", [i, t],
        arr[i - 1] <= t
          ? `dp[${i}][${t}] = skip (${dp[i - 1][t] ? "T" : "F"}) OR take ${arr[i - 1]} (${dp[i - 1][t - arr[i - 1]] ? "T" : "F"}) = ${v ? "T" : "F"}.`
          : `${arr[i - 1]} > ${t}: carry down ${dp[i - 1][t] ? "T" : "F"}.`,
        { value: v, deps, codeAnchor: "transition" });
      dp[i][t] = v;
    }

  let bestS = k;
  while (bestS > 0 && !dp[n][bestS]) bestS--;
  const answer = total - 2 * bestS;
  b.push("table-read", [n, bestS],
    `Scan row ${n} right-to-left for the last T → S = ${bestS}; answer = |${total} − 2×${bestS}| = ${answer}.`,
    { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "min |S1 − S2| difference",
      tableShape: { rows: n + 1, cols: k + 1 },
      axisLabels: AXIS(arr, k),
      valueFormat: "bool",
      stats: { steps: b.count, writes: (n + 1) * (k + 1) },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const arr = input.arr;
  const n = arr.length;
  const total = arr.reduce((a, b) => a + b, 0);
  const k = Math.floor(total / 2);
  const b = new TraceBuilder();

  const dp = new Array(k + 1).fill(false);
  dp[0] = true;
  b.push("base-case", [0, 0], "One boolean array: only dp[0] starts reachable. RIGHT-to-left keeps items single-use.", { value: true, codeAnchor: "init" });

  for (let i = 0; i < n; i++)
    for (let t = k; t >= arr[i]; t--)
      if (!dp[t] && dp[t - arr[i]]) {
        dp[t] = true;
        b.push("table-write", [i + 1, t], `Item ${arr[i]}: dp[${t}] becomes reachable via dp[${t - arr[i]}].`, {
          value: true,
          deps: [[i, t]],
          codeAnchor: "transition",
        });
      }

  let bestS = k;
  while (bestS > 0 && !dp[bestS]) bestS--;
  const answer = total - 2 * bestS;
  b.push("table-read", [n, bestS], `Highest reachable sum is ${bestS} → answer |${total} − 2×${bestS}| = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer,
      answerLabel: "min |S1 − S2| difference",
      tableShape: { rows: n + 1, cols: k + 1 },
      axisLabels: AXIS(arr, k),
      valueFormat: "bool",
      rollingWindow: true,
      stats: { steps: b.count, writes: b.steps.filter((s) => s.type === "table-write").length },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`bool can(int i, int t, vector<int>& a) {
    if (t == 0) return true;               // base
    if (i == 0) return false;              // base
    if (can(i - 1, t, a)) return true;     // recurse
    if (a[i - 1] <= t) return can(i - 1, t - a[i - 1], a);
    return false;                          // combine
}
// driver: scan s from total/2 down; first reachable s gives |total - 2s|
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static boolean can(int i, int t, int[] a) {
    if (t == 0) return true;                // base
    if (i == 0) return false;               // base
    if (can(i - 1, t, a)) return true;      // recurse
    if (a[i - 1] <= t) return can(i - 1, t - a[i - 1], a);
    return false;                           // combine
}
// driver: scan s from total/2 down; first reachable s gives |total - 2s|
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def can(i, t, a):
    if t == 0:                        # base
        return True
    if i == 0:                        # base
        return False
    if can(i - 1, t, a):              # recurse
        return True
    if a[i - 1] <= t:
        return can(i - 1, t - a[i - 1], a)
    return False                      # combine

# driver: scan s from total//2 down; first reachable s gives |total - 2s|
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: transition`,
      { base: "# base", recurse: "# recurse", combine: "# combine", driver: "# driver", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function can(i, t, a) {
  if (t === 0) return true;            // base
  if (i === 0) return false;           // base
  if (can(i - 1, t, a)) return true;   // recurse
  if (a[i - 1] <= t) return can(i - 1, t - a[i - 1], a);
  return false;                        // combine
}
// driver: scan s from total/2 down; first reachable s gives |total - 2s|
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int minDiff(vector<int>& a) {
    int total = accumulate(a.begin(), a.end(), 0);
    int k = total / 2;
    // memoize can(i,t), then scan row n right-to-left   // driver
    ...
}
bool can(int i, int t, vector<int>& a, vector<vector<int>>& memo) {
    if (t == 0) return true;                     // base
    if (i == 0) return false;                    // base
    if (memo[i][t] != -1) return memo[i][t];     // memo check
    bool res = can(i - 1, t, a, memo) ||
               (a[i - 1] <= t && can(i - 1, t - a[i - 1], a, memo)); // recurse
    return memo[i][t] = res;                     // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// driver", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int minDiff(int[] a) {
    int total = Arrays.stream(a).sum(), k = total / 2;
    // memoize can(i,t), then scan row n right-to-left    // driver
    ...
}
static boolean can(int i, int t, int[] a, int[][] memo) {
    if (t == 0) return true;                      // base
    if (i == 0) return false;                     // base
    if (memo[i][t] != -1) return memo[i][t] == 1; // memo check
    boolean res = can(i - 1, t, a, memo) ||
                  (a[i - 1] <= t && can(i - 1, t - a[i - 1], a, memo)); // recurse
    memo[i][t] = res ? 1 : 0;
    return res;                                   // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// driver", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`from functools import lru_cache

def min_diff(a):
    total = sum(a)
    k = total // 2
    # memoize can(i,t), then scan right-to-left   # driver
    ...

@lru_cache(maxsize=None)
def can(i, t):
    if t == 0:                              # base
        return True
    if i == 0:                              # base
        return False
    return can(i - 1, t) or (a[i - 1] <= t and can(i - 1, t - a[i - 1]))  # recurse
    # lru_cache handles the memo store/check
# anchor: combine
# anchor: init
# anchor: transition
# memoCheck
# memoStore`,
      { base: "# base", recurse: "# recurse", memoCheck: "# memoCheck", memoStore: "# memoStore", driver: "# driver", combine: "# anchor: combine", init: "# anchor: init", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function minDiff(a) {
  const total = a.reduce((x, y) => x + y, 0);
  const k = Math.floor(total / 2);
  // memoize can(i,t), then scan row n right-to-left   // driver
  ...
}
function can(i, t, memo) {
  if (t === 0) return true;                   // base
  if (i === 0) return false;                  // base
  if (memo.has(i + ',' + t)) return memo.get(i + ',' + t); // memo check
  const res = can(i - 1, t, memo) ||
    (a[i - 1] <= t && can(i - 1, t - a[i - 1], memo));   // recurse
  memo.set(i + ',' + t, res);
  return res;                                 // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// driver", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int minDiff(vector<int>& a) {
    int n = a.size();
    int total = accumulate(a.begin(), a.end(), 0), k = total / 2;
    vector<vector<bool>> dp(n + 1, vector<bool>(k + 1, false));
    dp[0][0] = true;                                 // base
    for (int i = 1; i <= n; ++i)
        for (int t = 0; t <= k; ++t) {
            dp[i][t] = dp[i - 1][t] ||
                       (a[i - 1] <= t && dp[i - 1][t - a[i - 1]]); // transition
        }
    for (int s = k; s >= 0; --s)                     // driver: last reachable s
        if (dp[n][s]) return total - 2 * s;
    return total;
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", driver: "// driver", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int minDiff(int[] a) {
    int n = a.length;
    int total = Arrays.stream(a).sum(), k = total / 2;
    boolean[][] dp = new boolean[n + 1][k + 1];
    dp[0][0] = true;                                  // base
    for (int i = 1; i <= n; ++i)
        for (int t = 0; t <= k; ++t)
            dp[i][t] = dp[i - 1][t] ||
                       (a[i - 1] <= t && dp[i - 1][t - a[i - 1]]); // transition
    for (int s = k; s >= 0; --s)                      // driver
        if (dp[n][s]) return total - 2 * s;
    return total;
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", driver: "// driver", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def min_diff(a):
    n = len(a)
    total = sum(a)
    k = total // 2
    dp = [[False] * (k + 1) for _ in range(n + 1)]
    dp[0][0] = True                                # base
    for i in range(1, n + 1):
        for t in range(k + 1):
            dp[i][t] = dp[i - 1][t] or \
                       (a[i - 1] <= t and dp[i - 1][t - a[i - 1]])  # transition
    for s in range(k, -1, -1):                     # driver
        if dp[n][s]:
            return total - 2 * s
    return total
# anchor: combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", transition: "# transition", driver: "# driver", combine: "# anchor: combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function minDiff(a) {
  const n = a.length;
  const total = a.reduce((x, y) => x + y, 0);
  const k = Math.floor(total / 2);
  const dp = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(false));
  dp[0][0] = true;                                  // base
  for (let i = 1; i <= n; i++)
    for (let t = 0; t <= k; t++)
      dp[i][t] = dp[i - 1][t] ||
                 (a[i - 1] <= t && dp[i - 1][t - a[i - 1]]); // transition
  for (let s = k; s >= 0; s--)                      // driver
    if (dp[n][s]) return total - 2 * s;
  return total;
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", driver: "// driver", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
  spaceOptimized: {
    cpp: withAnchors(
`int minDiff(vector<int>& a) {
    int total = accumulate(a.begin(), a.end(), 0), k = total / 2;
    vector<char> dp(k + 1, 0);                   // init
    dp[0] = 1;
    for (int x : a)
        for (int t = k; t >= x; --t)             // RIGHT-to-left
            if (!dp[t] && dp[t - x]) dp[t] = 1;  // transition
    for (int s = k; s >= 0; --s)                 // driver
        if (dp[s]) return total - 2 * s;
    return total;
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", driver: "// driver", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int minDiff(int[] a) {
    int total = Arrays.stream(a).sum(), k = total / 2;
    boolean[] dp = new boolean[k + 1];            // init
    dp[0] = true;
    for (int x : a)
        for (int t = k; t >= x; --t)              // RIGHT-to-left
            if (!dp[t] && dp[t - x]) dp[t] = true; // transition
    for (int s = k; s >= 0; --s)                  // driver
        if (dp[s]) return total - 2 * s;
    return total;
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", driver: "// driver", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def min_diff(a):
    total = sum(a)
    k = total // 2
    dp = [False] * (k + 1)                     # init
    dp[0] = True
    for x in a:
        for t in range(k, x - 1, -1):          # RIGHT-to-left
            if not dp[t] and dp[t - x]:
                dp[t] = True                   # transition
    for s in range(k, -1, -1):                 # driver
        if dp[s]:
            return total - 2 * s
    return total
# anchor: base
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { init: "# init", transition: "# transition", driver: "# driver", base: "# anchor: base", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function minDiff(a) {
  const total = a.reduce((x, y) => x + y, 0);
  const k = Math.floor(total / 2);
  const dp = new Array(k + 1).fill(false);   // init
  dp[0] = true;
  for (const x of a)
    for (let t = k; t >= x; t--)             // RIGHT-to-left
      if (!dp[t] && dp[t - x]) dp[t] = true; // transition
  for (let s = k; s >= 0; s--)               // driver
    if (dp[s]) return total - 2 * s;
  return total;
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", driver: "// driver", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
};

export const partitionMinAbsDiff: ProblemServiceDef = {
  slug: "partition-min-abs-diff",
  patternSlug: "dp-subsequences",
  inputDescriptor: [
    { key: "arr", label: "NUMBERS", kind: "array", min: 1, max: 8, valueRange: [1, 9] },
  ],
  schema,
  defaultInput: { arr: [1, 2, 3, 9] }, // classic example → total 15, best S=6 ({1,2,3}) → diff 3
  randomInput: () => ({
    arr: Array.from({ length: 2 + Math.floor(Math.random() * 5) }, () => 1 + Math.floor(Math.random() * 9)),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : mode === "tabulation" ? genTab(input as In) : genSpace(input as In),
  codes,
};
