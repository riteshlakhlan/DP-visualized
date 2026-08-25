import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Count Square Submatrices with All Ones (Striver DP-56):
 * dp[i][j] = side of the largest all-1s square whose BOTTOM-RIGHT corner is
 * at (i,j) = 1 + min(up, left, diag) when cell==1. Sum of dp = total count.
 */

const schema = z.object({
  grid: z.array(z.array(z.number().int().min(0).max(1)).min(2).max(6)).min(2).max(6),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  const cells = input.grid.length * input.grid[0].length;
  if (mode === "bruteforce" && cells > 25)
    return "Brute force enumerates every square. Keep grids at most 5 x 5.";
  return null;
}

const axisFor = (r: number, c: number) => ({
  rowsTitle: "i", colsTitle: "j",
  rowLabels: Array.from({ length: r }, (_, i) => String(i)),
  colLabels: Array.from({ length: c }, (_, j) => String(j)),
});

function genBrute(input: In): GeneratedTrace {
  const g = input.grid;
  const rows = g.length, cols = g[0].length;
  const b = new TraceBuilder();
  let answer = 0;

  const maxSquareAt = (i: number, j: number): number => {
    let s = 0;
    while (i + s < rows && j + s < cols) {
      let ok = true;
      for (let x = i; x <= i + s && ok; x++)
        for (let y = j; y <= j + s && ok; y++)
          if (g[x][y] === 0) ok = false;
      if (!ok) break;
      s++;
    }
    return s; // number of squares with top-left (i,j)
  };

  b.push("base-case", [0, 0], "Count every all-1s square by its top-left corner.", { codeAnchor: "driver" });
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const cnt = maxSquareAt(i, j);
      if (cnt > 0)
        b.push("table-write", [i, j], `${cnt} square(s) have top-left (${i},${j}).`, { value: g[i][j], codeAnchor: "transition" });
      answer += cnt;
    }
  b.push("table-read", [rows - 1, cols - 1], `Total squares of 1s = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: { mode: "bruteforce", answer, answerLabel: "square submatrices", tableShape: { rows, cols }, axisLabels: axisFor(rows, cols), valueFormat: "int", stats: { steps: b.count } },
  };
}

function genMemo(input: In): GeneratedTrace {
  const g = input.grid;
  const rows = g.length, cols = g[0].length;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0, hits = 0;

  function f(i: number, j: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i >= rows || j >= cols) return 0;
    b.push("recurse-call", [i, j], `f(${i},${j}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    const kk = `${i},${j}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [i, j], `Memo hit! f(${i},${j}) = ${v}.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    let v = 0;
    if (g[i][j] === 1)
      v = 1 + Math.min(f(i + 1, j), f(i, j + 1), f(i + 1, j + 1));
    memo.set(kk, v);
    b.push("recurse-return", [i, j],
      g[i][j] === 1 ? `dp[${i}][${j}] = ${v}, stored.` : `Cell is 0 → dp = 0.`,
      { callId, parentCallId, value: v,
        deps: g[i][j] === 1 ? [[Math.min(i + 1, rows - 1), j], [i, Math.min(j + 1, cols - 1)], [Math.min(i + 1, rows - 1), Math.min(j + 1, cols - 1)]] : [],
        codeAnchor: "memoStore" });
    return v;
  }

  let answer = 0;
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) answer += f(i, j);
  b.push("table-read", [rows - 1, cols - 1], `Sum of dp over the whole grid = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "memo", answer, answerLabel: "square submatrices",
      tableShape: { rows, cols }, axisLabels: axisFor(rows, cols), valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const g = input.grid;
  const rows = g.length, cols = g[0].length;
  const b = new TraceBuilder();
  const dp: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1));

  let answer = 0;
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      if (g[i][j] === 0) {
        dp[i][j] = 0;
        continue;
      }
      const up = i > 0 ? dp[i - 1][j] : 0;
      const left = j > 0 ? dp[i][j - 1] : 0;
      const diag = i > 0 && j > 0 ? dp[i - 1][j - 1] : 0;
      dp[i][j] = 1 + Math.min(up, left, diag);
      answer += dp[i][j];
      b.push("table-write", [i, j],
        `dp[${i}][${j}] = 1 + min(up ${up}, left ${left}, diag ${diag}) = ${dp[i][j]} (squares ending here).`,
        { value: dp[i][j], deps: [[Math.max(0, i - 1), j], [i, Math.max(0, j - 1)], [Math.max(0, i - 1), Math.max(0, j - 1)]], codeAnchor: "transition" });
    }

  b.push("table-read", [rows - 1, cols - 1], `Total squares = sum of dp = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation", answer, answerLabel: "square submatrices",
      tableShape: { rows, cols }, axisLabels: axisFor(rows, cols), valueFormat: "int",
      stats: { steps: b.count, writes: rows * cols + 1 },
    },
  };
}

