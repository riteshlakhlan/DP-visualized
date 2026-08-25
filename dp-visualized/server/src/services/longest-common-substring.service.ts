import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Longest Common Substring (Striver DP-28): longest CONTIGUOUS run that
 * appears in both strings.
 * dp[i][j] = length of the common suffix of s[0..i) and t[0..j).
 * Answer = max over all cells (mismatches reset to 0 — the key difference
 * from LCS).
 */

const schema = z.object({
  s: z.string().regex(/^[a-z]{1,7}$/),
  t: z.string().regex(/^[a-z]{1,7}$/),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  const m = input.s.length, n = input.t.length;
  if (mode === "bruteforce" && Math.max(m, n) > 5)
    return "Pure recursion compares every substring pair. Keep both strings <= 5 chars for Brute Force.";
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

  /** f(i,j) = length of common SUFFIX ending exactly at s[i-1], t[j-1]. */
  function f(i: number, j: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i === 0 || j === 0) {
      b.push("base-case", [i, j], "Empty prefix → no common suffix, length 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    const dup = seen.has(`${i},${j}`);
    const match = s[i - 1] === t[j - 1];
    b.push("recurse-call", [i, j],
      dup ? `f(${i},${j}) called AGAIN.`
          : `f(${i},${j}) called: does the common run extend through '${s[i - 1]}' vs '${t[j - 1]}'?`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: match ? "match" : "recurse" });
    seen.add(`${i},${j}`);
    let v: number;
    if (match) {
      v = 1 + f(i - 1, j - 1, callId);
      b.push("recurse-return", [i, j], `'${s[i - 1]}' matches → run extends: f(${i},${j}) = 1 + f(${i - 1},${j - 1}) = ${v}.`, {
        callId, parentCallId, value: v, deps: [[i - 1, j - 1]], codeAnchor: "match",
      });
    } else {
      v = 0;
      // NOTE: unlike LCS we do NOT recurse on (i-1,j)/(i,j-1) here — a mismatch
      // kills any run ENDING at this cell; other cells are explored separately below.
      b.push("recurse-return", [i, j], `'${s[i - 1]}' != '${t[j - 1]}' → no run ends here: f(${i},${j}) = 0.`, {
        callId, parentCallId, value: 0, deps: [], codeAnchor: "reset",
      });
    }
    return v;
  }

  let answer = 0;
  for (let i = 1; i <= s.length; i++)
    for (let j = 1; j <= t.length; j++)
      answer = Math.max(answer, f(i, j));
  b.push("base-case", [s.length, t.length], `Longest common substring length = max over all end positions = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "bruteforce",
      answer,
      answerLabel: "longest common substring length",
      tableShape: null,
      axisLabels: null,
      valueFormat: "int",
      stats: { steps: b.count, calls },
    },
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
    b.push("recurse-call", [i, j], `f(${i},${j}) called: common suffix ending at these prefixes.`,
      { callId, parentCallId, codeAnchor: "recurse" });
    if (i === 0 || j === 0) {
      b.push("base-case", [i, j], "Base case: empty prefix → 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    const kk = `${i},${j}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [i, j], `Memo hit! f(${i},${j}) = ${v} fetched instantly.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    let v: number;
    if (s[i - 1] === t[j - 1]) {
      v = 1 + f(i - 1, j - 1, callId);
      b.push("recurse-return", [i, j], `'${s[i - 1]}' matches → ${v}, stored in memo.`, {
        callId, parentCallId, value: v, deps: [[i - 1, j - 1]], codeAnchor: "memoStore",
      });
    } else {
      v = 0;
      b.push("recurse-return", [i, j], `'${s[i - 1]}' != '${t[j - 1]}' → run broken, 0 stored in memo.`, {
        callId, parentCallId, value: 0, deps: [], codeAnchor: "reset",
      });
    }
    memo.set(kk, v);
    return v;
  }

  let answer = 0;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      answer = Math.max(answer, f(i, j));
  b.push("base-case", [m, n], `Answer = best suffix length over all cells = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "longest common substring length",
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
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let j = 0; j <= n; j++) {
    b.push("base-case", [0, j], "Row 0 (empty prefix of s) → 0.", { value: 0, codeAnchor: "base" });
  }
  for (let i = 1; i <= m; i++) {
    b.push("base-case", [i, 0], "Column 0 (empty prefix of t) → 0.", { value: 0, codeAnchor: "base" });
  }

  let best = 0;
  let bi = 0, bj = 0;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      let v: number;
      if (s[i - 1] === t[j - 1]) {
        v = 1 + dp[i - 1][j - 1];
        b.push("table-write", [i, j], `'${s[i - 1]}' == '${t[j - 1]}' → extend diagonal run: dp[${i}][${j}] = 1 + dp[${i - 1}][${j - 1}] = ${v}.`, {
          value: v, deps: [[i - 1, j - 1]], codeAnchor: "match",
        });
      } else {
        v = 0;
        b.push("table-write", [i, j], `'${s[i - 1]}' != '${t[j - 1]}' → substring must be CONTIGUOUS: dp[${i}][${j}] resets to 0.`, {
          value: 0, deps: [], codeAnchor: "reset",
        });
      }
      dp[i][j] = v;
      if (v > best) {
        best = v;
        bi = i; bj = j;
        if (v > 0)
          b.push("table-read", [i, j], `New maximum run: ${v} (ending at '${s.slice(i - v, i)}' in s).`, { value: v, codeAnchor: "track" });
      }
    }

  b.push("table-read", [bi, bj],
    best > 0 ? `Answer: the longest common substring is "${s.slice(bi - best, bi)}" (length ${best}).`
             : "The strings share no common character.",
    { value: best, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer: best,
      answerLabel: "longest common substring length",
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

  let prev = new Array(n + 1).fill(0);
  for (let j = 0; j <= n; j++)
    b.push("base-case", [0, j], "prev row initialised to 0 — two 1D rows replace the grid.", { value: 0, codeAnchor: "init" });

  let best = 0;
  let bi = 0;
  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1).fill(0);
    for (let j = 1; j <= n; j++) {
      let v: number;
      if (s[i - 1] === t[j - 1]) {
        v = 1 + prev[j - 1];
        b.push("table-write", [i, j], `'${s[i - 1]}' == '${t[j - 1]}' → cur[${j}] = 1 + prev[${j - 1}] = ${v}.`, {
          value: v, deps: [[i - 1, j - 1]], codeAnchor: "match",
        });
      } else {
        v = 0;
        b.push("table-write", [i, j], `'${s[i - 1]}' != '${t[j - 1]}' → cur[${j}] = 0 (runs cannot cross a mismatch).`, {
          value: 0, deps: [], codeAnchor: "reset",
        });
      }
      cur[j] = v;
      if (v > best) {
        best = v;
        bi = i;
        if (v > 0)
          b.push("table-read", [i, j], `New maximum run: ${v}.`, { value: v, codeAnchor: "track" });
      }
    }
    prev = cur;
  }

  b.push("table-read", [bi, Math.min(Math.max(bi, 0), n)],
    best > 0 ? `Answer: "${s.slice(bi - best, bi)}" (length ${best}), tracked while sweeping rows.`
             : "The strings share no common character.",
    { value: best, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer: best,
      answerLabel: "longest common substring length",
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
    if (i == 0 || j == 0) return 0;          // base
    // recurse on the previous diagonal when chars agree
    if (s[i - 1] == t[j - 1])
        return 1 + f(i - 1, j - 1, s, t);    // match: run extends
    return 0;                                // reset: contiguous!
}
// driver: answer = max f(i, j) over every end position
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: track`,
      { base: "// base", recurse: "// recurse", match: "// match", reset: "// reset", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", track: "// anchor: track" },
    ),
    java: withAnchors(
`static int f(int i, int j, String s, String t) {
    if (i == 0 || j == 0) return 0;           // base
    // recurse on the previous diagonal when chars agree
    if (s.charAt(i - 1) == t.charAt(j - 1))
        return 1 + f(i - 1, j - 1, s, t);     // match: run extends
    return 0;                                 // reset: contiguous!
}
// driver: answer = max f(i, j) over every end position
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: track`,
      { base: "// base", recurse: "// recurse", match: "// match", reset: "// reset", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", track: "// anchor: track" },
    ),
    python: withAnchors(
`def f(i, j, s, t):
    if i == 0 or j == 0:               # base
        return 0
    # recurse on the previous diagonal when chars agree
    if s[i - 1] == t[j - 1]:
        return 1 + f(i - 1, j - 1, s, t)   # match
    return 0                           # reset: contiguous

# driver: answer = max f(i, j) over every end position
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: track`,
      { base: "# base", recurse: "# recurse", match: "# match", reset: "# reset", driver: "# driver", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", track: "# anchor: track" },
    ),
    js: withAnchors(
`function f(i, j, s, t) {
  if (i === 0 || j === 0) return 0;         // base
  // recurse on the previous diagonal when chars agree
  if (s[i - 1] === t[j - 1])
    return 1 + f(i - 1, j - 1, s, t);       // match: run extends
  return 0;                                 // reset: contiguous!
}
// driver: answer = max f(i, j) over every end position
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: track`,
      { base: "// base", recurse: "// recurse", match: "// match", reset: "// reset", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", track: "// anchor: track" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int i, int j, string& s, string& t, vector<vector<int>>& memo) {
    if (i == 0 || j == 0) return 0;              // base
    if (memo[i][j] != -1) return memo[i][j];     // memo check
    // recurse only along the diagonal
    if (s[i - 1] == t[j - 1])
        memo[i][j] = 1 + f(i - 1, j - 1, s, t, memo); // match
    else
        memo[i][j] = 0;                          // reset
    return memo[i][j];                           // memo store
}
// driver: answer = best suffix length over all cells
// anchor: init
// anchor: track
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", match: "// match", reset: "// reset", memoStore: "// memoStore", driver: "// driver", init: "// anchor: init", track: "// anchor: track" },
    ),
    java: withAnchors(
`static int f(int i, int j, String s, String t, int[][] memo) {
    if (i == 0 || j == 0) return 0;               // base
    if (memo[i][j] != -1) return memo[i][j];      // memo check
    // recurse only along the diagonal
    if (s.charAt(i - 1) == t.charAt(j - 1))
        memo[i][j] = 1 + f(i - 1, j - 1, s, t, memo); // match
    else
        memo[i][j] = 0;                           // reset
    return memo[i][j];                            // memo store
}
// driver: answer = best suffix length over all cells
// anchor: init
// anchor: track
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", match: "// match", reset: "// reset", memoStore: "// memoStore", driver: "// driver", init: "// anchor: init", track: "// anchor: track" },
    ),
    python: withAnchors(
`def f(i, j, s, t, memo):
    if i == 0 or j == 0:                    # base
        return 0
    if memo[i][j] != -1:                    # memo check
        return memo[i][j]
    # recurse only along the diagonal
    if s[i - 1] == t[j - 1]:
        memo[i][j] = 1 + f(i - 1, j - 1, s, t, memo)   # match
    else:
        memo[i][j] = 0                      # reset
    return memo[i][j]                       # memo store

# driver: answer = best suffix length over all cells
# anchor: init
# anchor: track
# memoCheck
# memoStore`,
      { base: "# base", recurse: "# recurse", memoCheck: "# memoCheck", match: "# match", reset: "# reset", memoStore: "# memoStore", driver: "# driver", init: "# anchor: init", track: "# anchor: track" },
    ),
    js: withAnchors(
`function f(i, j, s, t, memo) {
  if (i === 0 || j === 0) return 0;              // base
  if (memo[i][j] !== -1) return memo[i][j];      // memo check
  // recurse only along the diagonal
  if (s[i - 1] === t[j - 1])
    memo[i][j] = 1 + f(i - 1, j - 1, s, t, memo); // match
  else
    memo[i][j] = 0;                              // reset
  return memo[i][j];                             // memo store
}
// driver: answer = best suffix length over all cells
// anchor: init
// anchor: track
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", match: "// match", reset: "// reset", memoStore: "// memoStore", driver: "// driver", init: "// anchor: init", track: "// anchor: track" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int longestCommonSubstring(string& s, string& t) {
    int m = s.size(), n = t.size(), best = 0;
    vector<vector<int>> dp(m + 1, vector<int>(n + 1, 0));
    for (int j = 0; j <= n; ++j) dp[0][j] = 0;         // base
    for (int i = 1; i <= m; ++i)
        for (int j = 1; j <= n; ++j) {
            if (s[i - 1] == t[j - 1])
                dp[i][j] = 1 + dp[i - 1][j - 1];       // match
            else
                dp[i][j] = 0;                          // reset
            best = max(best, dp[i][j]);                // track
        }
    return best; // driver
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", match: "// match", reset: "// reset", track: "// track", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int longestCommonSubstring(String s, String t) {
    int m = s.length(), n = t.length(), best = 0;
    int[][] dp = new int[m + 1][n + 1];
    for (int j = 0; j <= n; ++j) dp[0][j] = 0;          // base
    for (int i = 1; i <= m; ++i)
        for (int j = 1; j <= n; ++j) {
            if (s.charAt(i - 1) == t.charAt(j - 1))
                dp[i][j] = 1 + dp[i - 1][j - 1];        // match
            else
                dp[i][j] = 0;                           // reset
            best = Math.max(best, dp[i][j]);            // track
        }
    return best; // driver
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", match: "// match", reset: "// reset", track: "// track", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def longest_common_substring(s, t):
    m, n = len(s), len(t)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    best = 0
    for j in range(n + 1): dp[0][j] = 0        # base
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if s[i - 1] == t[j - 1]:
                dp[i][j] = 1 + dp[i - 1][j - 1]   # match
            else:
                dp[i][j] = 0                      # reset
            best = max(best, dp[i][j])            # track
    return best# driver
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", match: "# match", reset: "# reset", track: "# track", driver: "# driver", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function longestCommonSubstring(s, t) {
  const m = s.length, n = t.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  let best = 0;
  for (let j = 0; j <= n; j++) dp[0][j] = 0;  // base
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      if (s[i - 1] === t[j - 1])
        dp[i][j] = 1 + dp[i - 1][j - 1];      // match
      else
        dp[i][j] = 0;                         // reset
      best = Math.max(best, dp[i][j]);        // track
    }
  return best; // driver
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", match: "// match", reset: "// reset", track: "// track", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
  spaceOptimized: {
    cpp: withAnchors(
`int longestCommonSubstring(string& s, string& t) {
    int m = s.size(), n = t.size(), best = 0;
    vector<int> prev(n + 1, 0);                     // init
    for (int i = 1; i <= m; ++i) {
        vector<int> cur(n + 1, 0);
        for (int j = 1; j <= n; ++j) {
            if (s[i - 1] == t[j - 1])
                cur[j] = 1 + prev[j - 1];           // match
            else
                cur[j] = 0;                         // reset
            best = max(best, cur[j]);               // track
        }
        prev = cur;
    }
    return best; // driver
}
// anchor: base
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", match: "// match", reset: "// reset", track: "// track", driver: "// driver", base: "// anchor: base", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int longestCommonSubstring(String s, String t) {
    int m = s.length(), n = t.length(), best = 0;
    int[] prev = new int[n + 1];                    // init
    for (int i = 1; i <= m; ++i) {
        int[] cur = new int[n + 1];
        for (int j = 1; j <= n; ++j) {
            if (s.charAt(i - 1) == t.charAt(j - 1))
                cur[j] = 1 + prev[j - 1];           // match
            else
                cur[j] = 0;                         // reset
            best = Math.max(best, cur[j]);          // track
        }
        prev = cur;
    }
    return best; // driver
}
// anchor: base
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", match: "// match", reset: "// reset", track: "// track", driver: "// driver", base: "// anchor: base", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def longest_common_substring(s, t):
    m, n = len(s), len(t)
    prev = [0] * (n + 1)                        # init
    best = 0
    for i in range(1, m + 1):
        cur = [0] * (n + 1)
        for j in range(1, n + 1):
            if s[i - 1] == t[j - 1]:
                cur[j] = 1 + prev[j - 1]        # match
            else:
                cur[j] = 0                      # reset
            best = max(best, cur[j])            # track
        prev = cur
    return best# driver
# anchor: base
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { init: "# init", match: "# match", reset: "# reset", track: "# track", driver: "# driver", base: "# anchor: base", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function longestCommonSubstring(s, t) {
  const m = s.length, n = t.length;
  let prev = new Array(n + 1).fill(0);       // init
  let best = 0;
  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1).fill(0);
    for (let j = 1; j <= n; j++) {
      if (s[i - 1] === t[j - 1])
        cur[j] = 1 + prev[j - 1];            // match
      else
        cur[j] = 0;                          // reset
      best = Math.max(best, cur[j]);         // track
    }
    prev = cur;
  }
  return best; // driver
}
// anchor: base
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", match: "// match", reset: "// reset", track: "// track", driver: "// driver", base: "// anchor: base", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
};

export const longestCommonSubstring: ProblemServiceDef = {
  slug: "longest-common-substring",
  patternSlug: "dp-strings",
  inputDescriptor: [
    { key: "s", label: "STRING A", kind: "stringPair", min: 1, max: 6 },
    { key: "t", label: "STRING B", kind: "stringPair", min: 1, max: 6 },
  ],
  schema,
  defaultInput: { s: "abcdgh", t: "acdghr" },
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
