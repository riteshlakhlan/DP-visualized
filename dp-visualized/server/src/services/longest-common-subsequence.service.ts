import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Longest Common Subsequence (Striver DP-25).
 * Table: rows = prefixes of s, cols = prefixes of t.
 * dp[i][j] = LCS length of s[0..i) and t[0..j).
 */

const schema = z.object({
  s: z.string().regex(/^[a-z]{1,8}$/),
  t: z.string().regex(/^[a-z]{1,8}$/),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  const m = input.s.length, n = input.t.length;
  if (mode === "bruteforce" && Math.max(m, n) > 4)
    return "Pure recursion re-explores overlapping prefixes exponentially. Keep both strings <= 4 chars for Brute Force.";
  if (mode !== "bruteforce" && Math.max(m, n) > 8)
    return "Keep both strings <= 8 chars so the table stays readable.";
  return null;
}

function genBrute(input: In): GeneratedTrace {
  const { s, t } = input;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<string>();
  const kk = (i: number, j: number) => `${i},${j}`;

  function f(i: number, j: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i === 0 || j === 0) {
      b.push("recurse-call", [i, j], `f(${i},${j}) called — an empty prefix has no subsequence in common.`, { callId, parentCallId, codeAnchor: "base" });
      b.push("base-case", [i, j], "Base case: empty prefix → LCS length 0.", { callId, parentCallId, value: 0 });
      return 0;
    }
    const dup = seen.has(kk(i, j));
    const match = s[i - 1] === t[j - 1];
    b.push("recurse-call", [i, j],
      dup ? `f(${i},${j}) called AGAIN — identical subtree repeats.`
          : `f(${i},${j}) called: compare '${s[i - 1]}' vs '${t[j - 1]}' (${match ? "MATCH" : "no match"}).`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: match ? "match" : "recurse" });
    seen.add(kk(i, j));
    let v: number;
    const deps: number[][] = [];
    if (match) {
      v = 1 + f(i - 1, j - 1, callId);
      deps.push([i - 1, j - 1]);
      b.push("recurse-return", [i, j], `Characters match ('${s[i - 1]}') → f(${i},${j}) = 1 + f(${i - 1},${j - 1}) = ${v}.`, {
        callId,
        parentCallId,
        value: v,
        deps,
        codeAnchor: "match",
      });
    } else {
      const up = f(i - 1, j, callId);
      const left = f(i, j - 1, callId);
      v = Math.max(up, left);
      deps.push([i - 1, j], [i, j - 1]);
      b.push("recurse-return", [i, j], `No match → f(${i},${j}) = max(drop '${s[i - 1]}': ${up}, drop '${t[j - 1]}': ${left}) = ${v}.`, {
        callId,
        parentCallId,
        value: v,
        deps,
        codeAnchor: "nomatch",
      });
    }
    return v;
  }

  const answer = f(s.length, t.length);  return {
    steps: b.steps,
    meta: {
      mode: "bruteforce",
      answer,
      answerLabel: "LCS length",
      tableShape: null,
      axisLabels: null,
      valueFormat: "int",
      stats: { steps: b.count, calls },
    },
  };
}

