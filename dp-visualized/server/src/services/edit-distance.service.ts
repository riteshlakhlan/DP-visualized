import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Edit Distance (Striver DP-33): minimum insertions/deletions/replacements
 * to convert word1 into word2.
 * dp[i][j] = edit distance between prefixes word1[0..i) and word2[0..j).
 */

const schema = z.object({
  s: z.string().regex(/^[a-z]{1,7}$/),
  t: z.string().regex(/^[a-z]{1,7}$/),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  const m = input.s.length, n = input.t.length;
  if (mode === "bruteforce" && Math.max(m, n) > 5)
    return "Pure recursion branches 3 ways per mismatch. Keep both strings <= 5 chars for Brute Force.";
  if (mode !== "bruteforce" && Math.max(m, n) > 7)
    return "Keep both strings <= 7 chars so the table stays readable.";
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
      b.push("base-case", [0, j], `word1 prefix empty → insert the remaining ${j} chars of word2.`, { callId, parentCallId, value: j, codeAnchor: "base" });
      return j;
    }
    if (j === 0) {
      b.push("base-case", [i, 0], `word2 prefix empty → delete the remaining ${i} chars of word1.`, { callId, parentCallId, value: i, codeAnchor: "base" });
      return i;
    }
    const dup = seen.has(`${i},${j}`);
    const match = s[i - 1] === t[j - 1];
    b.push("recurse-call", [i, j],
      dup ? `f(${i},${j}) called AGAIN — identical subproblem repeats.`
          : `f(${i},${j}) called: compare '${s[i - 1]}' vs '${t[j - 1]}' (${match ? "MATCH" : "no match"}).`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: match ? "match" : "recurse" });
    seen.add(`${i},${j}`);
    let v: number;
    let deps: number[][];
    if (match) {
      v = f(i - 1, j - 1, callId);
      deps = [[i - 1, j - 1]];
      b.push("recurse-return", [i, j], `'${s[i - 1]}' matches → free move diagonally: f(${i},${j}) = f(${i - 1},${j - 1}) = ${v}.`, {
        callId, parentCallId, value: v, deps, codeAnchor: "match",
      });
    } else {
      const del = f(i - 1, j, callId);   // delete from word1
      const ins = f(i, j - 1, callId);   // insert into word1
      const rep = f(i - 1, j - 1, callId); // replace
      v = 1 + Math.min(del, ins, rep);
      deps = [[i - 1, j], [i, j - 1], [i - 1, j - 1]];
      b.push("recurse-return", [i, j],
        `Mismatch → 1 + min(delete ${del}, insert ${ins}, replace ${rep}) = ${v}.`,
        { callId, parentCallId, value: v, deps, codeAnchor: "nomatch" });
    }
    return v;
  }

  const answer = f(s.length, t.length);
  return {
    steps: b.steps,
    meta: {
      mode: "bruteforce",
      answer,
      answerLabel: "minimum operations",
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
    if (i === 0) {
      b.push("base-case", [0, j], `Empty word1 prefix → ${j} inserts needed.`, { callId, parentCallId, value: j, codeAnchor: "base" });
      return j;
    }
    if (j === 0) {
      b.push("base-case", [i, 0], `Empty word2 prefix → ${i} deletes needed.`, { callId, parentCallId, value: i, codeAnchor: "base" });
      return i;
    }
    const kk = `${i},${j}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [i, j], `Memo hit! f(${i},${j}) = ${v} fetched instantly.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    const match = s[i - 1] === t[j - 1];
    let v: number;
    let deps: number[][];
    if (match) {
      v = f(i - 1, j - 1, callId);
      deps = [[i - 1, j - 1]];
    } else {
      const del = f(i - 1, j, callId);
      const ins = f(i, j - 1, callId);
      const rep = f(i - 1, j - 1, callId);
      v = 1 + Math.min(del, ins, rep);
      deps = [[i - 1, j], [i, j - 1], [i - 1, j - 1]];
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
      answerLabel: "minimum operations",
      tableShape: { rows: s.length + 1, cols: t.length + 1 },
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
    b.push("base-case", [0, j], `dp[0][${j}] = ${j}: building "${t.slice(0, j)}" from "" needs ${j} inserts.`, { value: j, codeAnchor: "base" });
  }
  for (let i = 1; i <= m; i++) {
    dp[i][0] = i;
    b.push("base-case", [i, 0], `dp[${i}][0] = ${i}: erasing "${s.slice(0, i)}" needs ${i} deletes.`, { value: i, codeAnchor: "base" });
  }

  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      let v: number;
      let deps: number[][];
      if (s[i - 1] === t[j - 1]) {
        v = dp[i - 1][j - 1];
        deps = [[i - 1, j - 1]];
        b.push("table-write", [i, j], `'${s[i - 1]}' == '${t[j - 1]}' → inherit diagonal: dp[${i}][${j}] = dp[${i - 1}][${j - 1}] = ${v}.`, {
          value: v, deps, codeAnchor: "match",
        });
      } else {
        v = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        deps = [[i - 1, j], [i, j - 1], [i - 1, j - 1]];
        b.push("table-write", [i, j],
          `'${s[i - 1]}' != '${t[j - 1]}' → 1 + min(delete ${dp[i - 1][j]}, insert ${dp[i][j - 1]}, replace ${dp[i - 1][j - 1]}) = ${v}.`,
          { value: v, deps, codeAnchor: "nomatch" });
      }
      dp[i][j] = v;
    }

  const answer = dp[m][n];
  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "minimum operations",
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
    b.push("base-case", [0, j], `prev[${j}] = ${j} — only ONE previous row is kept.`, { value: j, codeAnchor: "init" });

  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1).fill(0);
    cur[0] = i;
    b.push("table-write", [i, 0], `cur[0] = ${i} (delete ${i} chars).`, { value: i, deps: [], codeAnchor: "init" });
    for (let j = 1; j <= n; j++) {
      let v: number;
      if (s[i - 1] === t[j - 1]) {
        v = prev[j - 1];
        b.push("table-write", [i, j], `'${s[i - 1]}' == '${t[j - 1]}' → cur[${j}] = prev[${j - 1}] (diagonal) = ${v}.`, {
          value: v, deps: [[i - 1, j - 1]], codeAnchor: "match",
        });
      } else {
        v = 1 + Math.min(prev[j], cur[j - 1], prev[j - 1]);
        b.push("table-write", [i, j], `'${s[i - 1]}' != '${t[j - 1]}' → 1 + min(prev[${j}]=${prev[j]}, cur[${j - 1}]=${cur[j - 1]}, prev[${j - 1}]=${prev[j - 1]}) = ${v}.`, {
          value: v, deps: [[i - 1, j], [i, j - 1], [i - 1, j - 1]], codeAnchor: "nomatch",
        });
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
      answerLabel: "minimum operations",
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
        return f(i - 1, j - 1, s, t);            // match
    int del = f(i - 1, j, s, t);                 // recurse
    int ins = f(i, j - 1, s, t);
    int rep = f(i - 1, j - 1, s, t);
    return 1 + min({del, ins, rep});             // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// nomatch`,
      { base: "// base", recurse: "// recurse", nomatch: "// nomatch", match: "// match", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore" },
    ),
    java: withAnchors(
`static int f(int i, int j, String s, String t) {
    if (i == 0) return j;                         // base
    if (j == 0) return i;                         // base
    if (s.charAt(i - 1) == t.charAt(j - 1))
        return f(i - 1, j - 1, s, t);             // match
    int del = f(i - 1, j, s, t);                  // recurse
    int ins = f(i, j - 1, s, t);
    int rep = f(i - 1, j - 1, s, t);
    return 1 + Math.min(del, Math.min(ins, rep)); // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// nomatch`,
      { base: "// base", recurse: "// recurse", nomatch: "// nomatch", match: "// match", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore" },
    ),
    python: withAnchors(
`def f(i, j, s, t):
    if i == 0:                            # base
        return j
    if j == 0:                            # base
        return i
    if s[i - 1] == t[j - 1]:
        return f(i - 1, j - 1, s, t)      # match
    dele = f(i - 1, j, s, t)              # recurse
    ins = f(i, j - 1, s, t)
    rep = f(i - 1, j - 1, s, t)
    return 1 + min(dele, ins, rep)        # combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# nomatch`,
      { base: "# base", recurse: "# recurse", nomatch: "# nomatch", match: "# match", combine: "# combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore" },
    ),
    js: withAnchors(
`function f(i, j, s, t) {
  if (i === 0) return j;                     // base
  if (j === 0) return i;                     // base
  if (s[i - 1] === t[j - 1])
    return f(i - 1, j - 1, s, t);            // match
  const del = f(i - 1, j, s, t);             // recurse
  const ins = f(i, j - 1, s, t);
  const rep = f(i - 1, j - 1, s, t);
  return 1 + Math.min(del, ins, rep);        // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// nomatch`,
      { base: "// base", recurse: "// recurse", nomatch: "// nomatch", match: "// match", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int i, int j, string& s, string& t, vector<vector<int>>& memo) {
    if (i == 0) return j;                          // base
    if (j == 0) return i;                          // base
    if (memo[i][j] != -1) return memo[i][j];       // memo check
    if (s[i - 1] == t[j - 1])
        memo[i][j] = f(i - 1, j - 1, s, t, memo);  // match
    else {
        int del = f(i - 1, j, s, t, memo);         // recurse
        int ins = f(i, j - 1, s, t, memo);
        int rep = f(i - 1, j - 1, s, t, memo);
        memo[i][j] = 1 + min({del, ins, rep});
    }
    return memo[i][j];                             // memo store
}
// anchor: init
// anchor: nomatch
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", match: "// match", memoCheck: "// memoCheck", memoStore: "// memoStore", init: "// anchor: init", nomatch: "// anchor: nomatch" },
    ),
    java: withAnchors(
`static int f(int i, int j, String s, String t, int[][] memo) {
    if (i == 0) return j;                           // base
    if (j == 0) return i;                           // base
    if (memo[i][j] != -1) return memo[i][j];        // memo check
    if (s.charAt(i - 1) == t.charAt(j - 1))
        memo[i][j] = f(i - 1, j - 1, s, t, memo);   // match
    else {
        int del = f(i - 1, j, s, t, memo);          // recurse
        int ins = f(i, j - 1, s, t, memo);
        int rep = f(i - 1, j - 1, s, t, memo);
        memo[i][j] = 1 + Math.min(del, Math.min(ins, rep));
    }
    return memo[i][j];                              // memo store
}
// anchor: init
// anchor: nomatch
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", match: "// match", memoCheck: "// memoCheck", memoStore: "// memoStore", init: "// anchor: init", nomatch: "// anchor: nomatch" },
    ),
    python: withAnchors(
`def f(i, j, s, t, memo):
    if i == 0:                                # base
        return j
    if j == 0:                                # base
        return i
    if memo[i][j] != -1:                      # memo check
        return memo[i][j]
    if s[i - 1] == t[j - 1]:
        memo[i][j] = f(i - 1, j - 1, s, t, memo)   # match
    else:
        dele = f(i - 1, j, s, t, memo)         # recurse
        ins = f(i, j - 1, s, t, memo)
        rep = f(i - 1, j - 1, s, t, memo)
        memo[i][j] = 1 + min(dele, ins, rep)
    return memo[i][j]                          # memo store
# anchor: init
# anchor: nomatch
# memoCheck
# memoStore`,
      { base: "# base", recurse: "# recurse", match: "# match", memoCheck: "# memoCheck", memoStore: "# memoStore", init: "# anchor: init", nomatch: "# anchor: nomatch" },
    ),
    js: withAnchors(
`function f(i, j, s, t, memo) {
  if (i === 0) return j;                           // base
  if (j === 0) return i;                           // base
  if (memo[i][j] !== -1) return memo[i][j];        // memo check
  if (s[i - 1] === t[j - 1])
    memo[i][j] = f(i - 1, j - 1, s, t, memo);      // match
  else {
    const del = f(i - 1, j, s, t, memo);           // recurse
    const ins = f(i, j - 1, s, t, memo);
    const rep = f(i - 1, j - 1, s, t, memo);
    memo[i][j] = 1 + Math.min(del, ins, rep);
  }
  return memo[i][j];                               // memo store
}
// anchor: init
// anchor: nomatch
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", match: "// match", memoCheck: "// memoCheck", memoStore: "// memoStore", init: "// anchor: init", nomatch: "// anchor: nomatch" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int minDistance(string s, string t) {
    int m = s.size(), n = t.size();
    vector<vector<int>> dp(m + 1, vector<int>(n + 1));
    for (int j = 0; j <= n; ++j) dp[0][j] = j;     // base
    for (int i = 0; i <= m; ++i) dp[i][0] = i;     // base
    for (int i = 1; i <= m; ++i)
        for (int j = 1; j <= n; ++j) {
            if (s[i - 1] == t[j - 1])
                dp[i][j] = dp[i - 1][j - 1];           // match
            else
                dp[i][j] = 1 + min({dp[i - 1][j],      // delete
                                    dp[i][j - 1],      // insert
                                    dp[i - 1][j - 1]});// replace
        }
    return dp[m][n];
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// nomatch
// transition`,
      { base: "// base", match: "// match", nomatch: "// nomatch", transition: "// transition", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int minDistance(String s, String t) {
    int m = s.length(), n = t.length();
    int[][] dp = new int[m + 1][n + 1];
    for (int j = 0; j <= n; ++j) dp[0][j] = j;      // base
    for (int i = 0; i <= m; ++i) dp[i][0] = i;      // base
    for (int i = 1; i <= m; ++i)
        for (int j = 1; j <= n; ++j) {
            if (s.charAt(i - 1) == t.charAt(j - 1))
                dp[i][j] = dp[i - 1][j - 1];              // match
            else
                dp[i][j] = 1 + Math.min(dp[i - 1][j],     // delete
                              Math.min(dp[i][j - 1],      // insert
                                       dp[i - 1][j - 1])); // replace
        }
    return dp[m][n];
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// nomatch
// transition`,
      { base: "// base", match: "// match", nomatch: "// nomatch", transition: "// transition", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def min_distance(s, t):
    m, n = len(s), len(t)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for j in range(n + 1): dp[0][j] = j       # base
    for i in range(m + 1): dp[i][0] = i       # base
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if s[i - 1] == t[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]         # match
            else:
                dp[i][j] = 1 + min(dp[i - 1][j],    # delete
                                   dp[i][j - 1],    # insert
                                   dp[i - 1][j - 1]) # replace
    return dp[m][n]
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
# nomatch
# transition`,
      { base: "# base", match: "# match", nomatch: "# nomatch", transition: "# transition", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function minDistance(s, t) {
  const m = s.length, n = t.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let j = 0; j <= n; j++) dp[0][j] = j;   // base
  for (let i = 0; i <= m; i++) dp[i][0] = i;   // base
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      if (s[i - 1] === t[j - 1])
        dp[i][j] = dp[i - 1][j - 1];               // match
      else
        dp[i][j] = 1 + Math.min(dp[i - 1][j],      // delete
                    dp[i][j - 1],                   // insert
                    dp[i - 1][j - 1]);              // replace
    }
  return dp[m][n];
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// nomatch
// transition`,
      { base: "// base", match: "// match", nomatch: "// nomatch", transition: "// transition", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
  spaceOptimized: {
    cpp: withAnchors(
`int minDistance(string s, string t) {
    int m = s.size(), n = t.size();
    vector<int> prev(n + 1), cur(n + 1);
    iota(prev.begin(), prev.end(), 0);              // init: row 0
    for (int i = 1; i <= m; ++i) {
        cur[0] = i;                                 // init col
        for (int j = 1; j <= n; ++j) {
            if (s[i - 1] == t[j - 1])
                cur[j] = prev[j - 1];               // match
            else
                cur[j] = 1 + min({prev[j], cur[j - 1], prev[j - 1]}); // transition
        }
        prev = cur;
    }
    return prev[n];
}
// anchor: base
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// nomatch`,
      { init: "// init", match: "// match", nomatch: "// nomatch", transition: "// transition", base: "// anchor: base", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int minDistance(String s, String t) {
    int m = s.length(), n = t.length();
    int[] prev = new int[n + 1], cur = new int[n + 1];
    for (int j = 0; j <= n; ++j) prev[j] = j;       // init: row 0
    for (int i = 1; i <= m; ++i) {
        cur[0] = i;                                 // init col
        for (int j = 1; j <= n; ++j) {
            if (s.charAt(i - 1) == t.charAt(j - 1))
                cur[j] = prev[j - 1];               // match
            else
                cur[j] = 1 + Math.min(prev[j], Math.min(cur[j - 1], prev[j - 1])); // transition
        }
        prev = cur;
    }
    return prev[n];
}
// anchor: base
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// nomatch`,
      { init: "// init", match: "// match", nomatch: "// nomatch", transition: "// transition", base: "// anchor: base", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def min_distance(s, t):
    m, n = len(s), len(t)
    prev = list(range(n + 1))                   # init: row 0
    for i in range(1, m + 1):
        cur = [0] * (n + 1)
        cur[0] = i                              # init col
        for j in range(1, n + 1):
            if s[i - 1] == t[j - 1]:
                cur[j] = prev[j - 1]            # match
            else:
                cur[j] = 1 + min(prev[j], cur[j - 1], prev[j - 1])  # transition
        prev = cur
    return prev[n]
# anchor: base
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
# nomatch`,
      { init: "# init", match: "# match", nomatch: "# nomatch", transition: "# transition", base: "# anchor: base", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function minDistance(s, t) {
  const m = s.length, n = t.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j); // init: row 0
  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1).fill(0);
    cur[0] = i;                                  // init col
    for (let j = 1; j <= n; j++) {
      if (s[i - 1] === t[j - 1])
        cur[j] = prev[j - 1];                    // match
      else
        cur[j] = 1 + Math.min(prev[j], cur[j - 1], prev[j - 1]); // transition
    }
    prev = cur;
  }
  return prev[n];
}
// anchor: base
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// nomatch`,
      { init: "// init", match: "// match", nomatch: "// nomatch", transition: "// transition", base: "// anchor: base", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
};

export const editDistance: ProblemServiceDef = {
  slug: "edit-distance",
  patternSlug: "dp-strings",
  inputDescriptor: [
    { key: "s", label: "STRING A", kind: "stringPair", min: 1, max: 6 },
    { key: "t", label: "STRING B", kind: "stringPair", min: 1, max: 6 },
  ],
  schema,
  defaultInput: { s: "horse", t: "ros" },
  randomInput: () => ({
    s: randStr(3 + Math.floor(Math.random() * 4)),
    t: randStr(3 + Math.floor(Math.random() * 4)),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : mode === "tabulation" ? genTab(input as In) : genSpace(input as In),
  codes,
};

function randStr(len: number): string {
  const alphabet = "abc";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
