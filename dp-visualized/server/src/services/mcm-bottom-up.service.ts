import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* MCM — Bottom-Up (Striver DP-49): the pure tabulation twin of DP-48. The
 * table fills DIAGONAL BY DIAGONAL (increasing chain length), never needing
 * memoization at all. Only Tabulation exists for this variant.
 */

const schema = z.object({
  dims: z.array(z.number().int().min(1).max(100)).min(3).max(8),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode): string | null {
  if (mode !== "tabulation")
    return "This problem IS the bottom-up tabulation of Matrix Chain Multiplication — use Tabulation.";
  return null;
}

function genTab(input: In): GeneratedTrace {
  const d = input.dims;
  const n = d.length - 1;
  const b = new TraceBuilder();
  const dp: number[][] = Array.from({ length: n }, () => new Array(n).fill(-1));

  for (let i = 0; i < n; i++) {
    dp[i][i] = 0;
    b.push("base-case", [i, i], `Length-1 chains: dp[${i}][${i}] = 0.`, { value: 0, codeAnchor: "base" });
  }

  for (let len = 2; len <= n; len++) {
    for (let i = 0; i + len - 1 < n; i++) {
      const j = i + len - 1;
      let best = Infinity;
      let bestK = -1;
      for (let k = i; k < j; k++) {
        const cost = dp[i][k] + dp[k + 1][j] + d[i] * d[k + 1] * d[j + 1];
        if (cost < best) { best = cost; bestK = k; }
      }
      dp[i][j] = best;
      b.push("table-write", [i, j],
        `Chain length ${len} (A${i + 1}..A${j + 1}): split after A${bestK + 1} → ${d[i]}×${d[bestK + 1]}×${d[j + 1]} + halves = ${best}.`,
        { value: best, deps: [[i, bestK], [bestK + 1, j]], codeAnchor: "transition" });
    }
    // diagonal-complete narration
    const firstI = 0, lastJ = Math.min(len - 1, n - 1);
    void firstI; void lastJ;
  }

  const answer = dp[0][n - 1];
  b.push("table-read", [0, n - 1], `All diagonals filled. Answer = dp[0][${n - 1}] = ${answer}.`, {
    value: answer, codeAnchor: "driver",
  });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "min scalar multiplications",
      tableShape: { rows: n, cols: n },
      axisLabels: {
        rowsTitle: "start matrix i",
        colsTitle: "end matrix j",
        rowLabels: Array.from({ length: n }, (_, i) => `A${i + 1}`),
        colLabels: Array.from({ length: n }, (_, j) => `A${j + 1}`),
      },
      valueFormat: "int",
      stats: { steps: b.count, writes: ((n * (n + 1)) / 2) + 1 },
    },
  };
}

const codes = {
  tabulation: {
    cpp: withAnchors(
`int mcmBottomUp(vector<int>& p) {
    int n = p.size() - 1;
    vector<vector<int>> dp(n, vector<int>(n, 0));       // base diagonal
    for (int len = 2; len <= n; ++len)
        for (int i = 0; i + len - 1 < n; ++i) {
            int j = i + len - 1;
            dp[i][j] = INT_MAX;
            for (int k = i; k < j; ++k)                  // transition
                dp[i][j] = min(dp[i][j],
                    dp[i][k] + dp[k + 1][j] + p[i] * p[k + 1] * p[j + 1]);
        }
    return dp[0][n - 1];                                // driver
}`,
      { base: "base diagonal", transition: "transition", driver: "driver" },
    ),
    java: withAnchors(
`static int mcmBottomUp(int[] p) {
    int n = p.length - 1;
    int[][] dp = new int[n][n];                          // base diagonal
    for (int len = 2; len <= n; ++len)
        for (int i = 0; i + len - 1 < n; ++i) {
            int j = i + len - 1;
            dp[i][j] = Integer.MAX_VALUE;
            for (int k = i; k < j; ++k)                   // transition
                dp[i][j] = Math.min(dp[i][j],
                    dp[i][k] + dp[k + 1][j] + p[i] * p[k + 1] * p[j + 1]);
        }
    return dp[0][n - 1];                                 // driver
}`,
      { base: "base diagonal", transition: "transition", driver: "driver" },
    ),
    python: withAnchors(
`def mcm_bottom_up(p):
    n = len(p) - 1
    dp = [[0] * n for _ in range(n)]              # base diagonal
    for length in range(2, n + 1):
        for i in range(0, n - length + 1):
            j = i + length - 1
            dp[i][j] = math.inf
            for k in range(i, j):                  # transition
                dp[i][j] = min(dp[i][j], dp[i][k] + dp[k + 1][j]
                                       + p[i] * p[k + 1] * p[j + 1])
    return dp[0][n - 1]                            # driver`,
      { base: "base diagonal", transition: "transition", driver: "driver" },
    ),
    js: withAnchors(
`function mcmBottomUp(p) {
  const n = p.length - 1;
  const dp = Array.from({ length: n }, () => new Array(n).fill(0)); // base diag
  for (let len = 2; len <= n; len++)
    for (let i = 0; i + len - 1 < n; i++) {
      const j = i + len - 1;
      dp[i][j] = Infinity;
      for (let k = i; k < j; k++)                   // transition
        dp[i][j] = Math.min(dp[i][j],
          dp[i][k] + dp[k + 1][j] + p[i] * p[k + 1] * p[j + 1]);
    }
  return dp[0][n - 1];                              // driver
}`,
      { base: "base diag", transition: "transition", driver: "driver" },
    ),
  },
};

export const mcmBottomUp: ProblemServiceDef = {
  slug: "mcm-bottom-up",
  patternSlug: "dp-mcm",
  inputDescriptor: [
    { key: "dims", label: "DIMENSIONS P[]", kind: "array", min: 3, max: 7, valueRange: [1, 9] },
  ],
  schema,
  defaultInput: { dims: [40, 20, 30, 10, 30] }, // Striver's bottom-up example → 26000
  randomInput: () => ({
    dims: Array.from({ length: 4 + Math.floor(Math.random() * 3) }, () => 1 + Math.floor(Math.random() * 20)),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: () => null, spaceOptimized: limits },
  buildTrace: (input) => genTab(input as In),
  codes,
};
