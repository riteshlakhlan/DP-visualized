import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Wildcard Matching (Striver DP-34): implement '?' (any single char) and
 * '*' (any sequence, incl. empty) matching.
 * dp[i][j] = does s[0..i) match p[0..j)?
 *   p[j-1] == '*'  → dp[i][j-1] || dp[i-1][j]
 *   '?' or match   → dp[i-1][j-1]
 * Bases: dp[0][0]=T; dp[0][j] = dp[0][j-1] && p[j-1]=='*'; dp[i>0][0]=F.
 */

const schema = z.object({
  s: z.string().regex(/^[a-z]{1,6}$/),
  p: z.string().regex(/^[a-z*?]{1,6}$/),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && Math.max(input.s.length, input.p.length) > 5)
    return "Pure recursion re-explores star branches exponentially. Keep both <= 5 chars for Brute Force.";
  return null;
}

const AXIS = (s: string, p: string) => ({
  rowsTitle: `string "${s}"`,
  colsTitle: `pattern "${p}"`,
  rowLabels: ["ε", ...s.split("")],
  colLabels: ["ε", ...p.split("")],
});

function genBrute(input: In): GeneratedTrace {
  const { s, p } = input;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<string>();

  function f(i: number, j: number, parentCallId?: number): boolean {
    const callId = b.allocCallId();
    calls++;
    if (i === 0) {
      const v = p.slice(0, j).split("").every((ch) => ch === "*");
      b.push("base-case", [0, j], v ? "Empty string vs all-star prefix → they vanish → match." : "Non-star cannot cover the remaining string → no match.", { callId, parentCallId, value: v, codeAnchor: "base" });
      return v;
    }
    if (j === 0) {
      b.push("base-case", [i, 0], "Pattern exhausted but string remains → no match.", { callId, parentCallId, value: false, codeAnchor: "base" });
      return false;
    }
    const dup = seen.has(`${i},${j}`);
    let kind: "star" | "wild" | "match" | "mismatch" =
      p[j - 1] === "*" ? "star" : p[j - 1] === "?" ? "wild" : s[i - 1] === p[j - 1] ? "match" : "mismatch";
    b.push("recurse-call", [i, j],
      dup ? `f(${i},${j}) called AGAIN.` : `f(${i},${j}) called: compare '${s[i - 1] ?? ""}' vs pattern '${p[j - 1]}' (${kind}).`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: kind });
    seen.add(`${i},${j}`);
    let v: boolean;
    let deps: number[][];
    if (p[j - 1] === "*") {
      v = f(i - 1, j, callId) || f(i, j - 1, callId);
      deps = [[Math.max(0, i - 1), j], [i, Math.max(0, j - 1)]];
      b.push("recurse-return", [i, j], `'*' absorbs '${s[i - 1]}' (${fLabel(i - 1, j)}) OR vanishes (${fLabel(i, j - 1)}) → ${v}.`, {
        callId, parentCallId, value: v, deps, codeAnchor: "star",
      });
    } else if (p[j - 1] === "?" || s[i - 1] === p[j - 1]) {
      v = f(i - 1, j - 1, callId);
      deps = [[i - 1, j - 1]];
      b.push("recurse-return", [i, j], `'${p[j - 1]}' covers '${s[i - 1]}' → diagonal: ${v}.`, { callId, parentCallId, value: v, deps, codeAnchor: kind });
    } else {
      v = false;
      deps = [];
      b.push("recurse-return", [i, j], `'${s[i - 1]}' != '${p[j - 1]}' and no wildcard → no match.`, { callId, parentCallId, value: false, deps, codeAnchor: "mismatch" });
    }
    return v;
  }
  function fLabel(i: number, j: number): string {
    return i < 0 || j < 0 ? "out" : `${i},${j}`;
  }

  // guard: leading empty-string handling for i==0 handled above via base cases
  const answer = f(s.length, p.length);
  return {
    steps: b.steps,
    meta: { mode: "bruteforce", answer, answerLabel: `matches "${p}"`, tableShape: null, axisLabels: null, valueFormat: "bool", stats: { steps: b.count, calls } },
  };
}

