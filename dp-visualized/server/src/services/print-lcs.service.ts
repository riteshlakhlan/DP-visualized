import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Print Longest Common Subsequence (Striver DP-26): fill the standard LCS
 * table, then WALK BACK from dp[m][n] to (0,0) reconstructing one LCS:
 *   match  → take s[i-1], move diagonal
 *   else   → follow the larger neighbour
 */

const schema = z.object({
  s: z.string().regex(/^[a-z]{1,7}$/),
  t: z.string().regex(/^[a-z]{1,7}$/),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  const m = input.s.length, n = input.t.length;
  if (mode === "bruteforce" && Math.max(m, n) > 4)
    return "Enumerating every subsequence pair is exponential. Keep both strings <= 4 chars for Brute Force.";
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

  /** best(i,j): {len, str} of the LCS of suffixes s[i..), t[j..). */
  function f(i: number, j: number, parentCallId?: number): { len: number; str: string } {
    const callId = b.allocCallId();
    calls++;
    if (i === s.length || j === t.length) {
      b.push("base-case", [i, j], "Empty suffix → LCS \"\".", { callId, parentCallId, value: 0 });
      return { len: 0, str: "" };
    }
    b.push("recurse-call", [i, j],
      `f(${i},${j}) called: compare '${s[i]}' vs '${t[j]}'.`,
      { callId, parentCallId, codeAnchor: s[i] === t[j] ? "match" : "recurse" });
    let res: { len: number; str: string };
    if (s[i] === t[j]) {
      const sub = f(i + 1, j + 1, callId);
      res = { len: 1 + sub.len, str: s[i] + sub.str };
      b.push("recurse-return", [i, j], `Match → '${s[i]}' + LCS(${i + 1},${j + 1}) = "${res.str}" (${res.len}).`, {
        callId, parentCallId, value: res.len, deps: [[i + 1, j + 1]], codeAnchor: "match",
      });
    } else {
      const a = f(i + 1, j, callId);
      const c = f(i, j + 1, callId);
      res = a.len >= c.len ? a : c;
      b.push("recurse-return", [i, j], `No match → better of skip-s (${a.len}) / skip-t (${c.len}) = "${res.str}".`, {
        callId, parentCallId, value: res.len, deps: [[i + 1, j], [i, j + 1]], codeAnchor: "nomatch",
      });
    }
    return res;
  }

  const res = f(0, 0);
  b.push("base-case", [Math.min(s.length - 1, 0), Math.min(t.length - 1, 0)], `LCS found: "${res.str || "(empty)"}".`, { value: res.len });

  return {
    steps: b.steps,
    meta: {
      mode: "bruteforce",
      answer: res.len,
      answerLabel: `LCS length`,
      tableShape: null,
      axisLabels: null,
      valueFormat: "int",
      derived: res.str ? `LCS = "${res.str}"` : undefined,
      stats: { steps: b.count, calls },
    },
  };
}

function fillAndWalk(input: In, mode: Extract<DPMode, "memo" | "tabulation">): GeneratedTrace {
  const { s, t } = input;
  const m = s.length, n = t.length;
  const b = new TraceBuilder();
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(-1));
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, j: number, parentCallId?: number): number {
    if (mode === "memo") {
      const callId = b.allocCallId();
      calls++;
      b.push("recurse-call", [i, j], `f(${i},${j}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
      if (i === 0 || j === 0) {
        b.push("base-case", [i, j], "Empty prefix → 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
        return 0;
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
        v = Math.max(f(i - 1, j, callId), f(i, j - 1, callId));
        deps = [[i - 1, j], [i, j - 1]];
      }
      memo.set(kk, v);
      b.push("recurse-return", [i, j], `f(${i},${j}) = ${v}, stored in memo.`, { callId, parentCallId, value: v, deps, codeAnchor: "memoStore" });
      return v;
    }
    // tabulation handled by caller before this would be invoked
    void i; void j; void parentCallId;
    throw new Error("unreachable");
  }

  if (mode === "memo") {
    f(m, n);
  } else {
    for (let j = 0; j <= n; j++) {
      dp[0][j] = 0;
      b.push("base-case", [0, j], "Row 0 → 0.", { value: 0, codeAnchor: "base" });
    }
    for (let i = 1; i <= m; i++) {
      dp[i][0] = 0;
      b.push("base-case", [i, 0], "Column 0 → 0.", { value: 0, codeAnchor: "base" });
    }
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++) {
        let v: number;
        let deps: number[][];
        if (s[i - 1] === t[j - 1]) {
          v = 1 + dp[i - 1][j - 1];
          deps = [[i - 1, j - 1]];
          b.push("table-write", [i, j], `'${s[i - 1]}' == '${t[j - 1]}' → dp[${i}][${j}] = 1 + dp[${i - 1}][${j - 1}] = ${v}.`, {
            value: v, deps, codeAnchor: "match",
          });
        } else {
          v = Math.max(dp[i - 1][j], dp[i][j - 1]);
          deps = [[i - 1, j], [i, j - 1]];
          b.push("table-write", [i, j], `'${s[i - 1]}' != '${t[j - 1]}' → max(dp[${i - 1}][${j}], dp[${i}][${j - 1}]) = ${v}.`, {
            value: v, deps, codeAnchor: "nomatch",
          });
        }
        dp[i][j] = v;
      }
  }

  /* -------- backtrace phase: rebuild one LCS from the filled table -------- */
  let i = m, j = n;
  const collected: string[] = [];
  while (i > 0 && j > 0) {
    if (s[i - 1] === t[j - 1]) {
      collected.unshift(s[i - 1]);
      b.push("table-read", [i, j],
        `${s[i - 1]} == ${t[j - 1]} → take '${s[i - 1]}' into the LCS, move diagonally. Built so far: "${collected.join("")}".`,
        { value: dp[i][j], deps: [[i - 1, j - 1]], codeAnchor: "walkMatch" });
      i--; j--;
    } else if ((mode === "memo" ? memo.get(`${i - 1},${j}`) ?? 0 : dp[i - 1][j]) >= (mode === "memo" ? memo.get(`${i},${j - 1}`) ?? 0 : dp[i][j - 1])) {
      b.push("table-read", [i, j], `No match → follow the larger neighbour upward (drop '${s[i - 1]}').`, { value: dp[i][j], deps: [[i - 1, j]], codeAnchor: "walkMove" });
      i--;
    } else {
      b.push("table-read", [i, j], `No match → follow the larger neighbour leftward (drop '${t[j - 1]}').`, { value: dp[i][j], deps: [[i, j - 1]], codeAnchor: "walkMove" });
      j--;
    }
  }

  const lcsStr = collected.join("");
  b.push("table-read", [0, 0], `Backtrace complete. One longest common subsequence is "${lcsStr || "(empty)"}".`, {
    value: mode === "memo" ? (memo.get(`${m},${n}`) ?? 0) : dp[m][n],
    codeAnchor: "driver",
  });

  const answer = mode === "memo" ? (memo.get(`${m},${n}`) ?? 0) : dp[m][n];
  const meta = {
    mode,
    answer,
    answerLabel: "LCS length",
    tableShape: { rows: m + 1, cols: n + 1 },
    axisLabels: AXIS(s, t),
    valueFormat: "int" as const,
    derived: lcsStr ? `LCS = "${lcsStr}"` : undefined,
    stats: mode === "memo"
      ? { steps: b.count, calls, memoHits: hits }
      : { steps: b.count, writes: (m + 1) * (n + 1) },
  };
  return { steps: b.steps, meta };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`pair<int, string> f(int i, int j, string& s, string& t) {
    if (i == s.size() || j == t.size())
        return {0, ""};                          // base
    if (s[i] == t[j]) {
        auto sub = f(i + 1, j + 1, s, t);        // match
        return {1 + sub.first, s[i] + sub.second};
    }
    auto a = f(i + 1, j, s, t);                  // recurse
    auto c = f(i, j + 1, s, t);
    return a.first >= c.first ? a : c;           // nomatch
}
// anchor: driver
// anchor: memoCheck
// anchor: memoStore
// anchor: walkMatch
// anchor: walkMove`,
      { base: "// base", match: "// match", recurse: "// recurse", nomatch: "// nomatch", driver: "// anchor: driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", walkMatch: "// anchor: walkMatch", walkMove: "// anchor: walkMove" },
    ),
    java: withAnchors(
`// returns int[]{length, lcsString}
static Object[] f(int i, int j, String s, String t) {
    if (i == s.length() || j == t.length())
        return new Object[]{0, ""};               // base
    if (s.charAt(i) == t.charAt(j)) {
        Object[] sub = f(i + 1, j + 1, s, t);     // match
        return new Object[]{1 + (int) sub[0], s.charAt(i) + (String) sub[1]};
    }
    Object[] a = f(i + 1, j, s, t);               // recurse
    Object[] c = f(i, j + 1, s, t);
    return (int) a[0] >= (int) c[0] ? a : c;      // nomatch
}
// anchor: driver
// anchor: memoCheck
// anchor: memoStore
// anchor: walkMatch
// anchor: walkMove`,
      { base: "// base", match: "// match", recurse: "// recurse", nomatch: "// nomatch", driver: "// anchor: driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", walkMatch: "// anchor: walkMatch", walkMove: "// anchor: walkMove" },
    ),
    python: withAnchors(
`def f(i, j, s, t):
    if i == len(s) or j == len(t):          # base
        return 0, ""
    if s[i] == t[j]:                        # match
        ln, st = f(i + 1, j + 1, s, t)
        return 1 + ln, s[i] + st
    down = f(i + 1, j, s, t)                # recurse
    right = f(i, j + 1, s, t)
    return down if down[0] >= right[0] else right   # nomatch
# anchor: driver
# anchor: memoCheck
# anchor: memoStore
# anchor: walkMatch
# anchor: walkMove`,
      { base: "# base", match: "# match", recurse: "# recurse", nomatch: "# nomatch", driver: "# anchor: driver", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", walkMatch: "# anchor: walkMatch", walkMove: "# anchor: walkMove" },
    ),
    js: withAnchors(
`function f(i, j, s, t) {
  if (i === s.length || j === t.length)
    return { len: 0, str: "" };              // base
  if (s[i] === t[j]) {
    const sub = f(i + 1, j + 1, s, t);       // match
    return { len: 1 + sub.len, str: s[i] + sub.str };
  }
  const a = f(i + 1, j, s, t);               // recurse
  const c = f(i, j + 1, s, t);
  return a.len >= c.len ? a : c;             // nomatch
}
// anchor: driver
// anchor: memoCheck
// anchor: memoStore
// anchor: walkMatch
// anchor: walkMove`,
      { base: "// base", match: "// match", recurse: "// recurse", nomatch: "// nomatch", driver: "// anchor: driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", walkMatch: "// anchor: walkMatch", walkMove: "// anchor: walkMove" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int i, int j, string& s, string& t, vector<vector<int>>& memo) {
    if (i == 0 || j == 0) return 0;               // base
    if (memo[i][j] != -1) return memo[i][j];      // memo check
    if (s[i - 1] == t[j - 1])
        memo[i][j] = 1 + f(i - 1, j - 1, s, t, memo);       // match
    else
        memo[i][j] = max(f(i - 1, j, s, t, memo),           // recurse
                         f(i, j - 1, s, t, memo));
    return memo[i][j];                            // memo store
}
// then WALK BACK (driver):                       // walkMatch
//   match -> take char, go diagonal                 // walkMove
//   else follow the larger neighbour
// anchor: nomatch
// memoCheck
// memoStore
// driver`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", match: "// match", driver: "// driver", walkMatch: "// walkMatch", walkMove: "// walkMove", nomatch: "// anchor: nomatch" },
    ),
    java: withAnchors(
`static int f(int i, int j, String s, String t, int[][] memo) {
    if (i == 0 || j == 0) return 0;                // base
    if (memo[i][j] != -1) return memo[i][j];       // memo check
    if (s.charAt(i - 1) == t.charAt(j - 1))
        memo[i][j] = 1 + f(i - 1, j - 1, s, t, memo);       // match
    else
        memo[i][j] = Math.max(f(i - 1, j, s, t, memo),      // recurse
                              f(i, j - 1, s, t, memo));
    return memo[i][j];                             // memo store
}
// WALK BACK (driver): match -> take & diagonal; else larger neighbour // walkMove
// anchor: nomatch
// memoCheck
// memoStore
// walkMatch
// anchor: driver`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", match: "// match", walkMatch: "// walkMatch", walkMove: "// walkMove", nomatch: "// anchor: nomatch", driver: "// anchor: driver" },
    ),
    python: withAnchors(
`def f(i, j, s, t, memo):
    if i == 0 or j == 0:                    # base
        return 0
    if memo[i][j] != -1:                    # memo check
        return memo[i][j]
    if s[i - 1] == t[j - 1]:
        memo[i][j] = 1 + f(i - 1, j - 1, s, t, memo)   # match
    else:
        memo[i][j] = max(f(i - 1, j, s, t, memo),      # recurse
                         f(i, j - 1, s, t, memo))
    return memo[i][j]                       # memo store

# walk back from (m, n):                     # driver # walkMatch
#   match -> take char, move diagonally
#   otherwise step to the larger neighbour  # walkMove
# anchor: nomatch
# memoCheck
# memoStore`,
      { base: "# base", recurse: "# recurse", memoCheck: "# memoCheck", memoStore: "# memoStore", match: "# match", driver: "# driver", walkMatch: "# walkMatch", walkMove: "# walkMove", nomatch: "# anchor: nomatch" },
    ),
    js: withAnchors(
`function f(i, j, s, t, memo) {
  if (i === 0 || j === 0) return 0;              // base
  if (memo[i][j] !== -1) return memo[i][j];      // memo check
  if (s[i - 1] === t[j - 1])
    memo[i][j] = 1 + f(i - 1, j - 1, s, t, memo);         // match
  else
    memo[i][j] = Math.max(f(i - 1, j, s, t, memo),        // recurse
                          f(i, j - 1, s, t, memo));
  return memo[i][j];                             // memo store
}
// walk back from (m, n): match -> take char & go diagonal // walkMatch
// else follow the larger neighbour                        // walkMove
// anchor: nomatch
// memoCheck
// memoStore
// driver`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", match: "// match", driver: "// driver", walkMatch: "// walkMatch", walkMove: "// walkMove", nomatch: "// anchor: nomatch" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`string printLCS(string& s, string& t) {
    int m = s.size(), n = t.size();
    vector<vector<int>> dp(m + 1, vector<int>(n + 1, 0));
    for (int j = 0; j <= n; ++j) dp[0][j] = 0;          // base
    for (int i = 0; i <= m; ++i) dp[i][0] = 0;
    for (int i = 1; i <= m; ++i)
        for (int j = 1; j <= n; ++j) {
            if (s[i - 1] == t[j - 1])
                dp[i][j] = 1 + dp[i - 1][j - 1];             // match
            else
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1]);  // nomatch
        }
    // walk back from (m, n)                                  // driver
    string out = "";
    int i = m, j = n;
    while (i > 0 && j > 0) {
        if (s[i - 1] == t[j - 1]) { out = s[i - 1] + out; --i; --j; }   // walkMatch
        else if (dp[i - 1][j] >= dp[i][j - 1]) --i;                      // walkMove
        else --j;
    }
    return out;
}
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", match: "// match", nomatch: "// nomatch", driver: "// driver", walkMatch: "// walkMatch", walkMove: "// walkMove", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static String printLCS(String s, String t) {
    int m = s.length(), n = t.length();
    int[][] dp = new int[m + 1][n + 1];
    for (int i = 1; i <= m; ++i)                     // base rows/cols stay 0
        for (int j = 1; j <= n; ++j) {
            if (s.charAt(i - 1) == t.charAt(j - 1))
                dp[i][j] = 1 + dp[i - 1][j - 1];             // match
            else
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]); // nomatch
        }
    StringBuilder out = new StringBuilder();         // driver
    int i = m, j = n;
    while (i > 0 && j > 0) {
        if (s.charAt(i - 1) == t.charAt(j - 1)) { out.insert(0, s.charAt(i - 1)); --i; --j; } // walkMatch
        else if (dp[i - 1][j] >= dp[i][j - 1]) --i;                                           // walkMove
        else --j;
    }
    return out.toString();
}
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", match: "// match", nomatch: "// nomatch", driver: "// driver", walkMatch: "// walkMatch", walkMove: "// walkMove", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def print_lcs(s, t):
    m, n = len(s), len(t)
    dp = [[0] * (n + 1) for _ in range(m + 1)]   # base borders stay 0
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if s[i - 1] == t[j - 1]:
                dp[i][j] = 1 + dp[i - 1][j - 1]       # match
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])  # nomatch
    # walk back from (m, n)                            # driver
    out = []
    i, j = m, n
    while i > 0 and j > 0:
        if s[i - 1] == t[j - 1]:
            out.append(s[i - 1]); i -= 1; j -= 1       # walkMatch
        elif dp[i - 1][j] >= dp[i][j - 1]:
            i -= 1                                     # walkMove
        else:
            j -= 1
    return "".join(reversed(out))
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", match: "# match", nomatch: "# nomatch", driver: "# driver", walkMatch: "# walkMatch", walkMove: "# walkMove", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function printLCS(s, t) {
  const m = s.length, n = t.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)                   // base borders stay 0
    for (let j = 1; j <= n; j++) {
      if (s[i - 1] === t[j - 1])
        dp[i][j] = 1 + dp[i - 1][j - 1];              // match
      else
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]); // nomatch
    }
  let out = "";                                    // driver
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (s[i - 1] === t[j - 1]) { out = s[i - 1] + out; i--; j--; }  // walkMatch
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--;                     // walkMove
    else j--;
  }
  return out;
}
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", match: "// match", nomatch: "// nomatch", driver: "// driver", walkMatch: "// walkMatch", walkMove: "// walkMove", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
};

