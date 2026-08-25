import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Longest Palindromic Subsequence (Striver DP-28): longest subsequence of s
 * reading the same forwards and backwards.
 * Interval DP: dp[i][j] = LPS length inside s[i..j].
 *   s[i]==s[j] → 2 + dp[i+1][j-1]
 *   else       → max(dp[i+1][j], dp[i][j-1])
 * Only the upper triangle (i <= j) exists; answer = dp[0][n-1].
 */

const schema = z.object({
  s: z.string().regex(/^[a-z]{1,7}$/),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  const n = input.s.length;
  if (mode === "bruteforce" && Math.pow(2, n) > 128)
    return "Brute force compares every subsequence pair implicitly (2^n paths). Keep strings <= 7 chars for Brute Force.";
  return null;
}

const AXIS = (s: string) => ({
  rowsTitle: 'start index i',
  colsTitle: 'end index j',
  rowLabels: [...s.split("")],
  colLabels: [...s.split("")],
});

function genBrute(input: In): GeneratedTrace {
  const s = input.s;
  const n = s.length;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<string>();

  function f(i: number, j: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i > j) {
      b.push("base-case", [Math.min(i, n - 1), Math.max(j, 0)], "Empty range → LPS 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    if (i === j) {
      b.push("base-case", [i, j], `Single char '${s[i]}' is itself a palindrome → 1.`, { callId, parentCallId, value: 1, codeAnchor: "base" });
      return 1;
    }
    const dup = seen.has(`${i},${j}`);
    const match = s[i] === s[j];
    b.push("recurse-call", [i, j],
      dup ? `f(${i},${j}) called AGAIN — overlapping interval.`
          : `f(${i},${j}) called: compare ends '${s[i]}' vs '${s[j]}' (${match ? "MATCH" : "no match"}).`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: match ? "match" : "recurse" });
    seen.add(`${i},${j}`);
    let v: number;
    let deps: number[][];
    if (match) {
      v = 2 + f(i + 1, j - 1, callId);
      deps = [[i + 1, j - 1]];
      b.push("recurse-return", [i, j], `'${s[i]}' == '${s[j]}' → both ends join the palindrome: f(${i},${j}) = 2 + f(${i + 1},${j - 1}) = ${v}.`, {
        callId, parentCallId, value: v, deps, codeAnchor: "match",
      });
    } else {
      const dropLeft = f(i + 1, j, callId);
      const dropRight = f(i, j - 1, callId);
      v = Math.max(dropLeft, dropRight);
      deps = [[i + 1, j], [i, j - 1]];
      b.push("recurse-return", [i, j], `Ends differ → best of dropping '${s[i]}' (${dropLeft}) or '${s[j]}' (${dropRight}) = ${v}.`, {
        callId, parentCallId, value: v, deps, codeAnchor: "nomatch",
      });
    }
    return v;
  }

  const answer = f(0, n - 1);
  return {
    steps: b.steps,
    meta: { mode: "bruteforce", answer, answerLabel: "LPS length", tableShape: null, axisLabels: null, valueFormat: "int", stats: { steps: b.count, calls } },
  };
}

