import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Minimum/Maximum Falling Path Sum (Striver DP-12): start anywhere in row 0,
 * fall straight/down-left/down-right each row, collecting cell values.
 * We visualize the MINIMUM variant; the max only flips min→max.
 */

const schema = z.object({
  grid: z.array(z.array(z.number().int().min(1).max(9)).min(2).max(7)).min(2).max(7),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && input.grid.length > 4)
    return "Pure recursion branches ~3 ways per row from every start column. Keep at most 4 rows for Brute Force, or switch to Memoization.";
  return null;
}

const AXIS = { rowsTitle: "r (row)", colsTitle: "c (col)" };

/** valid falling moves from (r,c): the three cells directly below */
function below(c: number, n: number): number[] {
  return [c - 1, c, c + 1].filter((x) => x >= 0 && x < n);
}

function genBrute(input: In): GeneratedTrace {
  const g = input.grid;
  const m = g.length;
  const n = g[0].length;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<string>();

  function f(r: number, c: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (r === m - 1) {
      b.push("base-case", [r, c], `Base case: bottom row → f(${m - 1},${c}) = ${g[r][c]}.`, { callId, parentCallId, value: g[r][c], codeAnchor: "base" });
      return g[r][c];
    }
    const kk = `${r},${c}`;
    const dup = seen.has(kk);
    b.push("recurse-call", [r, c],
      dup ? `f(${r},${c}) called AGAIN — overlapping subproblem across different start columns.`
          : `f(${r},${c}) called: cheapest fall from (${r},${c}) to the bottom.`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(kk);
    const kids = below(c, n);
    const parts: string[] = [];
    let best = Infinity;
    for (const cc of kids) {
      const sub = f(r + 1, cc, callId);
      parts.push(`${g[r][c]}+${sub}`);
      best = Math.min(best, sub);
    }
    const v = g[r][c] + best;
    b.push("recurse-return", [r, c], `f(${r},${c}) = ${g[r][c]} + min over below = ${v}.`, {
      callId,
      parentCallId,
      value: v,
      deps: kids.map((cc) => [r + 1, cc]),
      codeAnchor: "combine",
    });
    return v;
  }

  b.push("base-case", [0, 0], `A path may START in ANY column of row 0 — every one is traced in turn.`, { codeAnchor: "driver" });
  let answer = Infinity;
  for (let c = 0; c < n; c++) answer = Math.min(answer, f(0, c));
  b.push("base-case", [0, 0], `Best over all start columns: ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "bruteforce",
      answer,
      answerLabel: "min falling path sum",
      tableShape: null,
      axisLabels: null,
      valueFormat: "int",
      stats: { steps: b.count, calls },
    },
  };
}

function genMemo(input: In): GeneratedTrace {
  const g = input.grid;
  const m = g.length;
  const n = g[0].length;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(r: number, c: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [r, c], `f(${r},${c}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (r === m - 1) {
      b.push("base-case", [r, c], `Base case: bottom row = ${g[r][c]}.`, { callId, parentCallId, value: g[r][c], codeAnchor: "base" });
      return g[r][c];
    }
    const kk = `${r},${c}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [r, c], `Memo hit! f(${r},${c}) = ${v} fetched instantly.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    const kids = below(c, n);
    const parts: string[] = [];
    let best = Infinity;
    for (const cc of kids) {
      const sub = f(r + 1, cc, callId);
      parts.push(`${sub}`);
      best = Math.min(best, sub);
    }
    const v = g[r][c] + best;
    memo.set(kk, v);
    b.push("recurse-return", [r, c], `f(${r},${c}) = ${g[r][c]} + min(${parts.join(", ")}) = ${v}, stored in memo.`, {
      callId,
      parentCallId,
      value: v,
      deps: kids.map((cc) => [r + 1, cc]),
      codeAnchor: "memoStore",
    });
    return v;
  }

  let answer = Infinity;
  for (let c = 0; c < n; c++) answer = Math.min(answer, f(0, c));
  b.push("base-case", [0, 0], `Best over all row-0 columns: ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "min falling path sum",
      tableShape: { rows: m, cols: n },
      axisLabels: AXIS,
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const g = input.grid;
  const m = g.length;
  const n = g[0].length;
  const b = new TraceBuilder();
  const dp: number[][] = Array.from({ length: m }, () => new Array(n).fill(-1));

  for (let c = 0; c < n; c++) {
    dp[m - 1][c] = g[m - 1][c];
    b.push("base-case", [m - 1, c], `Base case: dp[${m - 1}][${c}] = ${g[m - 1][c]} (bottom row copies the grid).`, { value: g[m - 1][c], codeAnchor: "base" });
  }
  for (let r = m - 2; r >= 0; r--)
    for (let c = 0; c < n; c++) {
      const kids = below(c, n);
      const vals = kids.map((cc) => dp[r + 1][cc]);
      const best = Math.min(...vals);
      const v = g[r][c] + best;
      const kidStr = kids.map((cc, idx) => `dp[${r + 1}][${cc}]=${vals[idx]}`).join(", ");
      b.push("table-write", [r, c],
        `dp[${r}][${c}] = ${g[r][c]} + min(${kidStr}) = ${v}.`,
        { value: v, deps: kids.map((cc) => [r + 1, cc]), codeAnchor: "transition" });
      dp[r][c] = v;
    }

  const answer = Math.min(...dp[0]);
  const argmin = dp[0].indexOf(answer);
  b.push("table-write", [0, argmin], `Answer = smallest entry of row 0 → dp[0][${argmin}] = ${answer}.`, { value: answer, codeAnchor: "transition" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "min falling path sum",
      tableShape: { rows: m, cols: n },
      axisLabels: AXIS,
      valueFormat: "int",
      stats: { steps: b.count, writes: m * n + 1 },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const g = input.grid;
  const m = g.length;
  const n = g[0].length;
  const b = new TraceBuilder();

  let next = [...g[m - 1]];
  for (let c = 0; c < n; c++)
    b.push("base-case", [m - 1, c], `next[${c}] = ${g[m - 1][c]} — only the row BELOW is ever kept.`, { value: g[m - 1][c], codeAnchor: "init" });

  for (let r = m - 2; r >= 0; r--) {
    const cur = new Array(n).fill(0);
    for (let c = 0; c < n; c++) {
      const kids = below(c, n);
      const best = Math.min(...kids.map((cc) => next[cc]));
      cur[c] = g[r][c] + best;
      b.push("table-write", [r, c], `cur[${c}] = ${g[r][c]} + min(below row) = ${cur[c]}; two 1D arrays total.`, {
        value: cur[c],
        deps: kids.map((cc) => [r + 1, cc]),
        codeAnchor: "transition",
      });
    }
    next = cur;
  }

  const answer = Math.min(...next);
  b.push("table-write", [0, next.indexOf(answer)], `Answer = min of final array = ${answer}.`, { value: answer, codeAnchor: "transition" });

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer,
      answerLabel: "min falling path sum",
      tableShape: { rows: m, cols: n },
      axisLabels: AXIS,
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: m * n + 1 },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int r, int c, vector<vector<int>>& g) {
    int m = g.size(), n = g[0].size();
    if (r == m - 1) return g[r][c];              // base
    int best = INT_MAX;
    for (int dc = -1; dc <= 1; ++dc)             // recurse
        if (c + dc >= 0 && c + dc < n)
            best = min(best, f(r + 1, c + dc, g));
    return g[r][c] + best;                       // combine
}
// driver: min over f(0, c) for every column c
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int r, int c, int[][] g) {
    int m = g.length, n = g[0].length;
    if (r == m - 1) return g[r][c];               // base
    int best = Integer.MAX_VALUE;
    for (int dc = -1; dc <= 1; ++dc)              // recurse
        if (c + dc >= 0 && c + dc < n)
            best = Math.min(best, f(r + 1, c + dc, g));
    return g[r][c] + best;                        // combine
}
// driver: answer = min over f(0, c) for every column c
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(r, c, g):
    m, n = len(g), len(g[0])
    if r == m - 1:                          # base
        return g[r][c]
    best = math.inf
    for dc in (-1, 0, 1):                   # recurse
        if 0 <= c + dc < n:
            best = min(best, f(r + 1, c + dc, g))
    return g[r][c] + best                   # combine

# driver: answer = min over f(0, c) for every column c
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: transition`,
      { base: "# base", recurse: "# recurse", combine: "# combine", driver: "# driver", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(r, c, g) {
  const m = g.length, n = g[0].length;
  if (r === m - 1) return g[r][c];            // base
  let best = Infinity;
  for (const dc of [-1, 0, 1])                // recurse
    if (c + dc >= 0 && c + dc < n)
      best = Math.min(best, f(r + 1, c + dc, g));
  return g[r][c] + best;                      // combine
}
// driver: answer = min over f(0, c) for every column c
// anchor: memoCheck
// anchor: memoStore
// anchor: transition
// anchor: init`,
      { base: "// base", recurse: "// recurse", combine: "// combine", driver: "// driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition", init: "// anchor: init" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int r, int c, vector<vector<int>>& g, vector<vector<int>>& memo) {
    int m = g.size(), n = g[0].size();
    if (r == m - 1) return g[r][c];               // base
    if (memo[r][c] != -1) return memo[r][c];      // memo check
    int best = INT_MAX;
    for (int dc = -1; dc <= 1; ++dc)              // recurse
        if (c + dc >= 0 && c + dc < n)
            best = min(best, f(r + 1, c + dc, g, memo));
    return memo[r][c] = g[r][c] + best;           // memo store
}
// driver: take min over all row-0 columns
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// driver", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int r, int c, int[][] g, int[][] memo) {
    int m = g.length, n = g[0].length;
    if (r == m - 1) return g[r][c];               // base
    if (memo[r][c] != -1) return memo[r][c];      // memo check
    int best = Integer.MAX_VALUE;
    for (int dc = -1; dc <= 1; ++dc)              // recurse
        if (c + dc >= 0 && c + dc < n)
            best = Math.min(best, f(r + 1, c + dc, g, memo));
    return memo[r][c] = g[r][c] + best;           // memo store
}
// driver: take min over all row-0 columns
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// driver", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(r, c, g, memo):
    m, n = len(g), len(g[0])
    if r == m - 1:                            # base
        return g[r][c]
    if memo[r][c] != -1:                      # memo check
        return memo[r][c]
    best = math.inf
    for dc in (-1, 0, 1):                     # recurse
        if 0 <= c + dc < n:
            best = min(best, f(r + 1, c + dc, g, memo))
    memo[r][c] = g[r][c] + best
    return memo[r][c]                         # memo store

# driver: take min over all row-0 columns
# anchor: combine
# anchor: init
# anchor: transition
# memoCheck
# memoStore`,
      { base: "# base", recurse: "# recurse", memoCheck: "# memoCheck", memoStore: "# memoStore", driver: "# driver", combine: "# anchor: combine", init: "# anchor: init", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(r, c, g, memo) {
  const m = g.length, n = g[0].length;
  if (r === m - 1) return g[r][c];              // base
  if (memo[r][c] !== -1) return memo[r][c];     // memo check
  let best = Infinity;
  for (const dc of [-1, 0, 1])                  // recurse
    if (c + dc >= 0 && c + dc < n)
      best = Math.min(best, f(r + 1, c + dc, g, memo));
  memo[r][c] = g[r][c] + best;
  return memo[r][c];                            // memo store
}
// driver: take min over all row-0 columns
// anchor: combine
// anchor: transition
// memoCheck
// memoStore
// anchor: init`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// driver", combine: "// anchor: combine", transition: "// anchor: transition", init: "// anchor: init" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int minFallingPathSum(vector<vector<int>>& g) {
    int m = g.size(), n = g[0].size();
    vector<vector<int>> dp = g;                    // base: last row copied
    for (int r = m - 2; r >= 0; --r)
        for (int c = 0; c < n; ++c) {
            int best = dp[r + 1][c];               // transition
            if (c > 0) best = min(best, dp[r + 1][c - 1]);
            if (c + 1 < n) best = min(best, dp[r + 1][c + 1]);
            dp[r][c] = g[r][c] + best;
        }
    return *min_element(dp[0].begin(), dp[0].end());
}
// anchor: combine
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int minFallingPathSum(int[][] g) {
    int m = g.length, n = g[0].length;
    int[][] dp = new int[m][];
    for (int i = 0; i < m; ++i) dp[i] = g[i].clone();   // base: last row copied
    for (int r = m - 2; r >= 0; --r)
        for (int c = 0; c < n; ++c) {
            int best = dp[r + 1][c];                    // transition
            if (c > 0) best = Math.min(best, dp[r + 1][c - 1]);
            if (c + 1 < n) best = Math.min(best, dp[r + 1][c + 1]);
            dp[r][c] = g[r][c] + best;
        }
    return Arrays.stream(dp[0]).min().getAsInt();
}
// anchor: combine
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def min_falling_path_sum(g):
    m, n = len(g), len(g[0])
    dp = [row[:] for row in g]                  # base: last row copied
    for r in range(m - 2, -1, -1):
        for c in range(n):
            best = dp[r + 1][c]                 # transition
            if c > 0:
                best = min(best, dp[r + 1][c - 1])
            if c + 1 < n:
                best = min(best, dp[r + 1][c + 1])
            dp[r][c] = g[r][c] + best
    return min(dp[0])
# anchor: combine
# anchor: driver
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", transition: "# transition", combine: "# anchor: combine", driver: "# anchor: driver", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function minFallingPathSum(g) {
  const m = g.length, n = g[0].length;
  const dp = g.map((row) => [...row]);          // base: last row copied
  for (let r = m - 2; r >= 0; r--)
    for (let c = 0; c < n; c++) {
      let best = dp[r + 1][c];                  // transition
      if (c > 0) best = Math.min(best, dp[r + 1][c - 1]);
      if (c + 1 < n) best = Math.min(best, dp[r + 1][c + 1]);
      dp[r][c] = g[r][c] + best;
    }
  return Math.min(...dp[0]);
}
// anchor: combine
// anchor: driver
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", driver: "// anchor: driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
  spaceOptimized: {
    cpp: withAnchors(
`int minFallingPathSum(vector<vector<int>>& g) {
    int m = g.size(), n = g[0].size();
    vector<int> next(g[m - 1]);                    // init: bottom row only
    for (int r = m - 2; r >= 0; --r) {
        vector<int> cur(n);
        for (int c = 0; c < n; ++c) {
            int best = next[c];                    // transition
            if (c > 0) best = min(best, next[c - 1]);
            if (c + 1 < n) best = min(best, next[c + 1]);
            cur[c] = g[r][c] + best;
        }
        next = move(cur);
    }
    return *min_element(next.begin(), next.end());
}
// anchor: base
// anchor: combine
// anchor: driver
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", driver: "// anchor: driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int minFallingPathSum(int[][] g) {
    int m = g.length, n = g[0].length;
    int[] next = g[m - 1].clone();                 // init: bottom row only
    for (int r = m - 2; r >= 0; --r) {
        int[] cur = new int[n];
        for (int c = 0; c < n; ++c) {
            int best = next[c];                    // transition
            if (c > 0) best = Math.min(best, next[c - 1]);
            if (c + 1 < n) best = Math.min(best, next[c + 1]);
            cur[c] = g[r][c] + best;
        }
        next = cur;
    }
    return Arrays.stream(next).min().getAsInt();
}
// anchor: base
// anchor: combine
// anchor: driver
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", driver: "// anchor: driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def min_falling_path_sum(g):
    m, n = len(g), len(g[0])
    nxt = g[m - 1][:]                           # init: bottom row only
    for r in range(m - 2, -1, -1):
        cur = [0] * n
        for c in range(n):
            best = nxt[c]                       # transition
            if c > 0:
                best = min(best, nxt[c - 1])
            if c + 1 < n:
                best = min(best, nxt[c + 1])
            cur[c] = g[r][c] + best
        nxt = cur
    return min(nxt)
# anchor: base
# anchor: combine
# anchor: driver
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { init: "# init", transition: "# transition", base: "# anchor: base", combine: "# anchor: combine", driver: "# anchor: driver", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function minFallingPathSum(g) {
  const m = g.length, n = g[0].length;
  let next = [...g[m - 1]];                     // init: bottom row only
  for (let r = m - 2; r >= 0; r--) {
    const cur = new Array(n);
    for (let c = 0; c < n; c++) {
      let best = next[c];                       // transition
      if (c > 0) best = Math.min(best, next[c - 1]);
      if (c + 1 < n) best = Math.min(best, next[c + 1]);
      cur[c] = g[r][c] + best;
    }
    next = cur;
  }
  return Math.min(...next);
}
// anchor: base
// anchor: combine
// anchor: driver
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", driver: "// anchor: driver", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
};

export const minFallingPathSum: ProblemServiceDef = {
  slug: "min-falling-path-sum",
  patternSlug: "dp-grids",
  inputDescriptor: [
    { key: "grid", label: "GRID VALUES", kind: "grid", min: 2, max: 6, valueRange: [1, 9] },
  ],
  schema,
  defaultInput: {
    grid: [
      [2, 1, 3],
      [6, 5, 4],
      [7, 8, 9],
    ],
  },
  randomInput: () => ({
    grid: Array.from({ length: 2 + Math.floor(Math.random() * 4) }, () =>
      Array.from({ length: 2 + Math.floor(Math.random() * 4) }, () => 1 + Math.floor(Math.random() * 9)),
    ),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input) : mode === "memo" ? genMemo(input) : mode === "tabulation" ? genTab(input) : genSpace(input),
  codes,
};