function genMemo(input: In): GeneratedTrace {
  const { s, t } = input;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, j: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i, j], `f(${i},${j}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (i === 0 || j === 0) {
      b.push("base-case", [i, j], "Base case: empty prefix → 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    const kk = `${i},${j}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [i, j], `Memo hit! f(${i},${j}) = ${v}.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    const match = s[i - 1] === t[j - 1];
    let v: number;
    let deps: number[][];
    if (match) {
      v = 1 + f(i - 1, j - 1, callId);
      deps = [[i - 1, j - 1]];
    } else {
      const up = f(i - 1, j, callId);
      const left = f(i, j - 1, callId);
      v = Math.max(up, left);
      deps = [[i - 1, j], [i, j - 1]];
    }
    memo.set(kk, v);
    b.push("recurse-return", [i, j], `f(${i},${j}) = ${v}, stored in memo.`, { callId, parentCallId, value: v, deps, codeAnchor: "memoStore" });
    return v;
  }

  const answer = f(s.length, t.length);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "LCS length",
      tableShape: { rows: s.length + 1, cols: t.length + 1 },
      axisLabels: {
        rowsTitle: `prefixes of "${s}"`,
        colsTitle: `prefixes of "${t}"`,
        rowLabels: ["ε", ...s.split("")],
        colLabels: ["ε", ...t.split("")],
      },
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const { s, t } = input;
  const m = s.length, n = t.length;
  const b = new TraceBuilder();

  for (let j = 0; j <= n; j++)
    b.push("base-case", [0, j], "Row 0: empty prefix of s → LCS length 0.", { value: 0, codeAnchor: "base" });
  for (let i = 1; i <= m; i++)
    b.push("base-case", [i, 0], "Column 0: empty prefix of t → LCS length 0.", { value: 0, codeAnchor: "base" });

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(-1));
  for (let j = 0; j <= n; j++) dp[0][j] = 0;
  for (let i = 1; i <= m; i++) dp[i][0] = 0;

  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      if (s[i - 1] === t[j - 1]) {
        const v = 1 + dp[i - 1][j - 1];
        b.push("table-write", [i, j], `'${s[i - 1]}' == '${t[j - 1]}' → extend diagonal: dp[${i}][${j}] = 1 + dp[${i - 1}][${j - 1}] = ${v}.`, {
          value: v,
          deps: [[i - 1, j - 1]],
          codeAnchor: "match",
        });
        dp[i][j] = v;
      } else {
        const v = Math.max(dp[i - 1][j], dp[i][j - 1]);
        b.push("table-write", [i, j],
          `'${s[i - 1]}' != '${t[j - 1]}' → best of skipping one char: max(dp[${i - 1}][${j}] = ${dp[i - 1][j]}, dp[${i}][${j - 1}] = ${dp[i][j - 1]}) = ${v}.`,
          { value: v, deps: [[i - 1, j], [i, j - 1]], codeAnchor: "nomatch" });
        dp[i][j] = v;
      }
    }
  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer: dp[m][n],
      answerLabel: "LCS length",
      tableShape: { rows: m + 1, cols: n + 1 },
      axisLabels: {
        rowsTitle: `prefixes of "${s}"`,
        colsTitle: `prefixes of "${t}"`,
        rowLabels: ["ε", ...s.split("")],
        colLabels: ["ε", ...t.split("")],
      },
      valueFormat: "int",
      stats: { steps: b.count, writes: (m + 1) * (n + 1) },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const { s, t } = input;
  const m = s.length, n = t.length;
  const b = new TraceBuilder();

  for (let j = 0; j <= n; j++)
    b.push("base-case", [0, j], "prev[0.." + n + "] = 0: two rows replace the whole grid.", { value: 0, codeAnchor: "init" });

  let prev = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1).fill(0);
    cur[0] = 0;
    for (let j = 1; j <= n; j++) {
      let v: number;
      if (s[i - 1] === t[j - 1]) {
        v = 1 + prev[j - 1];
        b.push("table-write", [i, j], `'${s[i - 1]}' == '${t[j - 1]}' → cur[${j}] = 1 + prev[${j - 1}] = ${v} (diagonal from previous row).`, {
          value: v,
          deps: [[i - 1, j - 1]],
          codeAnchor: "match",
        });
      } else {
        v = Math.max(prev[j], cur[j - 1]);
        b.push("table-write", [i, j], `'${s[i - 1]}' != '${t[j - 1]}' → cur[${j}] = max(prev[${j}] = ${prev[j]}, cur[${j - 1}] = ${cur[j - 1]}) = ${v}.`, {
          value: v,
          deps: [[i - 1, j], [i, j - 1]],
          codeAnchor: "nomatch",
        });
      }
      cur[j] = v;
    }
    prev = cur;
  }
  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer: prev[n],
      answerLabel: "LCS length",
      tableShape: { rows: m + 1, cols: n + 1 },
      axisLabels: {
        rowsTitle: `prefixes of "${s}"`,
        colsTitle: `prefixes of "${t}"`,
        rowLabels: ["ε", ...s.split("")],
        colLabels: ["ε", ...t.split("")],
      },
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: (m + 1) * (n + 1) },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int lcs(int i, int j, string& s, string& t) {
    if (i == 0 || j == 0) return 0;              // base
    if (s[i - 1] == t[j - 1])
        return 1 + lcs(i - 1, j - 1, s, t);      // match
    // recurse: skip one char from either side
    return max(lcs(i - 1, j, s, t),
               lcs(i, j - 1, s, t));             // nomatch
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore`,
      { base: "// base", match: "// match", recurse: "// recurse", nomatch: "// nomatch", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore" },
    ),
    java: withAnchors(
`static int lcs(int i, int j, String s, String t) {
    if (i == 0 || j == 0) return 0;              // base
    if (s.charAt(i - 1) == t.charAt(j - 1))
        return 1 + lcs(i - 1, j - 1, s, t);      // match
    return Math.max(lcs(i - 1, j, s, t),
                    lcs(i, j - 1, s, t));        // nomatch
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", match: "// match", nomatch: "// nomatch", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def lcs(i, j, s, t):
    if i == 0 or j == 0:                # base
        return 0
    if s[i - 1] == t[j - 1]:
        return 1 + lcs(i - 1, j - 1, s, t)   # match
    # recurse: skip one char either side
    return max(lcs(i - 1, j, s, t),
               lcs(i, j - 1, s, t))         # nomatch
# anchor: init
# anchor: memoCheck
# anchor: memoStore`,
      { base: "# base", match: "# match", recurse: "# recurse", nomatch: "# nomatch", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore" },
    ),
    js: withAnchors(
`function lcs(i, j, s, t) {
  if (i === 0 || j === 0) return 0;               // base
  if (s[i - 1] === t[j - 1])
    return 1 + lcs(i - 1, j - 1, s, t);           // match
  // recurse: skip one char from either side
  return Math.max(lcs(i - 1, j, s, t),
                  lcs(i, j - 1, s, t));           // nomatch
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore`,
      { base: "// base", match: "// match", recurse: "// recurse", nomatch: "// nomatch", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int lcs(int i, int j, string& s, string& t, vector<vector<int>>& memo) {
    if (i == 0 || j == 0) return 0;               // base
    if (memo[i][j] != -1) return memo[i][j];      // memo check
    int res;
    if (s[i - 1] == t[j - 1])
        res = 1 + lcs(i - 1, j - 1, s, t, memo);   // match
    else
        res = max(lcs(i - 1, j, s, t, memo),
                  lcs(i, j - 1, s, t, memo));      // nomatch
    memo[i][j] = res;                             // memo store
    return res;
}
// anchor: init
// anchor: recurse
// memoCheck
// memoStore`,
      { base: "// base", memoCheck: "// memoCheck", memoStore: "// memoStore", match: "// match", nomatch: "// nomatch", init: "// anchor: init", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int lcs(int i, int j, String s, String t, int[][] memo) {
    if (i == 0 || j == 0) return 0;               // base
    if (memo[i][j] != -1) return memo[i][j];      // memo check
    int res;
    if (s.charAt(i - 1) == t.charAt(j - 1))
        res = 1 + lcs(i - 1, j - 1, s, t, memo);   // match
    else
        res = Math.max(lcs(i - 1, j, s, t, memo),
                       lcs(i, j - 1, s, t, memo)); // nomatch
    memo[i][j] = res;                             // memo store
    return res;
}
// anchor: init
// anchor: recurse
// memoCheck
// memoStore`,
      { base: "// base", memoCheck: "// memoCheck", memoStore: "// memoStore", match: "// match", nomatch: "// nomatch", init: "// anchor: init", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def lcs(i, j, s, t, memo):
    if i == 0 or j == 0:                 # base
        return 0
    if memo[i][j] != -1:                 # memo check
        return memo[i][j]
    if s[i - 1] == t[j - 1]:
        res = 1 + lcs(i - 1, j - 1, s, t, memo)   # match
    else:
        res = max(lcs(i - 1, j, s, t, memo),
                  lcs(i, j - 1, s, t, memo))     # nomatch
    memo[i][j] = res                    # memo store
    return res
# anchor: init
# anchor: recurse
# memoCheck
# memoStore`,
      { base: "# base", memoCheck: "# memoCheck", memoStore: "# memoStore", match: "# match", nomatch: "# nomatch", init: "# anchor: init", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function lcs(i, j, s, t, memo) {
  if (i === 0 || j === 0) return 0;               // base
  if (memo[i][j] !== -1) return memo[i][j];       // memo check
  let res;
  if (s[i - 1] === t[j - 1])
    res = 1 + lcs(i - 1, j - 1, s, t, memo);      // match
  else
    res = Math.max(lcs(i - 1, j, s, t, memo),
                   lcs(i, j - 1, s, t, memo));    // nomatch
  memo[i][j] = res;
  return res;                                     // memo store
}
// anchor: init
// anchor: recurse
// memoCheck
// memoStore`,
      { base: "// base", memoCheck: "// memoCheck", memoStore: "// memoStore", match: "// match", nomatch: "// nomatch", init: "// anchor: init", recurse: "// anchor: recurse" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int lcs(string& s, string& t) {
    int m = s.size(), n = t.size();
    vector<vector<int>> dp(m + 1, vector<int>(n + 1, 0));
    // base: row 0 and column 0 stay 0
    for (int i = 1; i <= m; ++i)
        for (int j = 1; j <= n; ++j)
            if (s[i - 1] == t[j - 1])
                dp[i][j] = 1 + dp[i - 1][j - 1];   // match
            else
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1]);   // nomatch
    return dp[m][n];
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", match: "// match", nomatch: "// nomatch", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int lcs(String s, String t) {
    int m = s.length(), n = t.length();
    int[][] dp = new int[m + 1][n + 1];
    // base: row 0 and column 0 stay 0
    for (int i = 1; i <= m; ++i)
        for (int j = 1; j <= n; ++j)
            if (s.charAt(i - 1) == t.charAt(j - 1))
                dp[i][j] = 1 + dp[i - 1][j - 1];   // match
            else
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);   // nomatch
    return dp[m][n];
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", match: "// match", nomatch: "// nomatch", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def lcs(s, t):
    m, n = len(s), len(t)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    # base: row 0 / col 0 already 0
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if s[i - 1] == t[j - 1]:
                dp[i][j] = 1 + dp[i - 1][j - 1]      # match
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])   # nomatch
    return dp[m][n]
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", match: "# match", nomatch: "# nomatch", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function lcs(s, t) {
  const m = s.length, n = t.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  // base: row 0 and column 0 stay 0
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      if (s[i - 1] === t[j - 1])
        dp[i][j] = 1 + dp[i - 1][j - 1];              // match
      else
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);   // nomatch
  return dp[m][n];
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", match: "// match", nomatch: "// nomatch", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
  spaceOptimized: {
    cpp: withAnchors(
`int lcs(string& s, string& t) {
    int m = s.size(), n = t.size();
    vector<int> prev(n + 1, 0), cur(n + 1, 0);   // two rows only
    for (int i = 1; i <= m; ++i) {
        cur[0] = 0;
        for (int j = 1; j <= n; ++j)
            if (s[i - 1] == t[j - 1])
                cur[j] = 1 + prev[j - 1];        // match (diagonal)
            else
                cur[j] = max(prev[j], cur[j - 1]);   // nomatch
        prev = cur;
    }
    return prev[n];
}
// anchor: base
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// init`,
      { init: "// init", match: "// match", nomatch: "// nomatch", base: "// anchor: base", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int lcs(String s, String t) {
    int m = s.length(), n = t.length();
    int[] prev = new int[n + 1], cur = new int[n + 1];   // two rows only
    for (int i = 1; i <= m; ++i) {
        cur[0] = 0;
        for (int j = 1; j <= n; ++j)
            if (s.charAt(i - 1) == t.charAt(j - 1))
                cur[j] = 1 + prev[j - 1];        // match (diagonal)
            else
                cur[j] = Math.max(prev[j], cur[j - 1]);   // nomatch
        prev = cur.clone();
    }
    return prev[n];
}
// anchor: base
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// init`,
      { init: "// init", match: "// match", nomatch: "// nomatch", base: "// anchor: base", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def lcs(s, t):
    m, n = len(s), len(t)
    prev = [0] * (n + 1)                     # two rows only
    cur = [0] * (n + 1)
    for i in range(1, m + 1):
        cur[0] = 0
        for j in range(1, n + 1):
            if s[i - 1] == t[j - 1]:
                cur[j] = 1 + prev[j - 1]         # match (diagonal)
            else:
                cur[j] = max(prev[j], cur[j - 1])   # nomatch
        prev, cur = cur, prev[:]
    return prev[n]
# anchor: base
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
# init`,
      { init: "# init", match: "# match", nomatch: "# nomatch", base: "# anchor: base", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function lcs(s, t) {
  const m = s.length, n = t.length;
  let prev = new Array(n + 1).fill(0);      // two rows only
  let cur = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = 0;
    for (let j = 1; j <= n; j++)
      if (s[i - 1] === t[j - 1])
        cur[j] = 1 + prev[j - 1];           // match (diagonal)
      else
        cur[j] = Math.max(prev[j], cur[j - 1]);   // nomatch
    prev = cur.slice();
  }
  return prev[n];
}
// anchor: base
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// init`,
      { init: "// init", match: "// match", nomatch: "// nomatch", base: "// anchor: base", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
};

export const longestCommonSubsequence: ProblemServiceDef = {
  slug: "longest-common-subsequence",
  patternSlug: "dp-strings",
  inputDescriptor: [
    { key: "s", label: "STRING A", kind: "stringPair", min: 1, max: 7 },
    { key: "t", label: "STRING B", kind: "stringPair", min: 1, max: 7 },
  ],
  schema,
  defaultInput: { s: "abcde", t: "ace" },
  randomInput: () => ({
    s: randStr(3 + Math.floor(Math.random() * 4)),
    t: randStr(3 + Math.floor(Math.random() * 4)),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In)
    : mode === "memo" ? genMemo(input as In)
    : mode === "tabulation" ? genTab(input as In)
    : genSpace(input as In),
  codes,
};

function randStr(len: number): string {
  const alphabet = "abc";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
