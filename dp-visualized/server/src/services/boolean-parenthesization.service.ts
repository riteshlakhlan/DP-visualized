import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Evaluate Boolean Expression to True (Striver DP-52): count parenthesizations
 * of an expression like "T|F&T" that evaluate TRUE.
 * dpT[i][j] / dpF[i][j] = true/false counts for s[i..j]. Split at each
 * operator between operands; combine sub-counts per operator semantics.
 * Table shows the TRUE-count matrix (upper triangular); false counts are
 * narrated in explanations.
 */

const schema = z.object({
  expr: z.string().regex(/^[TF]([&|^][TF]){0,5}$/),
});
type In = z.infer<typeof schema>;

/** tokens: operands at even indices, operators at odd */
function tokens(input: In): string[] {
  return input.expr.split("");
}

function limits(mode: DPMode): string | null {
  if (mode === "bruteforce")
    return "Brute force tries every parenthesization (Catalan-many). Use at most 4 operators.";
  if (mode === "spaceOptimized")
    return "Interval DP reads across the whole expression — no rolling window exists. Use Memoization or Tabulation.";
  return null;
}

const nOperands = (expr: string) => (expr.length + 1) / 2;

const AXIS = (n: number) => ({
  rowsTitle: "start operand i",
  colsTitle: "end operand j",
  rowLabels: Array.from({ length: n }, (_, i) => String(i)),
  colLabels: Array.from({ length: n }, (_, j) => String(j)),
});

function countsFor(tokens: string[], l: number, r: number, dpT: number[][], dpF: number[][]): { t: number; f: number; split: string } {
  // interval over operands [l..r]; split between k and k+1
  let T = 0, F = 0;
  let bestSplit = "";
  const parts: string[] = [];
  for (let k = l; k < r; k++) {
    const op = tokens[2 * k + 1];
    const lt = dpT[l][k], lf = dpF[l][k];
    const rt = dpT[k + 1][r], rf = dpF[k + 1][r];
    let t = 0, f = 0;
    if (op === "&") { t = lt * rt; f = lf * rf + lf * rt + lt * rf; }
    else if (op === "|") { t = lt * rt + lt * rf + lf * rt; f = lf * rf; }
    else { t = lt * rf + lf * rt; f = lt * rt + lf * rf; }
    T += t; F += f;
    parts.push(`${t}/${f}`);
    void bestSplit;
    bestSplit = `split@${k}(${op})`;
  }
  void bestSplit;
  return { t: T, f: F, split: parts.join(", ") };
}


function genTab(input: In): GeneratedTrace {
  const tk = tokens(input);
  const nOp = nOperands(input.expr);
  const b = new TraceBuilder();
  const dpT: number[][] = Array.from({ length: nOp }, () => new Array(nOp).fill(-1));
  const dpF: number[][] = Array.from({ length: nOp }, () => new Array(nOp).fill(-1));

  for (let i = 0; i < nOp; i++) {
    const isT = tk[2 * i] === "T";
    dpT[i][i] = isT ? 1 : 0;
    dpF[i][i] = isT ? 0 : 1;
    b.push("base-case", [i, i], `Single operand ${tk[2*i]} → T=${dpT[i][i]}, F=${dpF[i][i]}.`, { value: dpT[i][i], codeAnchor: "base" });
  }

  for (let len = 2; len <= nOp; len++)
    for (let l = 0; l + len - 1 < nOp; l++) {
      const r = l + len - 1;
      let T = 0, F = 0;
      const parts: string[] = [];
      for (let k = l; k < r; k++) {
        const op = tk[2 * k + 1];
        const lt = dpT[l][k], lf = dpF[l][k];
        const rt = dpT[k + 1][r], rf = dpF[k + 1][r];
        let t = 0, f = 0;
        if (op === "&") { t = lt * rt; f = lf * rf + lf * rt + lt * rf; }
        else if (op === "|") { t = lt * rt + lt * rf + lf * rt; f = lf * rf; }
        else { t = lt * rf + lf * rt; f = lt * rt + lf * rf; }
        T += t; F += f;
        parts.push(`@${op}:${t}T/${f}F`);
      }
      dpT[l][r] = T;
      dpF[l][r] = F;
      b.push("table-write", [l, r],
        `dpT[${l}][${r}] = ${T} (dpF = ${F}); splits: ${parts.join(", ")}.`,
        { value: T, deps: [[l, r - 1]], codeAnchor: "transition" });
    }

  const answer = dpT[0][nOp - 1];
  b.push("table-read", [0, nOp - 1], `Answer at top-right: dpT[0][${nOp - 1}] = ${answer}.`, {
    value: answer, codeAnchor: "driver",
  });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "ways to be TRUE",
      tableShape: { rows: nOp, cols: nOp },
      axisLabels: AXIS(nOp),
      valueFormat: "int",
      stats: { steps: b.count, writes: ((nOp * (nOp + 1)) / 2) + nOp },
    },
  };
}