function genMemo(input: In): GeneratedTrace {
  const { s, p } = input;
  const m = s.length, n = p.length;
  const b = new TraceBuilder();
  const memo = new Map<string, boolean>();
  let calls = 0;
  let hits = 0;

  function f(i: number, j: number, parentCallId?: number): boolean {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i, j], `f(${i},${j}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (i === 0) {
      const v = p.slice(0, j).split("").every((ch) => ch === "*");
      b.push("base-case", [0, j], v ? "Empty string vs all-star prefix → match." : "Non-star left over → no match.", { callId, parentCallId, value: v, codeAnchor: "base" });
      return v;
    }
    if (j === 0) {
      b.push("base-case", [i, 0], "String left, pattern gone → false.", { callId, parentCallId, value: false, codeAnchor: "base" });
      return false;
    }
    const kk = `${i},${j}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [i, j], `Memo hit! f(${i},${j}) = ${v}.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    let v: boolean;
    let deps: number[][];
    if (p[j - 1] === "*") {
      v = f(Math.max(0, i - 1), j, callId) || f(i, j - 1, callId);
      deps = [[Math.max(0, i - 1), j], [i, j - 1]];
    } else if (p[j - 1] === "?" || (i > 0 && s[i - 1] === p[j - 1])) {
      v = i > 0 && f(i - 1, j - 1, callId);
      deps = [[Math.max(0, i - 1), j - 1]];
    } else {
      v = false;
      deps = [];
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
      answerLabel: `matches "${p}"`,
      tableShape: { rows: m + 1, cols: n + 1 },
      axisLabels: AXIS(s, p),
      valueFormat: "bool",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const { s, p } = input;
  const m = s.length, n = p.length;
  const b = new TraceBuilder();
  const dp: boolean[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(false));

  dp[0][0] = true;
  b.push("base-case", [0, 0], "dp[0][0] = T.", { value: true, codeAnchor: "base" });
  for (let j = 1; j <= n; j++) {
    dp[0][j] = dp[0][j - 1] && p[j - 1] === "*";
    b.push("table-write", [0, j], `dp[0][${j}] = ${dp[0][j]} ('${p[j - 1]}' must be a vanishing '*').`, {
      value: dp[0][j], deps: [[0, j - 1]], codeAnchor: "init",
    });
  }
  for (let i = 1; i <= m; i++) {
    b.push("base-case", [i, 0], `dp[${i}][0] = F.`, { value: false, codeAnchor: "base" });
  }

  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      let v: boolean;
      let deps: number[][];
      if (p[j - 1] === "*") {
        v = dp[i - 1][j] || dp[i][j - 1];
        deps = [[i - 1, j], [i, j - 1]];
        b.push("table-write", [i, j], `'*': absorb '${s[i - 1]}' (${dp[i - 1][j] ? "T" : "F"}) OR vanish (${dp[i][j - 1] ? "T" : "F"}) = ${v}.`, {
          value: v, deps, codeAnchor: "star",
        });
      } else if (p[j - 1] === "?" || s[i - 1] === p[j - 1]) {
        v = dp[i - 1][j - 1];
        deps = [[i - 1, j - 1]];
        b.push("table-write", [i, j], `'${p[j - 1]}' covers '${s[i - 1]}' → inherit diagonal ${v}.`, {
          value: v, deps, codeAnchor: p[j - 1] === "?" ? "wild" : "match",
        });
      } else {
        v = false;
        deps = [];
        b.push("table-write", [i, j], `'${s[i - 1]}' != '${p[j - 1]}' → F.`, { value: false, deps, codeAnchor: "mismatch" });
      }
      dp[i][j] = v;
    }

  const answer = dp[m][n];
  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: `matches "${p}"`,
      tableShape: { rows: m + 1, cols: n + 1 },
      axisLabels: AXIS(s, p),
      valueFormat: "bool",
      stats: { steps: b.count, writes: m * n + n + m },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const { s, p } = input;
  const m = s.length, n = p.length;
  const b = new TraceBuilder();

  let prev = new Array(n + 1).fill(false);
  prev[0] = true;
  b.push("base-case", [0, 0], "prev[0] = T; two rows replace the grid.", { value: true, codeAnchor: "init" });

  for (let i = 0; i <= m; i++) {
    const cur = new Array(n + 1).fill(false);
    cur[0] = i === 0;
    for (let j = 1; j <= n; j++) {
      if (i === 0) {
        const v = cur[j - 1] && p[j - 1] === "*";
        cur[j] = v;
        b.push("table-write", [0, j], `Row 0: needs all stars → ${v}.`, { value: v, deps: [[0, j - 1]], codeAnchor: "init" });
        continue;
      }
      if (cur[0] === undefined) void cur[0];
      let v: boolean;
      let deps: number[][];
      if (p[j - 1] === "*") {
        v = prev[j] || cur[j - 1];
        deps = [[i - 1, j], [i, j - 1]];
        b.push("table-write", [i, j], `'*' → absorb (${prev[j] ? "T" : "F"}) or vanish (${cur[j - 1] ? "T" : "F"}) = ${v}.`, {
          value: v, deps, codeAnchor: "star",
        });
      } else if (p[j - 1] === "?" || s[i - 1] === p[j - 1]) {
        v = prev[j - 1];
        deps = [[i - 1, j - 1]];
        b.push("table-write", [i, j], `'${p[j - 1]}' covers '${s[i - 1]}' → diagonal ${v}.`, {
          value: v, deps, codeAnchor: p[j - 1] === "?" ? "wild" : "match",
        });
      } else {
        v = false;
        deps = [];
        b.push("table-write", [i, j], `Mismatch → F.`, { value: false, deps, codeAnchor: "mismatch" });
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
      answerLabel: `matches "${p}"`,
      tableShape: { rows: m + 1, cols: n + 1 },
      axisLabels: AXIS(s, p),
      valueFormat: "bool",
      rollingWindow: true,
      stats: { steps: b.count, writes: (m + 1) * (n + 1) },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`bool f(int i, int j, string& s, string& p) {
    if (i == 0 && j == 0) return true;         // base
    if (j == 0) return false;                  // base
    if (i == 0) return p[j - 1] == '*' && f(0, j - 1, s, p); // base
    if (p[j - 1] == '*')                       // star
        return f(i - 1, j, s, p) ||            // recurse
               f(i, j - 1, s, p);
    if (p[j - 1] == '?' || s[i - 1] == p[j - 1])
        return f(i - 1, j - 1, s, p);          // wild
    return false;                              // mismatch
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// match`,
      { base: "// base", recurse: "// recurse", star: "// star", match: "// match", wild: "// wild", mismatch: "// mismatch", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore" },
    ),
    java: withAnchors(
`static boolean f(int i, int j, String s, String p) {
    if (i == 0 && j == 0) return true;          // base
    if (j == 0) return false;                   // base
    if (i == 0) return p.charAt(j - 1) == '*' && f(0, j - 1, s, p); // base
    if (p.charAt(j - 1) == '*')                 // star
        return f(i - 1, j, s, p) ||             // recurse
               f(i, j - 1, s, p);
    if (p.charAt(j - 1) == '?' || s.charAt(i - 1) == p.charAt(j - 1))
        return f(i - 1, j - 1, s, p);           // wild
    return false;                               // mismatch
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// match`,
      { base: "// base", recurse: "// recurse", star: "// star", match: "// match", wild: "// wild", mismatch: "// mismatch", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore" },
    ),
    python: withAnchors(
`def f(i, j, s, p):
    if i == 0 and j == 0:                 # base
        return True
    if j == 0:                            # base
        return False
    if i == 0:
        return p[j - 1] == "*" and f(0, j - 1, s, p)   # base
    if p[j - 1] == "*":                   # star
        return f(i - 1, j, s, p) or       # recurse
               f(i, j - 1, s, p)
    if p[j - 1] == "?" or s[i - 1] == p[j - 1]:
        return f(i - 1, j - 1, s, p)      # wild
    return False                          # mismatch
# anchor: driver
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# match`,
      { base: "# base", recurse: "# recurse", star: "# star", match: "# match", wild: "# wild", mismatch: "# mismatch", driver: "# anchor: driver", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore" },
    ),
    js: withAnchors(
`function f(i, j, s, p) {
  if (i === 0 && j === 0) return true;     // base
  if (j === 0) return false;               // base
  if (i === 0)
    return p[j - 1] === '*' && f(0, j - 1, s, p); // base
  if (p[j - 1] === '*')                    // star
    return f(i - 1, j, s, p) ||            // recurse
           f(i, j - 1, s, p);
  if (p[j - 1] === '?' || s[i - 1] === p[j - 1])
    return f(i - 1, j - 1, s, p);          // wild
  return false;                            // mismatch
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// match`,
      { base: "// base", recurse: "// recurse", star: "// star", match: "// match", wild: "// wild", mismatch: "// mismatch", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`bool f(int i, int j, string& s, string& p, vector<vector<int>>& memo) {
    if (i == 0 && j == 0) return true;              // base
    if (j == 0) return false;                       // base
    if (i == 0) return p[j - 1] == '*' && f(0, j - 1, s, p, memo); // base
    if (memo[i][j] != -1) return memo[i][j];        // memo check
    bool res;
    if (p[j - 1] == '*')                             // star
        res = f(i - 1, j, s, p, memo) || f(i, j - 1, s, p, memo);
    else if (p[j - 1] == '?' || s[i - 1] == p[j - 1])
        res = f(i - 1, j - 1, s, p, memo);           // wild
    else res = false;                                // mismatch
    memo[i][j] = res;
    return res;                                      // memo store
}
// anchor: driver
// anchor: init
// recurse
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", star: "// star", wild: "// wild", mismatch: "// mismatch", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// anchor: driver", init: "// anchor: init" },
    ),
    java: withAnchors(
`static boolean f(int i, int j, String s, String p, Boolean[][] memo) {
    if (i == 0 && j == 0) return true;               // base
    if (j == 0) return false;                        // base
    if (i == 0) return p.charAt(j - 1) == '*' && f(0, j - 1, s, p, memo); // base
    if (memo[i][j] != null) return memo[i][j];       // memo check
    boolean res;
    if (p.charAt(j - 1) == '*')                      // star
        res = f(i - 1, j, s, p, memo) || f(i, j - 1, s, p, memo);
    else if (p.charAt(j - 1) == '?' || s.charAt(i - 1) == p.charAt(j - 1))
        res = f(i - 1, j - 1, s, p, memo);           // wild
    else res = false;                                // mismatch
    memo[i][j] = res;
    return res;                                      // memo store
}
// anchor: driver
// anchor: init
// anchor: recurse
// memoCheck
// memoStore`,
      { base: "// base", star: "// star", wild: "// wild", mismatch: "// mismatch", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// anchor: driver", init: "// anchor: init", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def f(i, j, s, p, memo):
    if i == 0 and j == 0:                    # base
        return True
    if j == 0:                               # base
        return False
    if i == 0:
        return p[j - 1] == "*" and f(0, j - 1, s, p, memo)   # base
    if memo[i][j] != -1:                     # memo check
        return memo[i][j]
    if p[j - 1] == "*":                      # star
        res = f(i - 1, j, s, p, memo) or f(i, j - 1, s, p, memo)
    elif p[j - 1] == "?" or s[i - 1] == p[j - 1]:
        res = f(i - 1, j - 1, s, p, memo)    # wild
    else:
        res = False                          # mismatch
    memo[i][j] = res
    return res                               # memo store
# anchor: driver
# anchor: init
# anchor: recurse
# memoCheck
# memoStore`,
      { base: "# base", star: "# star", wild: "# wild", mismatch: "# mismatch", memoCheck: "# memoCheck", memoStore: "# memoStore", driver: "# anchor: driver", init: "# anchor: init", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function f(i, j, s, p, memo) {
  if (i === 0 && j === 0) return true;         // base
  if (j === 0) return false;                   // base
  if (i === 0)
    return p[j - 1] === '*' && f(0, j - 1, s, p, memo); // base
  if (memo[i][j] !== -1) return memo[i][j];    // memo check
  let res;
  if (p[j - 1] === '*')                        // star
    res = f(i - 1, j, s, p, memo) || f(i, j - 1, s, p, memo);
  else if (p[j - 1] === '?' || s[i - 1] === p[j - 1])
    res = f(i - 1, j - 1, s, p, memo);         // wild
  else res = false;                            // mismatch
  memo[i][j] = res;
  return res;                                  // memo store
}
// anchor: driver
// anchor: init
// anchor: recurse
// memoCheck
// memoStore`,
      { base: "// base", star: "// star", wild: "// wild", mismatch: "// mismatch", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// anchor: driver", init: "// anchor: init", recurse: "// anchor: recurse" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`bool isMatch(string s, string p) {
    int m = s.size(), n = p.size();
    vector<vector<bool>> dp(m + 1, vector<bool>(n + 1, false));
    dp[0][0] = true;                                 // base
    for (int j = 1; j <= n; ++j)                     // init row 0
        dp[0][j] = dp[0][j - 1] && p[j - 1] == '*';
    for (int i = 1; i <= m; ++i)
        for (int j = 1; j <= n; ++j) {
            if (p[j - 1] == '*')
                dp[i][j] = dp[i - 1][j] || dp[i][j - 1];      // star
            else if (p[j - 1] == '?' || s[i - 1] == p[j - 1])
                dp[i][j] = dp[i - 1][j - 1];                  // wild // match
            else
                dp[i][j] = false;                             // mismatch
        }
    return dp[m][n];
}
// anchor: driver
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// transition
// anchor: init`,
      { base: "// base", transition: "// transition", star: "// star", match: "// match", wild: "// wild", mismatch: "// mismatch", driver: "// anchor: driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse", init: "// anchor: init" },
    ),
    java: withAnchors(
`static boolean isMatch(String s, String p) {
    int m = s.length(), n = p.length();
    boolean[][] dp = new boolean[m + 1][n + 1];
    dp[0][0] = true;                                  // base
    for (int j = 1; j <= n; ++j)                      // init row 0
        dp[0][j] = dp[0][j - 1] && p.charAt(j - 1) == '*';
    for (int i = 1; i <= m; ++i)
        for (int j = 1; j <= n; ++j) {
            if (p.charAt(j - 1) == '*')
                dp[i][j] = dp[i - 1][j] || dp[i][j - 1];       // star
            else if (p.charAt(j - 1) == '?' || s.charAt(i - 1) == p.charAt(j - 1))
                dp[i][j] = dp[i - 1][j - 1];                   // wild // match
            else
                dp[i][j] = false;                              // mismatch
        }
    return dp[m][n];
}
// anchor: driver
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// transition
// anchor: init`,
      { base: "// base", transition: "// transition", star: "// star", match: "// match", wild: "// wild", mismatch: "// mismatch", driver: "// anchor: driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse", init: "// anchor: init" },
    ),
    python: withAnchors(
`def is_match(s, p):
    m, n = len(s), len(p)
    dp = [[False] * (n + 1) for _ in range(m + 1)]
    dp[0][0] = True                                  # base
    for j in range(1, n + 1):                        # init row 0
        dp[0][j] = dp[0][j - 1] and p[j - 1] == "*"
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if p[j - 1] == "*":
                dp[i][j] = dp[i - 1][j] or dp[i][j - 1]       # star
            elif p[j - 1] == "?" or s[i - 1] == p[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]                   # wild # match
            else:
                dp[i][j] = False                              # mismatch
    return dp[m][n]
# anchor: driver
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
# transition
# anchor: init`,
      { base: "# base", transition: "# transition", star: "# star", match: "# match", wild: "# wild", mismatch: "# mismatch", driver: "# anchor: driver", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse", init: "# anchor: init" },
    ),
    js: withAnchors(
`function isMatch(s, p) {
  const m = s.length, n = p.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(false));
  dp[0][0] = true;                                  // base
  for (let j = 1; j <= n; j++)                      // init row 0
    dp[0][j] = dp[0][j - 1] && p[j - 1] === '*';
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      if (p[j - 1] === '*')
        dp[i][j] = dp[i - 1][j] || dp[i][j - 1];    // star
      else if (p[j - 1] === '?' || s[i - 1] === p[j - 1])
        dp[i][j] = dp[i - 1][j - 1];                // wild // match
      else
        dp[i][j] = false;                           // mismatch
    }
  return dp[m][n];
}
// anchor: driver
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// transition
// anchor: init`,
      { base: "// base", transition: "// transition", star: "// star", match: "// match", wild: "// wild", mismatch: "// mismatch", driver: "// anchor: driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse", init: "// anchor: init" },
    ),
  },
  spaceOptimized: {
    cpp: withAnchors(
`bool isMatch(string s, string p) {
    int m = s.size(), n = p.size();
    vector<char> prev(n + 1, 0), cur(n + 1, 0);      // init
    prev[0] = 1;
    for (int j = 1; j <= n; ++j) prev[j] = prev[j - 1] && p[j - 1] == '*';
    for (int i = 1; i <= m; ++i) {
        cur[0] = 0;                                   // init
        for (int j = 1; j <= n; ++j) {
            if (p[j - 1] == '*')
                cur[j] = prev[j] || cur[j - 1];               // transition
            else if (p[j - 1] == '?' || s[i - 1] == p[j - 1])
                cur[j] = prev[j - 1];                         // wild // match
            else
                cur[j] = 0;                                   // mismatch
        }
        prev = cur;
    }
    return prev[n];
}
// anchor: base
// anchor: driver
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// anchor: star`,
      { init: "// init", transition: "// transition", match: "// wild", wild: "// wild", mismatch: "// mismatch", base: "// anchor: base", driver: "// anchor: driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse", star: "// anchor: star" },
    ),
    java: withAnchors(
`static boolean isMatch(String s, String p) {
    int m = s.length(), n = p.length();
    boolean[] prev = new boolean[n + 1], cur = new boolean[n + 1]; // init
    prev[0] = true;
    for (int j = 1; j <= n; ++j) prev[j] = prev[j - 1] && p.charAt(j - 1) == '*';
    for (int i = 1; i <= m; ++i) {
        cur[0] = false;                               // init
        for (int j = 1; j <= n; ++j) {
            if (p.charAt(j - 1) == '*')
                cur[j] = prev[j] || cur[j - 1];               // transition
            else if (p.charAt(j - 1) == '?' || s.charAt(i - 1) == p.charAt(j - 1))
                cur[j] = prev[j - 1];                         // wild // match
            else
                cur[j] = false;                               // mismatch
        }
        prev = cur;
    }
    return prev[n];
}
// anchor: base
// anchor: driver
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// anchor: star`,
      { init: "// init", transition: "// transition", match: "// wild", wild: "// wild", mismatch: "// mismatch", base: "// anchor: base", driver: "// anchor: driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse", star: "// anchor: star" },
    ),
    python: withAnchors(
`def is_match(s, p):
    m, n = len(s), len(p)
    prev = [False] * (n + 1); cur = [False] * (n + 1)   # init
    prev[0] = True
    for j in range(1, n + 1):
        prev[j] = prev[j - 1] and p[j - 1] == "*"
    for i in range(1, m + 1):
        cur[0] = False                             # init
        for j in range(1, n + 1):
            if p[j - 1] == "*":
                cur[j] = prev[j] or cur[j - 1]             # transition
            elif p[j - 1] == "?" or s[i - 1] == p[j - 1]:
                cur[j] = prev[j - 1]                       # wild # match
            else:
                cur[j] = False                             # mismatch
        prev = cur
    return prev[n]
# anchor: base
# anchor: driver
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
# anchor: star`,
      { init: "# init", transition: "# transition", match: "# wild", wild: "# wild", mismatch: "# mismatch", base: "# anchor: base", driver: "# anchor: driver", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse", star: "# anchor: star" },
    ),
    js: withAnchors(
`function isMatch(s, p) {
  const m = s.length, n = p.length;
  let prev = new Array(n + 1).fill(false), cur = new Array(n + 1).fill(false); // init
  prev[0] = true;
  for (let j = 1; j <= n; j++) prev[j] = prev[j - 1] && p[j - 1] === '*';
  for (let i = 1; i <= m; i++) {
    cur[0] = false;                                // init
    for (let j = 1; j <= n; j++) {
      if (p[j - 1] === '*')
        cur[j] = prev[j] || cur[j - 1];            // transition
      else if (p[j - 1] === '?' || s[i - 1] === p[j - 1])
        cur[j] = prev[j - 1];                      // wild // match
      else
        cur[j] = false;                            // mismatch
    }
    prev = cur;
  }
  return prev[n];
}
// anchor: base
// anchor: driver
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// anchor: star`,
      { init: "// init", transition: "// transition", match: "// wild", wild: "// wild", mismatch: "// mismatch", base: "// anchor: base", driver: "// anchor: driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse", star: "// anchor: star" },
    ),
  },
};

export const wildcardMatching: ProblemServiceDef = {
  slug: "wildcard-matching",
  patternSlug: "dp-strings",
  inputDescriptor: [
    { key: "s", label: "STRING", kind: "stringPair", min: 1, max: 6 },
    { key: "p", label: "PATTERN (? *)", kind: "stringPair", min: 1, max: 6, allow: "[a-z*?]" },
  ],
  schema,
  defaultInput: { s: "abcde", p: "a*de" }, // → true ("*" eats "bc")
  randomInput: () => ({
    s: randStr(3 + Math.floor(Math.random() * 3)),
    p: randPattern(),
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
function randPattern(): string {
  const chars = ["a", "b", "c", "*", "?"];
  const len = 2 + Math.floor(Math.random() * 4);
  const out = [];
  for (let i = 0; i < len; i++) out.push(chars[Math.floor(Math.random() * chars.length)]);
  return out.join("");
}