export const countSquareSubmatrices: ProblemServiceDef = {
  slug: "count-square-submatrices",
  patternSlug: "dp-squares",
  inputDescriptor: [
    { key: "grid", label: "GRID (1=one)", kind: "grid", min: 2, max: 6, valueRange: [0, 1] },
  ],
  schema,
  defaultInput: {
    grid: [
      [0, 1, 1, 1],
      [1, 1, 1, 1],
      [0, 1, 1, 1],
    ],
  }, // LC1277 → 15
  randomInput: () => ({
    grid: Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () =>
      Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => (Math.random() < 0.7 ? 1 : 0))),
  }),
  limitsPerMode: {
    bruteforce: limits,
    memo: () => null,
    tabulation: () => null,
    spaceOptimized: () => "Rolling-row works but hides the beautiful full min(up,left,diag) table — use Memoization or Tabulation.",
  },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : genTab(input as In),
  codes: {
    bruteforce: {
      cpp: withAnchors(`int countSquares(vector<vector<int>>& g) {\n    int R = g.size(), C = g[0].size(), ans = 0;\n    for (int i = 0; i < R; ++i)\n        for (int j = 0; j < C; ++j)\n            for (int s = 1; i + s <= R && j + s <= C; ++s)\n                if (allOnes(g, i, j, s)) ans++;   // transition\n    return ans;\n}`, { transition: "ans++" }),
      java: withAnchors(`static int countSquares(int[][] g) {\n    int R = g.length, C = g[0].length, ans = 0;\n    for (int i = 0; i < R; ++i)\n        for (int j = 0; j < C; ++j)\n            for (int s = 1; i + s <= R && j + s <= C; ++s)\n                if (allOnes(g, i, j, s)) ans++;\n    return ans;\n}`, {}),
      python: withAnchors(`def count_squares(g):\n    R, C = len(g), len(g[0])\n    ans = 0\n    for i in range(R):\n        for j in range(C):\n            s = 1\n            while i+s <= R and j+s <= C and all(\n                    g[x][y] for x in range(i,i+s) for y in range(j,j+s)):\n                ans += 1; s += 1\n    return ans`, {}),
      js: withAnchors(`function countSquares(g) {\n  const R = g.length, C = g[0].length;\n  let ans = 0;\n  for (let i = 0; i < R; i++)\n    for (let j = 0; j < C; j++) {\n      let s = 1;\n      while (i + s <= R && j + s <= C) {\n        let ok = true;\n        for (let x = i; x < i + s && ok; x++)\n          for (let y = j; y < j + s && ok; y++)\n            if (!g[x][y]) ok = false;\n        if (!ok) break;\n        ans++; s++;\n      }\n    }\n  return ans;\n}`, {}),
    },
    memoization: {
      cpp: withAnchors(`long long f(int i, int j, vector<vector<int>>& g, vector<vector<long long>>& m) {\n    if (i >= (int)g.size() || j >= (int)g[0].size()) return 0;  // base\n    if (m[i][j] != -1) return m[i][j];                          // memo check\n    long long v = 0;\n    if (g[i][j] == 1)\n        v = 1 + min({f(i+1,j,g,m), f(i,j+1,g,m), f(i+1,j+1,g,m)});\n    return m[i][j] = v;                                         // memo store\n}\n// driver: sum f(i,j) over the grid`, { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store" }),
      java: withAnchors(`static long f(int i, int j, int[][] g, long[][] m) {\n    if (i >= g.length || j >= g[0].length) return 0;   // base\n    if (m[i][j] != -1) return m[i][j];                 // memo check\n    long v = 0;\n    if (g[i][j] == 1)\n        v = 1 + Math.min(Math.min(f(i+1,j,g,m), f(i,j+1,g,m)), f(i+1,j+1,g,m));\n    return m[i][j] = v;                                // memo store\n}\n// driver: sum f over grid`, { base: "base", memoCheck: "memo check", memoStore: "memo store" }),
      python: withAnchors(`def f(i, j, g, memo):                       # memoized helper\n    if i >= len(g) or j >= len(g[0]):       # base\n        return 0\n    if memo[i][j] != -1:                    # memo check\n        return memo[i][j]\n    v = 1 + min(f(i+1,j,g,memo), f(i,j+1,g,memo),\n                f(i+1,j+1,g,memo)) if g[i][j] else 0\n    memo[i][j] = v\n    return v                                # memo store\n# driver: sum f(i, j) over the grid`, { recurse: "recurse" }),
      js: withAnchors(`function f(i, j, g, memo) {\n  if (i >= g.length || j >= g[0].length) return 0;   // base\n  if (memo[i][j] !== -1) return memo[i][j];          // memo check\n  let v = 0;\n  if (g[i][j] === 1)\n    v = 1 + Math.min(f(i+1,j,g,memo), f(i,j+1,g,memo), f(i+1,j+1,g,memo));\n  memo[i][j] = v;\n  return v;                                          // memo store\n}\n// driver: sum f(i, j) over the grid`, {}),
    },
    tabulation: {
      cpp: withAnchors(`int countSquares(vector<vector<int>>& g) {\n    int R = g.size(), C = g[0].size(), ans = 0;\n    vector<vector<int>> dp(R, vector<int>(C, 0));\n    for (int i = 0; i < R; ++i)\n        for (int j = 0; j < C; ++j) {\n            if (g[i][j] == 1) {\n                int up = i ? dp[i-1][j] : 0;\n                int lf = j ? dp[i][j-1] : 0;\n                int dg = (i && j) ? dp[i-1][j-1] : 0;\n                dp[i][j] = 1 + min({up, lf, dg});   // transition\n                ans += dp[i][j];\n            }\n        }\n    return ans;                                     // driver\n}`, { transition: "transition", driver: "driver" }),
      java: withAnchors(`static int countSquares(int[][] g) {\n    int R = g.length, C = g[0].length, ans = 0;\n    int[][] dp = new int[R][C];\n    for (int i = 0; i < R; ++i)\n        for (int j = 0; j < C; ++j)\n            if (g[i][j] == 1) {\n                int up = i > 0 ? dp[i-1][j] : 0;\n                int lf = j > 0 ? dp[i][j-1] : 0;\n                int dg = (i > 0 && j > 0) ? dp[i-1][j-1] : 0;\n                dp[i][j] = 1 + Math.min(Math.min(up, lf), dg);  // transition\n                ans += dp[i][j];\n            }\n    return ans;                                     // driver\n}`, { transition: "transition", driver: "driver" }),
      python: withAnchors(`def count_squares(g):\n    R, C = len(g), len(g[0])\n    dp = [[0]*C for _ in range(R)]\n    ans = 0\n    for i in range(R):\n        for j in range(C):\n            if g[i][j]:\n                up = dp[i-1][j] if i else 0\n                lf = dp[i][j-1] if j else 0\n                dg = dp[i-1][j-1] if i and j else 0\n                dp[i][j] = 1 + min(up, lf, dg)   # transition\n                ans += dp[i][j]\n    return ans                                   # driver`, { transition: "transition", driver: "driver" }),
      js: withAnchors(`function countSquares(g) {\n  const R = g.length, C = g[0].length;\n  const dp = Array.from({ length: R }, () => new Array(C).fill(0));\n  let ans = 0;\n  for (let i = 0; i < R; i++)\n    for (let j = 0; j < C; j++)\n      if (g[i][j]) {\n        const up = i ? dp[i-1][j] : 0;\n        const lf = j ? dp[i][j-1] : 0;\n        const dg = i && j ? dp[i-1][j-1] : 0;\n        dp[i][j] = 1 + Math.min(up, lf, dg);    // transition\n        ans += dp[i][j];\n      }\n  return ans;                                   // driver\n}`, { transition: "transition", driver: "driver" }),
    },
  },
};