export const printLCS: ProblemServiceDef = {
  slug: "print-lcs",
  patternSlug: "dp-strings",
  inputDescriptor: [
    { key: "s", label: "STRING A", kind: "stringPair", min: 1, max: 6 },
    { key: "t", label: "STRING B", kind: "stringPair", min: 1, max: 6 },
  ],
  schema,
  defaultInput: { s: "abcb", t: "bdca" }, // LCS "bc" → verified in tests; small enough for Brute Force too
  randomInput: () => ({
    s: randStr(3 + Math.floor(Math.random() * 3)),
    t: randStr(3 + Math.floor(Math.random() * 3)),
  }),
  limitsPerMode: {
    bruteforce: limits,
    memo: limits,
    tabulation: limits,
    // no spaceOptimized variant: two rolling rows erase the info needed to walk back
    spaceOptimized: () => "Printing requires the full table for the backtrace — use Memoization or Tabulation.",
  },
  buildTrace: (input, mode) =>
    mode === "bruteforce"
      ? genBrute(input as In)
      : fillAndWalk(input as In, mode as "memo" | "tabulation"),
  codes,
};

function randStr(len: number): string {
  const out = [];
  for (let i = 0; i < len; i++) out.push("abcde"[Math.floor(Math.random() * 5)]);
  return out.join("");
}
