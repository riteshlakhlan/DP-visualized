import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Distinct Subsequences (Striver DP-32): count how many times s appears as a
 * subsequence of t (LeetCode 115 orientation: s = small pattern, t = big text).
 * dp[i][j] = ways to build s[0..i) from t[0..j).
 *   s[i-1] == t[j-1] → dp[i-1][j-1] + dp[i][j-1]   (use it, or skip it)
 *   else             → dp[i][j-1]
 * Bases: dp[0][j] = 1 (empty pattern), dp[i][0>0] = 0.
 */

const schema = z.object({
  s: z.string().regex(/^[a-z]{1,6}$/),
  t: z.string().regex(/^[a-z]{1,7}$/),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && Math.pow(2, input.t.length) > 128)
    return "Brute force enumerates subsequence selections of t. Keep t <= 7 chars for Brute Force.";
  return null;
}

const AXIS = (s: string, t: string) => ({
  rowsTitle: `pattern "${s}"`,
  colsTitle: `text "${t}"`,
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
      b.push("base-case", [0, j], "Pattern exhausted → one valid embedding found.", { callId, parentCallId, value: 1, codeAnchor: "base" });
      return 1;
    }
    if (j === 0) {
      b.push("base-case", [i, 0], "Text exhausted with pattern left → dead end.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    const dup = seen.has(`${i},${j}`);
    const match = s[i - 1] === t[j - 1];
    b.push("recurse-call", [i, j],
      dup ? `f(${i},${j}) called AGAIN — the same (pattern, text) prefixes recur.` : `f(${i},${j}) called: compare '${s[i - 1]}' vs '${t[j - 1]}' (${match ? "MATCH" : "no match"}).`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: match ? "match" : "recurse" });
    seen.add(`${i},${j}`);
    const skip = f(i, j - 1, callId);
    let use = 0;
    if (match) use = f(i - 1, j - 1, callId);
    const v = skip + use;
    const deps: number[][] = [[i, j - 1]];
    if (match) deps.push([i - 1, j - 1]);
    b.push("recurse-return", [i, j],
      match
        ? `'${t[j - 1]}' matches → skip it (${skip}) + consume both (${use}) = ${v}.`
        : `No match → must skip '${t[j - 1]}': ${v}.`,
      { callId, parentCallId, value: v, deps, codeAnchor: match ? "match" : "nomatch" });
    return v;
  }

  const answer = f(s.length, t.length);
  return {
    steps: b.steps,
    meta: { mode: "bruteforce", answer, answerLabel: `embeddings of "${s}"`, tableShape: null, axisLabels: null, valueFormat: "int", stats: { steps: b.count, calls } },
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
      b.push("base-case", [0, j], "Empty pattern → exactly 1 embedding.", { callId, parentCallId, value: 1, codeAnchor: "base" });
      return 1;
    }
    if (j === 0) {
      b.push("base-case", [i, 0], "Text gone but pattern remains → 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
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
    const skip = f(i, j - 1, callId);
    const use = match ? f(i - 1, j - 1, callId) : 0;
    const v = skip + use;
    memo.set(kk, v);
    const deps: number[][] = [[i, j - 1]];
    if (match) deps.push([i - 1, j - 1]);
    b.push("recurse-return", [i, j], `f(${i},${j}) = ${skip} + ${use} = ${v}, stored in memo.`, { callId, parentCallId, value: v, deps, codeAnchor: "memoStore" });
    return v;
  }

  const answer = f(m, n);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: `embeddings of "${s}"`,
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
    dp[0][j] = 1;
    b.push("base-case", [0, j], "dp[0][j] = 1 — empty pattern embeds once.", { value: 1, codeAnchor: "base" });
  }
  for (let i = 1; i <= m; i++) {
    dp[i][0] = 0;
    b.push("base-case", [i, 0], `Pattern prefix needs text → dp[${i}][0] = 0.`, { value: 0, codeAnchor: "base" });
  }

  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      let v: number;
      let deps: number[][];
      if (s[i - 1] === t[j - 1]) {
        v = dp[i][j - 1] + dp[i - 1][j - 1];
        deps = [[i, j - 1], [i - 1, j - 1]];
        b.push("table-write", [i, j],
          `'${s[i - 1]}' == '${t[j - 1]}' → skip (${dp[i][j - 1]}) + consume both (${dp[i - 1][j - 1]}) = ${v}.`,
          { value: v, deps, codeAnchor: "match" });
      } else {
        v = dp[i][j - 1];
        deps = [[i, j - 1]];
        b.push("table-write", [i, j], `'${s[i - 1]}' != '${t[j - 1]}' → carry left ${v}.`, { value: v, deps, codeAnchor: "nomatch" });
      }
      dp[i][j] = v;
    }

  const answer = dp[m][n];
  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: `embeddings of "${s}"`,
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

  // 1D rolling over text columns; process pattern rows top-down, update right-to-left
  let prev = new Array(n + 1).fill(1); // row 0: all ones
  for (let j = 0; j <= n; j++)
    b.push("base-case", [0, j], "Row 0 (empty pattern) = all ones.", { value: 1, codeAnchor: "init" });

  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1).fill(0);
    for (let j = 1; j <= n; j++) {
      let v: number;
      let deps: number[][];
      if (s[i - 1] === t[j - 1]) {
        v = cur[j - 1] + prev[j - 1];
        deps = [[i, j - 1], [i - 1, j - 1]];
        b.push("table-write", [i, j], `Match '${t[j - 1]}' → cur[${j}] = cur[${j - 1}] + prev[${j - 1}] = ${v}.`, {
          value: v, deps, codeAnchor: "match",
        });
      } else {
        v = cur[j - 1];
        deps = [[i, j - 1]];
        b.push("table-write", [i, j], `No match → cur[${j}] = cur[${j - 1}] = ${v}.`, { value: v, deps, codeAnchor: "nomatch" });
      }
      cur[j] = v;
    }
    prev = cur;
  }
  const answer = prev[n];
  b.push("table-read", [m, n], `Answer survives in the last row: ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer,
      answerLabel: `embeddings of "${s}"`,
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
    if (i == 0) return 1;                        // base
    if (j == 0) return 0;                        // base
    int skip = f(i, j - 1, s, t);                // recurse
    int use = 0;                                 // nomatch default
    if (s[i - 1] == t[j - 1])                    // match
        use = f(i - 1, j - 1, s, t);
    return skip + use;                           // combine
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore`,
      { base: "// base", recurse: "// recurse", match: "// match", nomatch: "// nomatch", combine: "// combine", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore" },
    ),
    java: withAnchors(
`static int f(int i, int j, String s, String t) {
    if (i == 0) return 1;                         // base
    if (j == 0) return 0;                         // base
    int skip = f(i, j - 1, s, t);                 // recurse
    int use = 0;                                  // nomatch default
    if (s.charAt(i - 1) == t.charAt(j - 1))       // match
        use = f(i - 1, j - 1, s, t);
    return skip + use;                            // combine
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore`,
      { base: "// base", recurse: "// recurse", match: "// match", nomatch: "// nomatch", combine: "// combine", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore" },
    ),
    python: withAnchors(
`def f(i, j, s, t):
    if i == 0:                              # base
        return 1
    if j == 0:                              # base
        return 0
    skip = f(i, j - 1, s, t)                # recurse
    # nomatch default unless match
    use = f(i - 1, j - 1, s, t) if s[i - 1] == t[j - 1] else 0  # match
    return skip + use                       # combine
# anchor: driver
# anchor: init
# anchor: memoCheck
# anchor: memoStore`,
      { base: "# base", recurse: "# recurse", match: "# match", nomatch: "# nomatch", combine: "# combine", driver: "# anchor: driver", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore" },
    ),
    js: withAnchors(
`function f(i, j, s, t) {
  if (i === 0) return 1;                    // base
  if (j === 0) return 0;                    // base
  const skip = f(i, j - 1, s, t);           // recurse
  // nomatch default unless match
  const use = s[i - 1] === t[j - 1] ? f(i - 1, j - 1, s, t) : 0; // match
  return skip + use;                        // combine
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore`,
      { base: "// base", recurse: "// recurse", match: "// match", nomatch: "// nomatch", combine: "// combine", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int i, int j, string& s, string& t, vector<vector<int>>& memo) {
    if (i == 0) return 1;                             // base
    if (j == 0) return 0;                             // base
    if (memo[i][j] != -1) return memo[i][j];          // memo check
    int skip = f(i, j - 1, s, t, memo);
    int use = s[i - 1] == t[j - 1] ? f(i - 1, j - 1, s, t, memo) : 0; // recurse
    return memo[i][j] = skip + use;                   // memo store
}
// anchor: driver
// anchor: init
// anchor: match
// anchor: nomatch
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// anchor: driver", init: "// anchor: init", match: "// anchor: match", nomatch: "// anchor: nomatch" },
    ),
    java: withAnchors(
`static int f(int i, int j, String s, String t, int[][] memo) {
    if (i == 0) return 1;                              // base
    if (j == 0) return 0;                              // base
    if (memo[i][j] != -1) return memo[i][j];           // memo check
    int skip = f(i, j - 1, s, t, memo);
    int use = s.charAt(i - 1) == t.charAt(j - 1)
            ? f(i - 1, j - 1, s, t, memo) : 0;         // recurse
    return memo[i][j] = skip + use;                    // memo store
}
// anchor: driver
// anchor: init
// anchor: match
// anchor: nomatch
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// anchor: driver", init: "// anchor: init", match: "// anchor: match", nomatch: "// anchor: nomatch" },
    ),
    python: withAnchors(
`def f(i, j, s, t, memo):
    if i == 0:                                   # base
        return 1
    if j == 0:                                   # base
        return 0
    if memo[i][j] != -1:                         # memo check
        return memo[i][j]
    skip = f(i, j - 1, s, t, memo)
    use = f(i - 1, j - 1, s, t, memo) if s[i - 1] == t[j - 1] else 0  # recurse
    memo[i][j] = skip + use
    return memo[i][j]                            # memo store
# anchor: driver
# anchor: init
# anchor: match
# anchor: nomatch
# memoCheck
# memoStore`,
      { base: "# base", recurse: "# recurse", memoCheck: "# memoCheck", memoStore: "# memoStore", driver: "# anchor: driver", init: "# anchor: init", match: "# anchor: match", nomatch: "# anchor: nomatch" },
    ),
    js: withAnchors(
`function f(i, j, s, t, memo) {
  if (i === 0) return 1;                             // base
  if (j === 0) return 0;                             // base
  if (memo[i][j] !== -1) return memo[i][j];          // memo check
  const skip = f(i, j - 1, s, t, memo);
  const use = s[i - 1] === t[j - 1]
            ? f(i - 1, j - 1, s, t, memo) : 0;       // recurse
  memo[i][j] = skip + use;
  return memo[i][j];                                 // memo store
}
// anchor: driver
// anchor: init
// anchor: match
// anchor: nomatch
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// anchor: driver", init: "// anchor: init", match: "// anchor: match", nomatch: "// anchor: nomatch" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int numDistinct(string s, string t) {
    int m = s.size(), n = t.size();
    vector<vector<unsigned long long>> dp(m + 1, vector<unsigned long long>(n + 1, 0));
    for (int j = 0; j <= n; ++j) dp[0][j] = 1;      // base
    for (int i = 1; i <= m; ++i)
        for (int j = 1; j <= n; ++j) {
            dp[i][j] = dp[i][j - 1];                     // transition
            if (s[i - 1] == t[j - 1])
                dp[i][j] += dp[i - 1][j - 1];            // match
        }
    return (int)dp[m][n];
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// nomatch`,
      { base: "// base", nomatch: "// nomatch", transition: "// transition", match: "// match", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int numDistinct(String s, String t) {
    int m = s.length(), n = t.length();
    long[][] dp = new long[m + 1][n + 1];
    for (int j = 0; j <= n; ++j) dp[0][j] = 1;       // base
    for (int i = 1; i <= m; ++i)
        for (int j = 1; j <= n; ++j) {
            dp[i][j] = dp[i][j - 1];                     // transition
            if (s.charAt(i - 1) == t.charAt(j - 1))
                dp[i][j] += dp[i - 1][j - 1];            // match
        }
    return (int) dp[m][n];
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// nomatch`,
      { base: "// base", nomatch: "// nomatch", transition: "// transition", match: "// match", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def num_distinct(s, t):
    m, n = len(s), len(t)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for j in range(n + 1): dp[0][j] = 1         # base
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            dp[i][j] = dp[i][j - 1]             # transition
            if s[i - 1] == t[j - 1]:
                dp[i][j] += dp[i - 1][j - 1]    # match
    return dp[m][n]
# anchor: driver
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
# nomatch`,
      { base: "# base", nomatch: "# nomatch", transition: "# transition", match: "# match", driver: "# anchor: driver", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function numDistinct(s, t) {
  const m = s.length, n = t.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let j = 0; j <= n; j++) dp[0][j] = 1;   // base
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      dp[i][j] = dp[i][j - 1];                     // transition
      if (s[i - 1] === t[j - 1])
        dp[i][j] += dp[i - 1][j - 1];              // match
    }
  return dp[m][n];
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// nomatch`,
      { base: "// base", nomatch: "// nomatch", transition: "// transition", match: "// match", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
  spaceOptimized: {
    cpp: withAnchors(
`int numDistinct(string s, string t) {
    int n = t.size();
    vector<unsigned long long> prev(n + 1, 0), cur(n + 1, 0);
    prev[0] = cur[0] = 1;                        // init
    for (int i = 1; i <= (int)s.size(); ++i) {
        cur[0] = 1;
        for (int j = 1; j <= n; ++j) {
            cur[j] = cur[j - 1];                          // transition
            if (s[i - 1] == t[j - 1])
                cur[j] += prev[j - 1];                    // match
        }
        prev = cur;
    }
    return (int)prev[n];
}
// anchor: base
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// nomatch
// driver`,
      { init: "// init", nomatch: "// nomatch", transition: "// transition", match: "// match", driver: "// driver", base: "// anchor: base", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int numDistinct(String s, String t) {
    int n = t.length();
    long[] prev = new long[n + 1], cur = new long[n + 1];
    prev[0] = cur[0] = 1;                         // init
    for (int i = 1; i <= s.length(); ++i) {
        cur[0] = 1;
        for (int j = 1; j <= n; ++j) {
            cur[j] = cur[j - 1];                          // transition
            if (s.charAt(i - 1) == t.charAt(j - 1))
                cur[j] += prev[j - 1];                    // match
        }
        prev = cur;
    }
    return (int) prev[n];
}
// anchor: base
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// nomatch
// driver`,
      { init: "// init", nomatch: "// nomatch", transition: "// transition", match: "// match", driver: "// driver", base: "// anchor: base", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def num_distinct(s, t):
    n = len(t)
    prev = [0] * (n + 1); cur = [0] * (n + 1)
    prev[0] = cur[0] = 1                        # init
    for ch in s:
        cur[0] = 1
        for j in range(1, n + 1):
            cur[j] = cur[j - 1]                 # transition
            if ch == t[j - 1]:
                cur[j] += prev[j - 1]           # match
        prev = cur
    return prev[n]
# anchor: base
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
# nomatch
# driver`,
      { init: "# init", nomatch: "# nomatch", transition: "# transition", match: "# match", driver: "# driver", base: "# anchor: base", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function numDistinct(s, t) {
  const n = t.length;
  let prev = new Array(n + 1).fill(0), cur = new Array(n + 1).fill(0);
  prev[0] = cur[0] = 1;                      // init
  for (const ch of s) {
    cur[0] = 1;
    for (let j = 1; j <= n; j++) {
      cur[j] = cur[j - 1];                       // transition
      if (ch === t[j - 1])
        cur[j] += prev[j - 1];                   // match
    }
    prev = cur;
  }
  return prev[n];
}
// anchor: base
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// nomatch
// driver`,
      { init: "// init", nomatch: "// nomatch", transition: "// transition", match: "// match", driver: "// driver", base: "// anchor: base", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
};

export const distinctSubsequences: ProblemServiceDef = {
  slug: "distinct-subsequences",
  patternSlug: "dp-strings",
  inputDescriptor: [
    { key: "s", label: "PATTERN S", kind: "stringPair", min: 1, max: 4 },
    { key: "t", label: "TEXT T", kind: "stringPair", min: 1, max: 6 },
  ],
  schema,
  defaultInput: { s: "rabbit", t: "rabbbit" }, // LeetCode 115 classic → 3
  randomInput: () => ({
    s: randStr(2 + Math.floor(Math.random() * 2)),
    t: randStr(4 + Math.floor(Math.random() * 3)),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : mode === "tabulation" ? genTab(input as In) : genSpace(input as In),
  codes,
};

function randStr(len: number): string {
  const out = [];
  for (let i = 0; i < len; i++) out.push("ab"[Math.floor(Math.random() * 2)]);
  return out.join("");
}
