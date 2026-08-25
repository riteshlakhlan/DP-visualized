import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Triangle — Fixed Starting Point (Striver DP-11): walk from the apex of a
 * number triangle down to its base, each step moving to one of the two
 * adjacent cells below; minimize the collected sum.
 *
 * State f(r,c) = triangle[r][c] + min(f(r+1,c), f(r+1,c+1)).
 * The DP "table" is triangular: cell (r,c) exists only for c <= r.
 */

const schema = z
  .object({
    triangle: z.array(z.array(z.number().int().min(1).max(9))).min(2).max(7),
  })
  .refine((v) => v.triangle.every((row, r) => row.length === r + 1), {
    message: "triangle must be ragged: row i has exactly i+1 values",
  });
type In = z.infer<typeof schema>;

function limits(): string | null {
  return null;
}

const AXIS = (n: number) => ({ rowsTitle: "r (row)", colsTitle: "c (col)", colLabels: Array.from({ length: n }, (_, i) => String(i)) });

function genBrute(input: In): GeneratedTrace {
  const t = input.triangle;
  const n = t.length;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<string>();

  function f(r: number, c: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (r === n - 1) {
      b.push("base-case", [r, c], `Base case: base-row cell → f(${r},${c}) = ${t[r][c]}.`, { callId, parentCallId, value: t[r][c], codeAnchor: "base" });
      return t[r][c];
    }
    const kk = `${r},${c}`;
    const dup = seen.has(kk);
    b.push("recurse-call", [r, c],
      dup ? `f(${r},${c}) called AGAIN — this cell is reachable via several descent routes; subtree repeats.`
          : `f(${r},${c}) called: cheapest descent from here to the base.`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(kk);
    const left = f(r + 1, c, callId);
    const right = f(r + 1, c + 1, callId);
    const v = t[r][c] + Math.min(left, right);
    b.push("recurse-return", [r, c], `f(${r},${c}) = ${t[r][c]} + min(${left}, ${right}) = ${v}.`, {
      callId,
      parentCallId,
      value: v,
      deps: [[r + 1, c], [r + 1, c + 1]],
      codeAnchor: "combine",
    });
    return v;
  }

  const answer = f(0, 0);
  return {
    steps: b.steps,
    meta: {
      mode: "bruteforce",
      answer,
      answerLabel: "min apex-to-base path sum",
      tableShape: null,
      axisLabels: null,
      valueFormat: "int",
      stats: { steps: b.count, calls },
    },
  };
}

function genMemo(input: In): GeneratedTrace {
  const t = input.triangle;
  const n = t.length;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(r: number, c: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [r, c], `f(${r},${c}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (r === n - 1) {
      b.push("base-case", [r, c], `Base case: base row → ${t[r][c]}.`, { callId, parentCallId, value: t[r][c], codeAnchor: "base" });
      return t[r][c];
    }
    const kk = `${r},${c}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [r, c], `Memo hit! f(${r},${c}) = ${v} fetched instantly.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    const left = f(r + 1, c, callId);
    const right = f(r + 1, c + 1, callId);
    const v = t[r][c] + Math.min(left, right);
    memo.set(kk, v);
    b.push("recurse-return", [r, c], `f(${r},${c}) = ${t[r][c]} + min(${left}, ${right}) = ${v}, stored in memo.`, {
      callId,
      parentCallId,
      value: v,
      deps: [[r + 1, c], [r + 1, c + 1]],
      codeAnchor: "memoStore",
    });
    return v;
  }

  const answer = f(0, 0);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "min apex-to-base path sum",
      tableShape: { rows: n, cols: n },
      axisLabels: AXIS(n),
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const t = input.triangle;
  const n = t.length;
  const b = new TraceBuilder();
  const dp: number[][] = Array.from({ length: n }, (_, r) => new Array(r + 1).fill(-1));

  for (let c = 0; c < n; c++) {
    dp[n - 1][c] = t[n - 1][c];
    b.push("base-case", [n - 1, c], `Base case: dp[${n - 1}][${c}] = ${t[n - 1][c]} (base row copied).`, { value: t[n - 1][c], codeAnchor: "base" });
  }
  for (let r = n - 2; r >= 0; r--)
    for (let c = 0; c <= r; c++) {
      const best = Math.min(dp[r + 1][c], dp[r + 1][c + 1]);
      const v = t[r][c] + best;
      b.push("table-write", [r, c], `dp[${r}][${c}] = ${t[r][c]} + min(dp[${r + 1}][${c}], dp[${r + 1}][${c + 1}]) = ${t[r][c]} + ${best} = ${v}.`, {
        value: v,
        deps: [[r + 1, c], [r + 1, c + 1]],
        codeAnchor: "transition",
      });
      dp[r][c] = v;
    }

  const answer = dp[0][0];
  b.push("table-write", [0, 0], `Answer read at the apex: dp[0][0] = ${answer}.`, { value: answer, codeAnchor: "transition" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "min apex-to-base path sum",
      tableShape: { rows: n, cols: n },
      axisLabels: AXIS(n),
      valueFormat: "int",
      stats: { steps: b.count, writes: (n * (n + 1)) / 2 + 1 },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const t = input.triangle;
  const n = t.length;
  const b = new TraceBuilder();

  let next = [...t[n - 1]];
  for (let c = 0; c < n; c++)
    b.push("base-case", [n - 1, c], `front[${c}] = ${t[n - 1][c]} — a single 1D array walks up the triangle.`, { value: t[n - 1][c], codeAnchor: "init" });

  for (let r = n - 2; r >= 0; r--) {
    const cur = new Array(r + 1).fill(0);
    for (let c = 0; c <= r; c++) {
      cur[c] = t[r][c] + Math.min(next[c], next[c + 1]);
      b.push("table-write", [r, c], `cur[${c}] = ${t[r][c]} + min(${next[c]}, ${next[c + 1]}) = ${cur[c]}.`, {
        value: cur[c],
        deps: [[r + 1, c], [r + 1, c + 1]],
        codeAnchor: "transition",
      });
    }
    next = cur;
  }

  const answer = next[0];
  b.push("table-write", [0, 0], `Answer left standing at front[0] = ${answer}.`, { value: answer, codeAnchor: "transition" });

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer,
      answerLabel: "min apex-to-base path sum",
      tableShape: { rows: n, cols: n },
      axisLabels: AXIS(n),
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: (n * (n + 1)) / 2 + 1 },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int r, int c, vector<vector<int>>& t) {
    int n = t.size();
    if (r == n - 1) return t[r][c];           // base
    int down = f(r + 1, c, t);                // recurse
    int diag = f(r + 1, c + 1, t);
    return t[r][c] + min(down, diag);         // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int r, int c, List<List<Integer>> t) {
    int n = t.size();
    if (r == n - 1) return t.get(r).get(c);   // base
    int down = f(r + 1, c, t);                // recurse
    int diag = f(r + 1, c + 1, t);
    return t.get(r).get(c) + Math.min(down, diag); // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(r, c, t):
    if r == len(t) - 1:                 # base
        return t[r][c]
    down = f(r + 1, c, t)               # recurse
    diag = f(r + 1, c + 1, t)
    return t[r][c] + min(down, diag)    # combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: transition`,
      { base: "# base", recurse: "# recurse", combine: "# combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(r, c, t) {
  if (r === t.length - 1) return t[r][c];     // base
  const down = f(r + 1, c, t);                // recurse
  const diag = f(r + 1, c + 1, t);
  return t[r][c] + Math.min(down, diag);      // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int r, int c, vector<vector<int>>& t, vector<vector<int>>& memo) {
    int n = t.size();
    if (r == n - 1) return t[r][c];            // base
    if (memo[r][c] != -1) return memo[r][c];   // memo check
    int down = f(r + 1, c, t, memo);           // recurse
    int diag = f(r + 1, c + 1, t, memo);
    return memo[r][c] = t[r][c] + min(down, diag); // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int r, int c, List<List<Integer>> t, int[][] memo) {
    int n = t.size();
    if (r == n - 1) return t.get(r).get(c);    // base
    if (memo[r][c] != -1) return memo[r][c];   // memo check
    int down = f(r + 1, c, t, memo);           // recurse
    int diag = f(r + 1, c + 1, t, memo);
    return memo[r][c] = t.get(r).get(c) + Math.min(down, diag); // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(r, c, t, memo):
    if r == len(t) - 1:                  # base
        return t[r][c]
    if memo[r][c] != -1:                 # memo check
        return memo[r][c]
    down = f(r + 1, c, t, memo)          # recurse
    diag = f(r + 1, c + 1, t, memo)
    memo[r][c] = t[r][c] + min(down, diag)
    return memo[r][c]                    # memo store
# anchor: combine
# anchor: init
# anchor: transition
# memoCheck
# memoStore`,
      { base: "# base", recurse: "# recurse", memoCheck: "# memoCheck", memoStore: "# memoStore", combine: "# anchor: combine", init: "# anchor: init", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(r, c, t, memo) {
  if (r === t.length - 1) return t[r][c];       // base
  if (memo[r][c] !== -1) return memo[r][c];     // memo check
  const down = f(r + 1, c, t, memo);            // recurse
  const diag = f(r + 1, c + 1, t, memo);
  memo[r][c] = t[r][c] + Math.min(down, diag);
  return memo[r][c];                            // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int minimumPathSum(vector<vector<int>>& t) {
    int n = t.size();
    vector<vector<int>> dp(t);                     // copy; last row = base case
    for (int r = n - 2; r >= 0; --r)
        for (int c = 0; c <= r; ++c)
            dp[r][c] += min(dp[r + 1][c], dp[r + 1][c + 1]); // transition
    return dp[0][0];
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// base`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int minimumPathSum(List<List<Integer>> t) {
    int n = t.size();
    int[][] dp = new int[n][];
    for (int r = 0; r < n; ++r) dp[r] = t.get(r).stream().mapToInt(Integer::intValue).toArray();
    for (int r = n - 2; r >= 0; --r)                // base: last row kept
        for (int c = 0; c <= r; ++c)
            dp[r][c] += Math.min(dp[r + 1][c], dp[r + 1][c + 1]); // transition
    return dp[0][0];
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def minimum_path_sum(t):
    n = len(t)
    dp = [row[:] for row in t]              # base: last row kept as-is
    for r in range(n - 2, -1, -1):
        for c in range(r + 1):
            dp[r][c] += min(dp[r + 1][c],
                            dp[r + 1][c + 1])   # transition
    return dp[0][0]
# anchor: combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", transition: "# transition", combine: "# anchor: combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function minimumPathSum(t) {
  const n = t.length;
  const dp = t.map((row) => [...row]);   // base: last row kept as-is
  for (let r = n - 2; r >= 0; r--)
    for (let c = 0; c <= r; c++)
      dp[r][c] += Math.min(dp[r + 1][c], dp[r + 1][c + 1]); // transition
  return dp[0][0];
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
  spaceOptimized: {
    cpp: withAnchors(
`int minimumPathSum(vector<vector<int>>& t) {
    int n = t.size();
    vector<int> front(t[n - 1]);                   // init: base row only
    for (int r = n - 2; r >= 0; --r) {
        vector<int> cur(r + 1);
        for (int c = 0; c <= r; ++c)
            cur[c] = t[r][c] + min(front[c], front[c + 1]); // transition
        front = move(cur);
    }
    return front[0];
}
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// anchor: base`,
      { init: "// init", transition: "// transition", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse", base: "// anchor: base" },
    ),
    java: withAnchors(
`static int minimumPathSum(List<List<Integer>> t) {
    int n = t.size();
    int[] front = t.get(n - 1).stream().mapToInt(Integer::intValue).toArray(); // init
    for (int r = n - 2; r >= 0; --r) {
        int[] cur = new int[r + 1];
        for (int c = 0; c <= r; ++c)
            cur[c] = t.get(r).get(c) + Math.min(front[c], front[c + 1]); // transition
        front = cur;
    }
    return front[0];
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def minimum_path_sum(t):
    n = len(t)
    front = t[n - 1][:]                      # init: base row only
    for r in range(n - 2, -1, -1):
        cur = [0] * (r + 1)
        for c in range(r + 1):
            cur[c] = t[r][c] + min(front[c], front[c + 1])   # transition
        front = cur
    return front[0]
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
# anchor: base`,
      { init: "# init", transition: "# transition", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse", base: "# anchor: base" },
    ),
    js: withAnchors(
`function minimumPathSum(t) {
  const n = t.length;
  let front = [...t[n - 1]];                  // init: base row only
  for (let r = n - 2; r >= 0; r--) {
    const cur = new Array(r + 1);
    for (let c = 0; c <= r; c++)
      cur[c] = t[r][c] + Math.min(front[c], front[c + 1]); // transition
    front = cur;
  }
  return front[0];
}
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// anchor: base`,
      { init: "// init", transition: "// transition", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse", base: "// anchor: base" },
    ),
  },
};

export const trianglePath: ProblemServiceDef = {
  slug: "triangle-path",
  patternSlug: "dp-grids",
  inputDescriptor: [
    { key: "triangle", label: "TRIANGLE ROWS", kind: "grid", min: 2, max: 7, valueRange: [1, 9] },
  ],
  schema,
  defaultInput: {
    triangle: [[2], [3, 4], [6, 5, 7], [4, 1, 8, 3]],
  },
  randomInput: () => {
    const n = 3 + Math.floor(Math.random() * 4);
    return {
      triangle: Array.from({ length: n }, (_, r) =>
        Array.from({ length: r + 1 }, () => 1 + Math.floor(Math.random() * 9)),
      ),
    };
  },
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input) : mode === "memo" ? genMemo(input) : mode === "tabulation" ? genTab(input) : genSpace(input),
  codes,
};