export const booleanParenthesization: ProblemServiceDef = {
  slug: "boolean-parenthesization",
  patternSlug: "dp-mcm",
  inputDescriptor: [
    { key: "expr", label: "EXPR (T F & | ^)", kind: "stringPair", min: 3, max: 11, allow: "[TF&|^]" },
  ],
  schema,
  defaultInput: { expr: "T|F&T^F" }, // exhaustively verified → 5
  randomInput: () => ({
    expr: Array.from({ length: 5 }, (_, i) => (i % 2 === 0 ? ("TF")[Math.floor(Math.random() * 2)] : ["&", "|", "^"][Math.floor(Math.random() * 3)])).join(""),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: () => null, spaceOptimized: limits },
  buildTrace: (input) => genTab(input as In),
  codes: {
    tabulation: {
      cpp: withAnchors(
`int countTrue(string& e) {
    int n = (e.size() + 1) / 2;                       // operands
    vector<vector<int>> dT(n, vector<int>(n)), dF(n, vector<int>(n));
    for (int i = 0; i < n; ++i) {                      // base
        dT[i][i] = e[2*i] == 'T';
        dF[i][i] = !dT[i][i];
    }
    for (int len = 2; len <= n; ++len)
        for (int l = 0; l + len - 1 < n; ++l)
            for (int k = l; k < l + len - 1; ++k)       // transition
                combine(dT, dF, l, r, k, e);
    return dT[0][n - 1];                                // driver
}`,
        { base: "base", transition: "transition", driver: "driver" },
      ),
      java: withAnchors(
`static int countTrue(String e) {
    int n = (e.length() + 1) / 2;
    int[][] dT = new int[n][n], dF = new int[n][n];
    for (int i = 0; i < n; ++i) {                       // base
        dT[i][i] = e.charAt(2*i) == 'T' ? 1 : 0;
        dF[i][i] = 1 - dT[i][i];
    }
    for (int len = 2; len <= n; ++len)
        for (int l = 0; l + len - 1 < n; ++l)
            for (int k = l; k < l + len - 1; ++k)        // transition
                combine(dT, dF, l, r, k, e);
    return dT[0][n - 1];                                // driver
}`,
        { base: "base", transition: "transition", driver: "driver" },
      ),
      python: withAnchors(
`def count_true(e):
    n = (len(e) + 1) // 2
    dt = [[0]*n for _ in range(n)]
    df = [[0]*n for _ in range(n)]
    for i in range(n):                          # base
        dt[i][i] = 1 if e[2*i] == 'T' else 0
        df[i][i] = 1 - dt[i][i]
    for length in range(2, n+1):
        for l in range(0, n-length+1):
            for k in range(l, l+length-1):      # transition
                pass  # combine per operator semantics
    return dt[0][n-1]                           # driver`,
        { base: "base", transition: "transition", driver: "driver" },
      ),
      js: withAnchors(
`function countTrue(e) {
  const n = (e.length + 1) / 2;
  const dT = Array.from({ length: n }, () => new Array(n).fill(0));
  const dF = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {               // base
    dT[i][i] = e[2*i] === 'T' ? 1 : 0;
    dF[i][i] = 1 - dT[i][i];
  }
  for (let len = 2; len <= n; len++)
    for (let l = 0; l + len - 1 < n; l++)
      for (let k = l; k < l + len - 1; k++)    // transition
        combine(dT, dF, l, r, k, e);
  return dT[0][n - 1];                        // driver
}`,
        { base: "base", transition: "transition", driver: "driver" },
      ),
    },
  },
};
