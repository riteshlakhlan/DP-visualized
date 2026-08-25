import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Minimum Insertions to Make String Palindrome (Striver DP-29):
 * answer = n − LPS(s). Implemented directly as interval DP:
 *   s[i]==s[j] → dp[i+1][j-1]
 *   else       → 1 + min(dp[i+1][j], dp[i][j-1])   (insert to match an end)
 */

const schema = z.object({
  s: z.string().regex(/^[a-z]{1,7}$/),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  const n = input.s.length;
  if (mode === "bruteforce" && Math.pow(2, n) > 128)
    return "Brute force explores 2^n frontiers. Keep strings <= 7 chars for Brute Force.";
  return null;
}

const AXIS = (s: string) => ({
  rowsTitle: "start index i",
  colsTitle: "end index j",
  rowLabels: [...s.split("")],
  colLabels: [...s.split("")],
});

function genBrute(input: In): GeneratedTrace {
  const s = input.s;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<string>();

  function f(i: number, j: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i >= j) {
      b.push("base-case", [Math.min(i, s.length - 1), Math.max(j, 0)], "Single char or empty range → already a palindrome, 0 inserts.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    const dup = seen.has(`${i},${j}`);
    const match = s[i] === s[j];
    b.push("recurse-call", [i, j],
      dup ? `f(${i},${j}) called AGAIN.` : `f(${i},${j}) called: ends '${s[i]}' vs '${s[j]}' (${match ? "MATCH" : "no match"}).`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: match ? "match" : "recurse" });
    seen.add(`${i},${j}`);
    let v: number;
    let deps: number[][];
    if (match) {
      v = f(i + 1, j - 1, callId);
      deps = [[i + 1, j - 1]];
      b.push("recurse-return", [i, j], `'${s[i]}' == '${s[j]}' → no insert needed here: f(${i},${j}) = ${v}.`, { callId, parentCallId, value: v, deps, codeAnchor: "match" });
    } else {
      const addLeft = f(i, j - 1, callId);   // insert s[j] on the left
      const addRight = f(i + 1, j, callId);  // insert s[i] on the right
      v = 1 + Math.min(addLeft, addRight);
      deps = [[i, j - 1], [i + 1, j]];
      b.push("recurse-return", [i, j], `Mismatch → 1 + min(insert '${s[j]}' left: ${addLeft}, insert '${s[i]}' right: ${addRight}) = ${v}.`, {
        callId, parentCallId, value: v, deps, codeAnchor: "nomatch",
      });
    }
    return v;
  }

  const answer = f(0, s.length - 1);
  return {
    steps: b.steps,
    meta: { mode: "bruteforce", answer, answerLabel: "min insertions", tableShape: null, axisLabels: null, valueFormat: "int", stats: { steps: b.count, calls } },
  };
}

function genMemo(input: In): GeneratedTrace {
  const s = input.s;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, j: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i >= j) return 0;
    b.push("recurse-call", [i, j], `f(${i},${j}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
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
      v = f(i + 1, j - 1, callId);
      deps = [[i + 1, j - 1]];
    } else {
      v = 1 + Math.min(f(i, j - 1, callId), f(i + 1, j, callId));
      deps = [[i, j - 1], [i + 1, j]];
    }
    memo.set(kk, v);
    b.push("recurse-return", [i, j], `f(${i},${j}) = ${v}, stored in memo.`, { callId, parentCallId, value: v, deps, codeAnchor: "memoStore" });
    return v;
  }

  const answer = f(0, s.length - 1);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "min insertions",
      tableShape: { rows: s.length, cols: s.length },
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

  for (let i = n - 1; i >= 0; i--)
    for (let j = i; j < n; j++) {
      let v: number;
      let deps: number[][];
      if (i >= j) {
        v = 0;
        deps = [];
        b.push("base-case", [i, j], "Single char / empty → 0 inserts.", { value: 0, deps, codeAnchor: "base" });
      } else if (s[i] === s[j]) {
        v = i + 1 <= j - 1 ? dp[i + 1][j - 1] : 0;
        deps = [[i + 1, j - 1]];
        b.push("table-write", [i, j], `'${s[i]}' == '${s[j]}' → inherit inner: dp[${i}][${j}] = ${v}.`, { value: v, deps, codeAnchor: "match" });
      } else {
        v = 1 + Math.min(dp[i][j - 1], dp[i + 1][j]);
        deps = [[i, j - 1], [i + 1, j]];
        b.push("table-write", [i, j],
          `'${s[i]}' != '${s[j]}' → 1 + min(insert-left dp[${i}][${j - 1}]=${dp[i][j - 1]}, insert-right dp[${i + 1}][${j}]=${dp[i + 1][j]}) = ${v}.`,
          { value: v, deps, codeAnchor: "nomatch" });
      }
      dp[i][j] = v;
    }

  const answer = dp[0][n - 1];
  b.push("table-read", [0, n - 1], `Answer at top-right: dp[0][${n - 1}] = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "min insertions",
      tableShape: { rows: n, cols: n },
      axisLabels: AXIS(s),
      valueFormat: "int",
      stats: { steps: b.count, writes: ((n * (n + 1)) / 2) + 1 },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const s = input.s;
  const n = s.length;
  const b = new TraceBuilder();

  let next = new Array(n).fill(0);
  for (let i = 0; i < n; i++)
    b.push("base-case", [n - 1, i], "Bottom row all zeros — two rows replace the matrix.", { value: 0, codeAnchor: "init" });

  for (let i = n - 1; i >= 0; i--) {
    const cur = new Array(n).fill(0);
    for (let j = i; j < n; j++) {
      let v: number;
      let deps: number[][];
      if (i >= j) {
        v = 0;
        deps = [];
        b.push("table-write", [i, j], "Diagonal/empty → 0.", { value: 0, deps, codeAnchor: "base" });
      } else if (s[i] === s[j]) {
        v = i + 1 <= j - 1 ? next[j - 1] : 0;
        deps = [[i + 1, j - 1]];
        b.push("table-write", [i, j], `Match → cur[${j}] = next[${j - 1}] = ${v}.`, { value: v, deps, codeAnchor: "match" });
      } else {
        v = 1 + Math.min(cur[j - 1], next[j]);
        deps = [[i, j - 1], [i + 1, j]];
        b.push("table-write", [i, j], `1 + min(cur[${j - 1}]=${cur[j - 1]}, next[${j}]=${next[j]}) = ${v}.`, { value: v, deps, codeAnchor: "nomatch" });
      }
      cur[j] = v;
    }
    next = cur;
  }

  const answer = next[n - 1];
  b.push("table-read", [0, n - 1], `Answer survives in the last row: ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer,
      answerLabel: "min insertions",
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
    if (i >= j) return 0;                      // base
    if (s[i] == s[j])
        return f(i + 1, j - 1, s);             // match
    // nomatch: insert a matching char at either end
    return 1 + min(f(i, j - 1, s),             // recurse
                   f(i + 1, j, s));
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore`,
      { base: "// base", match: "// match", recurse: "// recurse", nomatch: "// nomatch", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore" },
    ),
    java: withAnchors(
`static int f(int i, int j, String s) {
    if (i >= j) return 0;                       // base
    if (s.charAt(i) == s.charAt(j))
        return f(i + 1, j - 1, s);              // match
    // nomatch: insert a matching char at either end
    return 1 + Math.min(f(i, j - 1, s),         // recurse
                        f(i + 1, j, s));
}
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore`,
      { base: "// base", match: "// match", recurse: "// recurse", nomatch: "// nomatch", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore" },
    ),
    python: withAnchors(
`def f(i, j, s):
    if i >= j:                            # base
        return 0
    if s[i] == s[j]:
        return f(i + 1, j - 1, s)         # match
    # nomatch: insert a matching char at either end
    return 1 + min(f(i, j - 1, s),        # recurse
                   f(i + 1, j, s))
# anchor: driver
# anchor: init
# anchor: memoCheck
# anchor: memoStore`,
      { base: "# base", match: "# match", recurse: "# recurse", nomatch: "# nomatch", driver: "# anchor: driver", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore" },
    ),
    js: withAnchors(
`function f(i, j, s) {
  if (i >= j) return 0;                     // base
  if (s[i] === s[j])
    return f(i + 1, j - 1, s);              // match
  // nomatch: insert a matching char at either end
  return 1 + Math.min(f(i, j - 1, s),       // recurse
                      f(i + 1, j, s));
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
    if (i >= j) return 0;                          // base
    if (memo[i][j] != -1) return memo[i][j];       // memo check
    if (s[i] == s[j])
        memo[i][j] = f(i + 1, j - 1, s, memo);     // match
    else
        memo[i][j] = 1 + min(f(i, j - 1, s, memo),     // recurse
                             f(i + 1, j, s, memo));
    return memo[i][j];                             // memo store
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
    if (i >= j) return 0;                           // base
    if (memo[i][j] != -1) return memo[i][j];        // memo check
    if (s.charAt(i) == s.charAt(j))
        memo[i][j] = f(i + 1, j - 1, s, memo);      // match
    else
        memo[i][j] = 1 + Math.min(f(i, j - 1, s, memo),
                                  f(i + 1, j, s, memo)); // recurse
    return memo[i][j];                              // memo store
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
    if i >= j:                                # base
        return 0
    if memo[i][j] != -1:                      # memo check
        return memo[i][j]
    if s[i] == s[j]:
        memo[i][j] = f(i + 1, j - 1, s, memo)     # match
    else:
        memo[i][j] = 1 + min(f(i, j - 1, s, memo),
                             f(i + 1, j, s, memo))    # recurse
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
  if (i >= j) return 0;                            // base
  if (memo[i][j] !== -1) return memo[i][j];        // memo check
  if (s[i] === s[j])
    memo[i][j] = f(i + 1, j - 1, s, memo);         // match
  else
    memo[i][j] = 1 + Math.min(f(i, j - 1, s, memo),
                              f(i + 1, j, s, memo)); // recurse
  return memo[i][j];                               // memo store
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
`int minInsertions(string& s) {
    int n = s.size();
    vector<vector<int>> dp(n, vector<int>(n, 0));
    for (int i = n - 1; i >= 0; --i)
        for (int j = i; j < n; ++j) {
            if (i >= j)
                dp[i][j] = 0;                                  // base
            else if (s[i] == s[j])
                dp[i][j] = (i + 1 <= j - 1) ? dp[i + 1][j - 1] : 0;   // match
            else
                dp[i][j] = 1 + min(dp[i][j - 1],               // transition
                                   dp[i + 1][j]);
        }
    return dp[0][n - 1];
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
`static int minInsertions(String s) {
    int n = s.length();
    int[][] dp = new int[n][n];
    for (int i = n - 1; i >= 0; --i)
        for (int j = i; j < n; ++j) {
            if (i >= j)
                dp[i][j] = 0;                                   // base
            else if (s.charAt(i) == s.charAt(j))
                dp[i][j] = (i + 1 <= j - 1) ? dp[i + 1][j - 1] : 0;    // match
            else
                dp[i][j] = 1 + Math.min(dp[i][j - 1],           // transition
                                        dp[i + 1][j]);
        }
    return dp[0][n - 1];
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
`def min_insertions(s):
    n = len(s)
    dp = [[0] * n for _ in range(n)]
    for i in range(n - 1, -1, -1):
        for j in range(i, n):
            if i >= j:
                dp[i][j] = 0                                    # base
            elif s[i] == s[j]:
                dp[i][j] = dp[i + 1][j - 1] if i + 1 <= j - 1 else 0   # match
            else:
                dp[i][j] = 1 + min(dp[i][j - 1],                # transition
                                   dp[i + 1][j])
    return dp[0][n - 1]
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
# nomatch
# driver`,
      { base: "# base", match: "# match", nomatch: "# nomatch", transition: "# transition", driver: "# driver", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function minInsertions(s) {
  const n = s.length;
  const dp = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = i; j < n; j++) {
      if (i >= j)
        dp[i][j] = 0;                                            // base
      else if (s[i] === s[j])
        dp[i][j] = i + 1 <= j - 1 ? dp[i + 1][j - 1] : 0;        // match
      else
        dp[i][j] = 1 + Math.min(dp[i][j - 1],                    // transition
                                dp[i + 1][j]);
    }
  return dp[0][n - 1];
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
`int minInsertions(string& s) {
    int n = s.size();
    vector<int> next(n, 0), cur(n, 0);              // init
    for (int i = n - 1; i >= 0; --i) {
        fill(cur.begin(), cur.end(), 0);
        for (int j = i; j < n; ++j) {
            if (i >= j)
                cur[j] = 0;                                          // base
            else if (s[i] == s[j])
                cur[j] = (i + 1 <= j - 1) ? next[j - 1] : 0;         // match
            else
                cur[j] = 1 + min(cur[j - 1], next[j]);               // transition
        }
        next = cur;
    }
    return next[n - 1];
}
// anchor: memoCheck
// anchor: memoStore
// anchor: nomatch
// anchor: recurse
// driver`,
      { init: "// init", base: "// base", match: "// match", transition: "// transition", driver: "// driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", nomatch: "// anchor: nomatch", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int minInsertions(String s) {
    int n = s.length();
    int[] next = new int[n], cur = new int[n];      // init
    for (int i = n - 1; i >= 0; --i) {
        Arrays.fill(cur, 0);
        for (int j = i; j < n; ++j) {
            if (i >= j)
                cur[j] = 0;                                         // base
            else if (s.charAt(i) == s.charAt(j))
                cur[j] = (i + 1 <= j - 1) ? next[j - 1] : 0;        // match
            else
                cur[j] = 1 + Math.min(cur[j - 1], next[j]);         // transition
        }
        next = cur;
    }
    return next[n - 1];
}
// anchor: memoCheck
// anchor: memoStore
// anchor: nomatch
// anchor: recurse
// driver`,
      { init: "// init", base: "// base", match: "// match", transition: "// transition", driver: "// driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", nomatch: "// anchor: nomatch", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def min_insertions(s):
    n = len(s)
    nxt = [0] * n                                 # init
    for i in range(n - 1, -1, -1):
        cur = [0] * n
        for j in range(i, n):
            if i >= j:
                cur[j] = 0                                            # base
            elif s[i] == s[j]:
                cur[j] = nxt[j - 1] if i + 1 <= j - 1 else 0          # match
            else:
                cur[j] = 1 + min(cur[j - 1], nxt[j])                  # transition
        nxt = cur
    return nxt[n - 1]
# anchor: memoCheck
# anchor: memoStore
# anchor: nomatch
# anchor: recurse
# driver`,
      { init: "# init", base: "# base", match: "# match", transition: "# transition", driver: "# driver", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", nomatch: "# anchor: nomatch", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function minInsertions(s) {
  const n = s.length;
  let next = new Array(n).fill(0);             // init
  for (let i = n - 1; i >= 0; i--) {
    const cur = new Array(n).fill(0);
    for (let j = i; j < n; j++) {
      if (i >= j)
        cur[j] = 0;                                             // base
      else if (s[i] === s[j])
        cur[j] = i + 1 <= j - 1 ? next[j - 1] : 0;              // match
      else
        cur[j] = 1 + Math.min(cur[j - 1], next[j]);             // transition
    }
    next = cur;
  }
  return next[n - 1];
}
// anchor: memoCheck
// anchor: memoStore
// anchor: nomatch
// anchor: recurse
// driver`,
      { init: "// init", base: "// base", match: "// match", transition: "// transition", driver: "// driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", nomatch: "// anchor: nomatch", recurse: "// anchor: recurse" },
    ),
  },
};

export const minInsertionsPalindrome: ProblemServiceDef = {
  slug: "min-insertions-palindrome",
  patternSlug: "dp-strings",
  inputDescriptor: [
    { key: "s", label: "STRING", kind: "stringPair", min: 1, max: 6 },
  ],
  schema,
  defaultInput: { s: "abcaa" }, // LeetCode 1312 classic → 2
  randomInput: () => ({
    s: Array.from({ length: 3 + Math.floor(Math.random() * 4) }, () => "ab"[Math.floor(Math.random() * 2)]).join(""),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : mode === "tabulation" ? genTab(input as In) : genSpace(input as In),
  codes,
};
