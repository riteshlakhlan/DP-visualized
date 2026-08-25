import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Shortest Common Supersequence (Striver DP-31): shortest string containing
 * BOTH s and t as subsequences. Length = m + n − LCS(s,t).
 * dp[i][j]: match → 1 + dp[i-1][j-1]; else 1 + min(dp[i-1][j], dp[i][j-1]).
 */

const schema = z.object({
  s: z.string().regex(/^[a-z]{1,6}$/),
  t: z.string().regex(/^[a-z]{1,6}$/),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  const m = input.s.length, n = input.t.length;
  if (mode === "bruteforce" && Math.max(m, n) > 6)
    return "Pure recursion branches two ways per mismatch. Keep both strings <= 4 chars for Brute Force.";
  if (mode !== "bruteforce" && Math.max(m, n) > 6)
    return "Keep both strings <= 6 chars so the table stays readable.";
  return null;
}

const AXIS = (s: string, t: string) => ({
  rowsTitle: `prefixes of "${s}"`,
  colsTitle: `prefixes of "${t}"`,
  rowLabels: ["ε", ...s.split("")],
  colLabels: ["ε", ...t.split("")],
});

function genBrute(input: In): GeneratedTrace {
  const { s, t } = input;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<string>();

  function f(i: number, j: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i === 0) {
      b.push("base-case", [0, j], `s empty → append remaining ${j} chars of t.`, { callId, parentCallId, value: j, codeAnchor: "base" });
      return j;
    }
    if (j === 0) {
      b.push("base-case", [i, 0], `t empty → append remaining ${i} chars of s.`, { callId, parentCallId, value: i, codeAnchor: "base" });
      return i;
    }
    const dup = seen.has(`${i},${j}`);
    const match = s[i - 1] === t[j - 1];
    b.push("recurse-call", [i, j],
      dup ? `f(${i},${j}) called AGAIN.` : `f(${i},${j}) called: compare '${s[i - 1]}' vs '${t[j - 1]}' (${match ? "MATCH" : "no match"}).`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: match ? "match" : "recurse" });
    seen.add(`${i},${j}`);
    let v: number;
    let deps: number[][];
    if (match) {
      v = 1 + f(i - 1, j - 1, callId);
      deps = [[i - 1, j - 1]];
      b.push("recurse-return", [i, j], `'${s[i - 1]}' shared by both → count once: f(${i},${j}) = ${v}.`, { callId, parentCallId, value: v, deps, codeAnchor: "match" });
    } else {
      const takeS = f(i - 1, j, callId);
      const takeT = f(i, j - 1, callId);
      v = 1 + Math.min(takeS, takeT);
      deps = [[i - 1, j], [i, j - 1]];
      b.push("recurse-return", [i, j], `Mismatch → 1 + min(append '${s[i - 1]}': ${takeS}, append '${t[j - 1]}': ${takeT}) = ${v}.`, {
        callId, parentCallId, value: v, deps, codeAnchor: "nomatch",
      });
    }
    return v;
  }

  const answer = f(s.length, t.length);
  return {
    steps: b.steps,
    meta: { mode: "bruteforce", answer, answerLabel: "SCS length", tableShape: null, axisLabels: null, valueFormat: "int", stats: { steps: b.count, calls } },
  };
}