function genMemo(input: In): GeneratedTrace {
  const s = input.s;
  const n = s.length;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, j: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i > j) return 0;
    b.push("recurse-call", [i, j], `f(${i},${j}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (i === j) {
      b.push("base-case", [i, j], `Single char → 1.`, { callId, parentCallId, value: 1, codeAnchor: "base" });
      return 1;
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
    if (s[i] === s[j]) {
      v = 2 + f(i + 1, j - 1, callId);
      deps = [[i + 1, j - 1]];
    } else {
      const dl = f(i + 1, j, callId);
      const dr = f(i, j - 1, callId);
      v = Math.max(dl, dr);
      deps = [[i + 1, j], [i, j - 1]];
    }
    memo.set(kk, v);
    b.push("recurse-return", [i, j], `f(${i},${j}) = ${v}, stored in memo.`, { callId, parentCallId, value: v, deps, codeAnchor: "memoStore" });
    return v;
  }

  const answer = f(0, n - 1);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "LPS length",
      tableShape: { rows: n, cols: n },
      axisLabels: AXIS(s),
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const s = input.s;
  const n = s.length;
  const b = new TraceBuilder();
  const dp: number[][] = Array.from({ length: n }, () => new Array(n).fill(-1));

  // fill from bottom row upward so deps ([i+1][*]) always exist
  for (let i = n - 1; i >= 0; i--) {
    for (let j = i; j < n; j++) {
      let v: number;
      let deps: number[][];
      if (i === j) {
        v = 1;
        deps = [];
        b.push("base-case", [i, j], `'${s[i]}' alone → palindrome of length 1.`, { value: 1, deps, codeAnchor: "base" });
      } else if (s[i] === s[j]) {
        const inner = i + 1 <= j - 1 ? dp[i + 1][j - 1] : 0;
        v = 2 + inner;
        deps = [[i + 1, j - 1]];
        b.push("table-write", [i, j], `'${s[i]}' == '${s[j]}' → wrap inner: dp[${i}][${j}] = 2 + ${inner} = ${v}.`, {
          value: v, deps, codeAnchor: "match",
        });
      } else {
        const dl = dp[i + 1][j];
        const dr = dp[i][j - 1];
        v = Math.max(dl, dr);
        deps = [[i + 1, j], [i, j - 1]];
        b.push("table-write", [i, j], `'${s[i]}' != '${s[j]}' → max(drop left dp[${i + 1}][${j}]=${dl}, drop right dp[${i}][${j - 1}]=${dr}) = ${v}.`, {
          value: v, deps, codeAnchor: "nomatch",
        });
      }
      dp[i][j] = v;
    }
  }

  const answer = dp[0][n - 1];
  b.push("table-read", [0, n - 1], `Answer at the top-right corner: dp[0][${n - 1}] = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "LPS length",
      tableShape: { rows: n, cols: n },
      axisLabels: AXIS(s),
      valueFormat: "int",
      stats: { steps: b.count, writes: (n * (n + 1)) / 2 + 1 },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const s = input.s;
  const n = s.length;
  const b = new TraceBuilder();

  // next = row i+1, cur = row i
  let next = new Array(n).fill(0);
  for (let j = 0; j < n; j++)
    b.push("base-case", [n - 1, j], j >= n - 1 ? "Bottom row starts empty." : "Below-diagonal cells unused.", { value: undefined, codeAnchor: "init" });

  for (let i = n - 1; i >= 0; i--) {
    const cur = new Array(n).fill(0);
    for (let j = i; j < n; j++) {
      let v: number;
      let deps: number[][];
      if (i === j) {
        v = 1;
        deps = [];
        b.push("table-write", [i, j], `'${s[i]}' alone → 1 (cur[${j}] set).`, { value: 1, deps, codeAnchor: "base" });
      } else if (s[i] === s[j]) {
        const inner = i + 1 <= j - 1 ? next[j - 1] : 0;
        v = 2 + inner;
        deps = [[i + 1, j - 1]];
        b.push("table-write", [i, j], `'${s[i]}' == '${s[j]}' → cur[${j}] = 2 + next[${j - 1}] = ${v}. Two rows replace the matrix.`, {
          value: v, deps, codeAnchor: "match",
        });
      } else {
        const dl = next[j];
        const dr = cur[j - 1];
        v = Math.max(dl, dr);
        deps = [[i + 1, j], [i, j - 1]];
        b.push("table-write", [i, j], `'${s[i]}' != '${s[j]}' → max(next[${j}]=${dl}, cur[${j - 1}]=${dr}) = ${v}.`, {
          value: v, deps, codeAnchor: "nomatch",
        });
      }
      cur[j] = v;
    }
    next = cur;
  }

  const answer = next[n - 1];
  b.push("table-read", [0, n - 1], `Answer survives in the last computed row: ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer,
      answerLabel: "LPS length",
      tableShape: { rows: n, cols: n },
      axisLabels: AXIS(s),
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: ((n * (n + 1)) / 2) + 1 },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int i, int j, string& s) {
    if (i > j) return 0;                       // base
    if (i == j) return 1;                      // base
    if (s[i] == s[j])
        return 2 + f(i + 1, j - 1, s);         // match
    // nomatch: drop one end and take the better LPS
    return max(f(i + 1, j, s),                 // recurse
               f(i, j - 1, s));
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore`,
      { base: "// base", match: "// match", recurse: "// recurse", nomatch: "// nomatch", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore" },
    ),
    java: withAnchors(
`static int f(int i, int j, String s) {
    if (i > j) return 0;                        // base
    if (i == j) return 1;                       // base
    if (s.charAt(i) == s.charAt(j))
        return 2 + f(i + 1, j - 1, s);          // match
    // nomatch: drop one end and take the better LPS
    return Math.max(f(i + 1, j, s),             // recurse
                    f(i, j - 1, s));
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore`,
      { base: "// base", match: "// match", recurse: "// recurse", nomatch: "// nomatch", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore" },
    ),
    python: withAnchors(
`def f(i, j, s):
    if i > j:                            # base
        return 0
    if i == j:                           # base
        return 1
    if s[i] == s[j]:
        return 2 + f(i + 1, j - 1, s)    # match
    # nomatch: drop one end and take the better LPS
    return max(f(i + 1, j, s),           # recurse
               f(i, j - 1, s))
# anchor: driver
# anchor: init
# anchor: memoCheck
# anchor: memoStore`,
      { base: "# base", match: "# match", recurse: "# recurse", nomatch: "# nomatch", driver: "# anchor: driver", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore" },
    ),
    js: withAnchors(
`function f(i, j, s) {
  if (i > j) return 0;                     // base
  if (i === j) return 1;                   // base
  if (s[i] === s[j])
    return 2 + f(i + 1, j - 1, s);         // match
  // nomatch: drop one end and take the better LPS
  return Math.max(f(i + 1, j, s),          // recurse
                  f(i, j - 1, s));
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
`int f(int i, int j, string& s, vector<vector<int>>& memo) {
    if (i > j) return 0;                          // base
    if (i == j) return 1;                         // base
    if (memo[i][j] != -1) return memo[i][j];      // memo check
    if (s[i] == s[j])
        memo[i][j] = 2 + f(i + 1, j - 1, s, memo);       // match
    else
        memo[i][j] = max(f(i + 1, j, s, memo),           // recurse
                         f(i, j - 1, s, memo));
    return memo[i][j];                            // memo store
}
// anchor: driver
// anchor: init
// anchor: nomatch
// memoCheck
// memoStore`,
      { base: "// base", match: "// match", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// anchor: driver", init: "// anchor: init", nomatch: "// anchor: nomatch" },
    ),
    java: withAnchors(
`static int f(int i, int j, String s, int[][] memo) {
    if (i > j) return 0;                           // base
    if (i == j) return 1;                          // base
    if (memo[i][j] != -1) return memo[i][j];       // memo check
    if (s.charAt(i) == s.charAt(j))
        memo[i][j] = 2 + f(i + 1, j - 1, s, memo);          // match
    else
        memo[i][j] = Math.max(f(i + 1, j, s, memo),         // recurse
                              f(i, j - 1, s, memo));
    return memo[i][j];                             // memo store
}
// anchor: driver
// anchor: init
// anchor: nomatch
// memoCheck
// memoStore`,
      { base: "// base", match: "// match", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// anchor: driver", init: "// anchor: init", nomatch: "// anchor: nomatch" },
    ),
    python: withAnchors(
`def f(i, j, s, memo):
    if i > j:                                 # base
        return 0
    if i == j:                                # base
        return 1
    if memo[i][j] != -1:                      # memo check
        return memo[i][j]
    if s[i] == s[j]:
        memo[i][j] = 2 + f(i + 1, j - 1, s, memo)        # match
    else:
        memo[i][j] = max(f(i + 1, j, s, memo),           # recurse
                         f(i, j - 1, s, memo))
    return memo[i][j]                         # memo store
# anchor: driver
# anchor: init
# anchor: nomatch
# memoCheck
# memoStore`,
      { base: "# base", match: "# match", recurse: "# recurse", memoCheck: "# memoCheck", memoStore: "# memoStore", driver: "# anchor: driver", init: "# anchor: init", nomatch: "# anchor: nomatch" },
    ),
    js: withAnchors(
`function f(i, j, s, memo) {
  if (i > j) return 0;                            // base
  if (i === j) return 1;                          // base
  if (memo[i][j] !== -1) return memo[i][j];       // memo check
  if (s[i] === s[j])
    memo[i][j] = 2 + f(i + 1, j - 1, s, memo);            // match
  else
    memo[i][j] = Math.max(f(i + 1, j, s, memo),           // recurse
                          f(i, j - 1, s, memo));
  return memo[i][j];                              // memo store
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
`int longestPalindromeSubseq(string& s) {
    int n = s.size();
    vector<vector<int>> dp(n, vector<int>(n, 0));
    for (int i = n - 1; i >= 0; --i)
        for (int j = i; j < n; ++j) {
            if (i == j)
                dp[i][j] = 1;                                  // base
            else if (s[i] == s[j])
                dp[i][j] = 2 + ((i + 1 <= j - 1) ? dp[i + 1][j - 1] : 0); // match
            else
                dp[i][j] = max(dp[i + 1][j], dp[i][j - 1]);    // transition
        }
    return dp[0][n - 1]; // driver
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// nomatch`,
      { base: "// base", match: "// match", nomatch: "// nomatch", transition: "// transition", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int longestPalindromeSubseq(String s) {
    int n = s.length();
    int[][] dp = new int[n][n];
    for (int i = n - 1; i >= 0; --i)
        for (int j = i; j < n; ++j) {
            if (i == j)
                dp[i][j] = 1;                                   // base
            else if (s.charAt(i) == s.charAt(j))
                dp[i][j] = 2 + ((i + 1 <= j - 1) ? dp[i + 1][j - 1] : 0); // match
            else
                dp[i][j] = Math.max(dp[i + 1][j], dp[i][j - 1]); // transition
        }
    return dp[0][n - 1]; // driver
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// nomatch`,
      { base: "// base", match: "// match", nomatch: "// nomatch", transition: "// transition", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def longest_palindrome_subseq(s):
    n = len(s)
    dp = [[0] * n for _ in range(n)]
    for i in range(n - 1, -1, -1):
        for j in range(i, n):
            if i == j:
                dp[i][j] = 1                                        # base
            elif s[i] == s[j]:
                dp[i][j] = 2 + (dp[i + 1][j - 1] if i + 1 <= j - 1 else 0)  # match
            else:
                dp[i][j] = max(dp[i + 1][j], dp[i][j - 1])          # transition
    return dp[0][n - 1]   # driver
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
# nomatch`,
      { base: "# base", match: "# match", nomatch: "# nomatch", transition: "# transition", driver: "# driver", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function longestPalindromeSubseq(s) {
  const n = s.length;
  const dp = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = i; j < n; j++) {
      if (i === j)
        dp[i][j] = 1;                                             // base
      else if (s[i] === s[j])
        dp[i][j] = 2 + (i + 1 <= j - 1 ? dp[i + 1][j - 1] : 0);   // match
      else
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j - 1]);          // transition
    }
  return dp[0][n - 1]; // driver
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// nomatch`,
      { base: "// base", match: "// match", nomatch: "// nomatch", transition: "// transition", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
  spaceOptimized: {
    cpp: withAnchors(
`int longestPalindromeSubseq(string& s) {
    int n = s.size();
    vector<int> next(n, 0), cur(n, 0);              // init
    for (int i = n - 1; i >= 0; --i) {
        fill(cur.begin(), cur.end(), 0);
        for (int j = i; j < n; ++j) {
            if (i == j)
                cur[j] = 1;                                          // base
            else if (s[i] == s[j])
                cur[j] = 2 + ((i + 1 <= j - 1) ? next[j - 1] : 0);   // match
            else
                cur[j] = max(next[j], cur[j - 1]);                   // transition
        }
        next = cur;
    }
    return next[n - 1]; // driver
}
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// nomatch`,
      { init: "// init", base: "// base", match: "// match", nomatch: "// nomatch", transition: "// transition", driver: "// driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int longestPalindromeSubseq(String s) {
    int n = s.length();
    int[] next = new int[n], cur = new int[n];      // init
    for (int i = n - 1; i >= 0; --i) {
        Arrays.fill(cur, 0);
        for (int j = i; j < n; ++j) {
            if (i == j)
                cur[j] = 1;                                         // base
            else if (s.charAt(i) == s.charAt(j))
                cur[j] = 2 + ((i + 1 <= j - 1) ? next[j - 1] : 0);  // match
            else
                cur[j] = Math.max(next[j], cur[j - 1]);             // transition
        }
        next = cur;
    }
    return next[n - 1]; // driver
}
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// nomatch`,
      { init: "// init", base: "// base", match: "// match", nomatch: "// nomatch", transition: "// transition", driver: "// driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def longest_palindrome_subseq(s):
    n = len(s)
    nxt = [0] * n                                 # init
    for i in range(n - 1, -1, -1):
        cur = [0] * n
        for j in range(i, n):
            if i == j:
                cur[j] = 1                                            # base
            elif s[i] == s[j]:
                cur[j] = 2 + (nxt[j - 1] if i + 1 <= j - 1 else 0)    # match
            else:
                cur[j] = max(nxt[j], cur[j - 1])                      # transition
        nxt = cur
    return nxt[n - 1]   # driver
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
# nomatch`,
      { init: "# init", base: "# base", match: "# match", nomatch: "# nomatch", transition: "# transition", driver: "# driver", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function longestPalindromeSubseq(s) {
  const n = s.length;
  let next = new Array(n).fill(0);            // init
  for (let i = n - 1; i >= 0; i--) {
    const cur = new Array(n).fill(0);
    for (let j = i; j < n; j++) {
      if (i === j)
        cur[j] = 1;                                               // base
      else if (s[i] === s[j])
        cur[j] = 2 + (i + 1 <= j - 1 ? next[j - 1] : 0);          // match
      else
        cur[j] = Math.max(next[j], cur[j - 1]);                   // transition
    }
    next = cur;
  }
  return next[n - 1]; // driver
}
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// nomatch`,
      { init: "// init", base: "// base", match: "// match", nomatch: "// nomatch", transition: "// transition", driver: "// driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
};

export const longestPalindromicSubsequence: ProblemServiceDef = {
  slug: "longest-palindromic-subsequence",
  patternSlug: "dp-strings",
  inputDescriptor: [
    { key: "s", label: "STRING", kind: "stringPair", min: 1, max: 6 },
  ],
  schema,
  defaultInput: { s: "bbbab" }, // LeetCode classic → 4 ("bbbb")
  randomInput: () => ({
    s: Array.from({ length: 3 + Math.floor(Math.random() * 4) }, () => "ab"[Math.floor(Math.random() * 2)]).join(""),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : mode === "tabulation" ? genTab(input as In) : genSpace(input as In),
  codes,
};