function genMemo(input: In): GeneratedTrace {
  const { s, t } = input;
  const m = s.length, n = t.length;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, j: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i, j], `f(${i},${j}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (i === 0) {
      b.push("base-case", [0, j], `${j} chars of t remain.`, { callId, parentCallId, value: j, codeAnchor: "base" });
      return j;
    }
    if (j === 0) {
      b.push("base-case", [i, 0], `${i} chars of s remain.`, { callId, parentCallId, value: i, codeAnchor: "base" });
      return i;
    }
    const kk = `${i},${j}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [i, j], `Memo hit! f(${i},${j}) = ${v}.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    let v: number;
    let deps: number[][];
    if (s[i - 1] === t[j - 1]) {
      v = 1 + f(i - 1, j - 1, callId);
      deps = [[i - 1, j - 1]];
    } else {
      v = 1 + Math.min(f(i - 1, j, callId), f(i, j - 1, callId));
      deps = [[i - 1, j], [i, j - 1]];
    }
    memo.set(kk, v);
    b.push("recurse-return", [i, j], `f(${i},${j}) = ${v}, stored in memo.`, { callId, parentCallId, value: v, deps, codeAnchor: "memoStore" });
    return v;
  }

  const answer = f(m, n);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "SCS length",
      tableShape: { rows: m + 1, cols: n + 1 },
      axisLabels: AXIS(s, t),
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const { s, t } = input;
  const m = s.length, n = t.length;
  const b = new TraceBuilder();
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(-1));

  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
    b.push("base-case", [0, j], `dp[0][${j}] = ${j}.`, { value: j, codeAnchor: "base" });
  }
  for (let i = 1; i <= m; i++) {
    dp[i][0] = i;
    b.push("base-case", [i, 0], `dp[${i}][0] = ${i}.`, { value: i, codeAnchor: "base" });
  }

  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      let v: number;
      let deps: number[][];
      if (s[i - 1] === t[j - 1]) {
        v = 1 + dp[i - 1][j - 1];
        deps = [[i - 1, j - 1]];
        b.push("table-write", [i, j], `'${s[i - 1]}' == '${t[j - 1]}' → share the char: dp[${i}][${j}] = 1 + dp[${i - 1}][${j - 1}] = ${v}.`, {
          value: v, deps, codeAnchor: "match",
        });
      } else {
        v = 1 + Math.min(dp[i - 1][j], dp[i][j - 1]);
        deps = [[i - 1, j], [i, j - 1]];
        b.push("table-write", [i, j],
          `'${s[i - 1]}' != '${t[j - 1]}' → 1 + min(take-from-s dp[${i - 1}][${j}]=${dp[i - 1][j]}, take-from-t dp[${i}][${j - 1}]=${dp[i][j - 1]}) = ${v}.`,
          { value: v, deps, codeAnchor: "nomatch" });
      }
      dp[i][j] = v;
    }

  const answer = dp[m][n];
  b.push("table-read", [m, n], `Answer at bottom-right: dp[${m}][${n}] = ${answer}. Also equals m + n − LCS = ${m} + ${n} − ${m + n - answer}.`, {
    value: answer, codeAnchor: "driver",
  });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "SCS length",
      tableShape: { rows: m + 1, cols: n + 1 },
      axisLabels: AXIS(s, t),
      valueFormat: "int",
      stats: { steps: b.count, writes: (m + 1) * (n + 1) },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const { s, t } = input;
  const m = s.length, n = t.length;
  const b = new TraceBuilder();

  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let j = 0; j <= n; j++)
    b.push("base-case", [0, j], `prev[${j}] = ${j}.`, { value: j, codeAnchor: "init" });

  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1).fill(0);
    cur[0] = i;
    b.push("table-write", [i, 0], `cur[0] = ${i}.`, { value: i, deps: [], codeAnchor: "init" });
    for (let j = 1; j <= n; j++) {
      let v: number;
      let deps: number[][];
      if (s[i - 1] === t[j - 1]) {
        v = 1 + prev[j - 1];
        deps = [[i - 1, j - 1]];
        b.push("table-write", [i, j], `Match → cur[${j}] = 1 + prev[${j - 1}] = ${v}.`, { value: v, deps, codeAnchor: "match" });
      } else {
        v = 1 + Math.min(prev[j], cur[j - 1]);
        deps = [[i - 1, j], [i, j - 1]];
        b.push("table-write", [i, j], `1 + min(prev[${j}]=${prev[j]}, cur[${j - 1}]=${cur[j - 1]}) = ${v}.`, { value: v, deps, codeAnchor: "nomatch" });
      }
      cur[j] = v;
    }
    prev = cur;
  }
  const answer = prev[n];
  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer,
      answerLabel: "SCS length",
      tableShape: { rows: m + 1, cols: n + 1 },
      axisLabels: AXIS(s, t),
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: (m + 1) * (n + 1) },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int i, int j, string& s, string& t) {
    if (i == 0) return j;                        // base
    if (j == 0) return i;                        // base
    if (s[i - 1] == t[j - 1])
        return 1 + f(i - 1, j - 1, s, t);        // match
    // nomatch: append one of the two chars
    return 1 + min(f(i - 1, j, s, t),            // recurse
                   f(i, j - 1, s, t));
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore`,
      { base: "// base", match: "// match", recurse: "// recurse", nomatch: "// nomatch", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore" },
    ),
    java: withAnchors(
`static int f(int i, int j, String s, String t) {
    if (i == 0) return j;                         // base
    if (j == 0) return i;                         // base
    if (s.charAt(i - 1) == t.charAt(j - 1))
        return 1 + f(i - 1, j - 1, s, t);         // match
    // nomatch: append one of the two chars
    return 1 + Math.min(f(i - 1, j, s, t),        // recurse
                        f(i, j - 1, s, t));
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore`,
      { base: "// base", match: "// match", recurse: "// recurse", nomatch: "// nomatch", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore" },
    ),
    python: withAnchors(
`def f(i, j, s, t):
    if i == 0:                              # base
        return j
    if j == 0:                              # base
        return i
    if s[i - 1] == t[j - 1]:
        return 1 + f(i - 1, j - 1, s, t)    # match
    # nomatch: append one of the two chars
    return 1 + min(f(i - 1, j, s, t),       # recurse
                   f(i, j - 1, s, t))
# anchor: driver
# anchor: init
# anchor: memoCheck
# anchor: memoStore`,
      { base: "# base", match: "# match", recurse: "# recurse", nomatch: "# nomatch", driver: "# anchor: driver", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore" },
    ),
    js: withAnchors(
`function f(i, j, s, t) {
  if (i === 0) return j;                     // base
  if (j === 0) return i;                     // base
  if (s[i - 1] === t[j - 1])
    return 1 + f(i - 1, j - 1, s, t);        // match
  // nomatch: append one of the two chars
  return 1 + Math.min(f(i - 1, j, s, t),     // recurse
                      f(i, j - 1, s, t));
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore`,
      { base: "// base", match: "// match", recurse: "// recurse", nomatch: "// nomatch", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int i, int j, string& s, string& t, vector<vector<int>>& memo) {
    if (i == 0) return j;                           // base
    if (j == 0) return i;                           // base
    if (memo[i][j] != -1) return memo[i][j];        // memo check
    if (s[i - 1] == t[j - 1])
        memo[i][j] = 1 + f(i - 1, j - 1, s, t, memo);       // match
    else
        memo[i][j] = 1 + min(f(i - 1, j, s, t, memo),       // recurse
                             f(i, j - 1, s, t, memo));
    return memo[i][j];                              // memo store
}
// anchor: driver
// anchor: init
// anchor: nomatch
// memoCheck
// memoStore`,
      { base: "// base", match: "// match", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// anchor: driver", init: "// anchor: init", nomatch: "// anchor: nomatch" },
    ),
    java: withAnchors(
`static int f(int i, int j, String s, String t, int[][] memo) {
    if (i == 0) return j;                            // base
    if (j == 0) return i;                            // base
    if (memo[i][j] != -1) return memo[i][j];         // memo check
    if (s.charAt(i - 1) == t.charAt(j - 1))
        memo[i][j] = 1 + f(i - 1, j - 1, s, t, memo);         // match
    else
        memo[i][j] = 1 + Math.min(f(i - 1, j, s, t, memo),
                                  f(i, j - 1, s, t, memo)); // recurse
    return memo[i][j];                               // memo store
}
// anchor: driver
// anchor: init
// anchor: nomatch
// memoCheck
// memoStore`,
      { base: "// base", match: "// match", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// anchor: driver", init: "// anchor: init", nomatch: "// anchor: nomatch" },
    ),
    python: withAnchors(
`def f(i, j, s, t, memo):
    if i == 0:                                 # base
        return j
    if j == 0:                                 # base
        return i
    if memo[i][j] != -1:                       # memo check
        return memo[i][j]
    if s[i - 1] == t[j - 1]:
        memo[i][j] = 1 + f(i - 1, j - 1, s, t, memo)     # match
    else:
        memo[i][j] = 1 + min(f(i - 1, j, s, t, memo),
                             f(i, j - 1, s, t, memo))   # recurse
    return memo[i][j]                          # memo store
# anchor: driver
# anchor: init
# anchor: nomatch
# memoCheck
# memoStore`,
      { base: "# base", match: "# match", recurse: "# recurse", memoCheck: "# memoCheck", memoStore: "# memoStore", driver: "# anchor: driver", init: "# anchor: init", nomatch: "# anchor: nomatch" },
    ),
    js: withAnchors(
`function f(i, j, s, t, memo) {
  if (i === 0) return j;                            // base
  if (j === 0) return i;                            // base
  if (memo[i][j] !== -1) return memo[i][j];         // memo check
  if (s[i - 1] === t[j - 1])
    memo[i][j] = 1 + f(i - 1, j - 1, s, t, memo);   // match
  else
    memo[i][j] = 1 + Math.min(f(i - 1, j, s, t, memo),
                              f(i, j - 1, s, t, memo)); // recurse
  return memo[i][j];                                // memo store
}
// anchor: driver
// anchor: init
// anchor: nomatch
// memoCheck
// memoStore`,
      { base: "// base", match: "// match", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// anchor: driver", init: "// anchor: init", nomatch: "// anchor: nomatch" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int shortestCommonSupersequence(string& s, string& t) {
    int m = s.size(), n = t.size();
    vector<vector<int>> dp(m + 1, vector<int>(n + 1, 0));
    for (int j = 0; j <= n; ++j) dp[0][j] = j;      // base
    for (int i = 0; i <= m; ++i) dp[i][0] = i;      // base
    for (int i = 1; i <= m; ++i)
        for (int j = 1; j <= n; ++j) {
            if (s[i - 1] == t[j - 1])
                dp[i][j] = 1 + dp[i - 1][j - 1];              // match
            else
                dp[i][j] = 1 + min(dp[i - 1][j],              // transition
                                   dp[i][j - 1]);
        }
    return dp[m][n];
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// nomatch
// driver`,
      { base: "// base", match: "// match", nomatch: "// nomatch", transition: "// transition", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int shortestCommonSupersequence(String s, String t) {
    int m = s.length(), n = t.length();
    int[][] dp = new int[m + 1][n + 1];
    for (int j = 0; j <= n; ++j) dp[0][j] = j;       // base
    for (int i = 0; i <= m; ++i) dp[i][0] = i;       // base
    for (int i = 1; i <= m; ++i)
        for (int j = 1; j <= n; ++j) {
            if (s.charAt(i - 1) == t.charAt(j - 1))
                dp[i][j] = 1 + dp[i - 1][j - 1];               // match
            else
                dp[i][j] = 1 + Math.min(dp[i - 1][j],          // transition
                                        dp[i][j - 1]);
        }
    return dp[m][n];
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// nomatch
// driver`,
      { base: "// base", match: "// match", nomatch: "// nomatch", transition: "// transition", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def scs_length(s, t):
    m, n = len(s), len(t)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for j in range(n + 1): dp[0][j] = j        # base
    for i in range(m + 1): dp[i][0] = i        # base
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if s[i - 1] == t[j - 1]:
                dp[i][j] = 1 + dp[i - 1][j - 1]     # match
            else:
                dp[i][j] = 1 + min(dp[i - 1][j],    # transition
                                   dp[i][j - 1])
    return dp[m][n]
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
# nomatch
# driver`,
      { base: "# base", match: "# match", nomatch: "# nomatch", transition: "# transition", driver: "# driver", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function shortestCommonSupersequenceLen(s, t) {
  const m = s.length, n = t.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let j = 0; j <= n; j++) dp[0][j] = j;   // base
  for (let i = 0; i <= m; i++) dp[i][0] = i;   // base
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      if (s[i - 1] === t[j - 1])
        dp[i][j] = 1 + dp[i - 1][j - 1];           // match
      else
        dp[i][j] = 1 + Math.min(dp[i - 1][j],      // transition
                                dp[i][j - 1]);
    }
  return dp[m][n];
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// nomatch
// driver`,
      { base: "// base", match: "// match", nomatch: "// nomatch", transition: "// transition", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
  spaceOptimized: {
    cpp: withAnchors(
`int shortestCommonSupersequence(string& s, string& t) {
    int m = s.size(), n = t.size();
    vector<int> prev(n + 1), cur(n + 1);
    iota(prev.begin(), prev.end(), 0);             // init
    for (int i = 1; i <= m; ++i) {
        cur[0] = i;
        for (int j = 1; j <= n; ++j) {
            if (s[i - 1] == t[j - 1])
                cur[j] = 1 + prev[j - 1];                    // match
            else
                cur[j] = 1 + min(prev[j], cur[j - 1]);       // transition
        }
        prev = cur;
    }
    return prev[n];
}
// anchor: base
// anchor: driver
// anchor: memoCheck
// anchor: memoStore
// anchor: nomatch
// anchor: recurse`,
      { init: "// init", match: "// match", transition: "// transition", base: "// anchor: base", driver: "// anchor: driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", nomatch: "// anchor: nomatch", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int shortestCommonSupersequence(String s, String t) {
    int m = s.length(), n = t.length();
    int[] prev = new int[n + 1], cur = new int[n + 1];
    for (int j = 0; j <= n; ++j) prev[j] = j;       // init
    for (int i = 1; i <= m; ++i) {
        cur[0] = i;
        for (int j = 1; j <= n; ++j) {
            if (s.charAt(i - 1) == t.charAt(j - 1))
                cur[j] = 1 + prev[j - 1];                    // match
            else
                cur[j] = 1 + Math.min(prev[j], cur[j - 1]);  // transition
        }
        prev = cur;
    }
    return prev[n];
}
// anchor: base
// anchor: driver
// anchor: memoCheck
// anchor: memoStore
// anchor: nomatch
// anchor: recurse`,
      { init: "// init", match: "// match", transition: "// transition", base: "// anchor: base", driver: "// anchor: driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", nomatch: "// anchor: nomatch", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def scs_length(s, t):
    m, n = len(s), len(t)
    prev = list(range(n + 1))                  # init
    for i in range(1, m + 1):
        cur = [0] * (n + 1)
        cur[0] = i
        for j in range(1, n + 1):
            if s[i - 1] == t[j - 1]:
                cur[j] = 1 + prev[j - 1]                # match
            else:
                cur[j] = 1 + min(prev[j], cur[j - 1])   # transition
        prev = cur
    return prev[n]
# anchor: base
# anchor: driver
# anchor: memoCheck
# anchor: memoStore
# anchor: nomatch
# anchor: recurse`,
      { init: "# init", match: "# match", transition: "# transition", base: "# anchor: base", driver: "# anchor: driver", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", nomatch: "# anchor: nomatch", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function scsLength(s, t) {
  const m = s.length, n = t.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j); // init
  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1).fill(0);
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      if (s[i - 1] === t[j - 1])
        cur[j] = 1 + prev[j - 1];                    // match
      else
        cur[j] = 1 + Math.min(prev[j], cur[j - 1]);  // transition
    }
    prev = cur;
  }
  return prev[n];
}
// anchor: base
// anchor: driver
// anchor: memoCheck
// anchor: memoStore
// anchor: nomatch
// anchor: recurse`,
      { init: "// init", match: "// match", transition: "// transition", base: "// anchor: base", driver: "// anchor: driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", nomatch: "// anchor: nomatch", recurse: "// anchor: recurse" },
    ),
  },
};

export const scsService: ProblemServiceDef = {
  slug: "shortest-common-supersequence",
  patternSlug: "dp-strings",
  inputDescriptor: [
    { key: "s", label: "STRING A", kind: "stringPair", min: 1, max: 5 },
    { key: "t", label: "STRING B", kind: "stringPair", min: 1, max: 5 },
  ],
  schema,
  defaultInput: { s: "brute", t: "groot" }, // verified → 8 (= 5 + 5 - LCS("brute","groot") = 10 - 2)
  randomInput: () => ({
    s: randStr(2 + Math.floor(Math.random() * 3)),
    t: randStr(2 + Math.floor(Math.random() * 3)),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : mode === "tabulation" ? genTab(input as In) : genSpace(input as In),
  codes,
};

function randStr(len: number): string {
  const out = [];
  for (let i = 0; i < len; i++) out.push("abc"[Math.floor(Math.random() * 3)]);
  return out.join("");
}
