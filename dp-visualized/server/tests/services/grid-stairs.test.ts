import { describe, it, expect } from "vitest";
import { getService } from "../../src/services/registry";

const stairs = getService("climbing-stairs")!;
const paths = getService("grid-unique-paths")!;
const minSum = getService("minimum-path-sum")!;

function stairsRef(n: number): number {
  let a = 1, b = 1;
  for (let i = 2; i <= n; i++) { const c = a + b; a = b; b = c; }
  return n <= 1 ? 1 : b;
}
function pathsRef(m: number, n: number): number {
  let row = new Array(n).fill(1);
  for (let i = 1; i < m; i++) {
    const nxt = new Array(n).fill(1);
    for (let j = 1; j < n; j++) nxt[j] = row[j] + nxt[j - 1];
    row = nxt;
  }
  return row[n - 1];
}
function minSumRef(g: number[][]): number {
  const m = g.length, n = g[0].length;
  const dp = Array.from({ length: m }, () => new Array(n).fill(0));
  dp[0][0] = g[0][0];
  for (let j = 1; j < n; j++) dp[0][j] = dp[0][j - 1] + g[0][j];
  for (let i = 1; i < m; i++) dp[i][0] = dp[i - 1][0] + g[i][0];
  for (let i = 1; i < m; i++)
    for (let j = 1; j < n; j++) dp[i][j] = g[i][j] + Math.min(dp[i - 1][j], dp[i][j - 1]);
  return dp[m - 1][n - 1];
}

describe("climbing-stairs", () => {
  it.each([1, 2, 3, 10, 25])("n=%i → %i in every mode", (n) => {
    const expected = stairsRef(n);
    for (const mode of ["bruteforce", "memo", "tabulation", "spaceOptimized"] as const)
      expect(stairs.buildTrace({ n }, mode).meta.answer).toBe(expected);
  });

  it("full-expansion brute explodes while memo stays linear", () => {
    const brute = stairs.buildTrace({ n: 10 }, "bruteforce");
    const memo = stairs.buildTrace({ n: 10 }, "memo");
    expect((memo.meta.stats.calls ?? Infinity)).toBeLessThan(brute.meta.stats.calls ?? Infinity);
    expect(memo.meta.stats.memoHits ?? 0).toBeGreaterThan(0);
    // and the blow-up is real: brute makes ~fib(n) calls
    expect((brute.meta.stats.calls ?? 0)).toBeGreaterThan(100);
  });

  it("brute tree marks duplicate subtrees red-flagged", () => {
    const { steps } = stairs.buildTrace({ n: 8 }, "bruteforce");
    const dups = steps.filter((s) => s.type === "recurse-call" && s.dup);
    expect(dups.length).toBeGreaterThan(0);
  });

  it("stepIndex is sequential and complete", () => {
    const { steps } = stairs.buildTrace({ n: 6 }, "tabulation");
    steps.forEach((s, i) => expect(s.stepIndex).toBe(i));
  });
});

describe("grid-unique-paths", () => {
  it.each([
    [3, 7, 28],
    [3, 3, 6],
    [1, 5, 1],
    [5, 5, 70],
  ])("%ix%i → %i across modes", (m, n, expected) => {
    expect(pathsRef(m, n)).toBe(expected);
    for (const mode of ["memo", "tabulation"] as const)
      expect(paths.buildTrace({ m, n }, mode).meta.answer).toBe(expected);
    if (m * n <= 25)
      expect(paths.buildTrace({ m, n }, "bruteforce").meta.answer).toBe(expected);
  });

  it("table shape is rows x cols with numeric axes", () => {
    const { meta } = paths.buildTrace({ m: 3, n: 4 }, "tabulation");
    expect(meta.tableShape).toEqual({ rows: 3, cols: 4 });
  });
});

describe("minimum-path-sum", () => {
  it("classic example → 7 in all four modes", () => {
    const grid = [
      [1, 3, 1],
      [1, 5, 1],
      [4, 2, 1],
    ];
    expect(minSumRef(grid)).toBe(7);
    for (const mode of ["bruteforce", "memo", "tabulation", "spaceOptimized"] as const)
      expect(minSum.buildTrace({ grid }, mode).meta.answer).toBe(7);
  });

  it("random grids match reference", () => {
    for (let t = 0; t < 10; t++) {
      const rows = 2 + Math.floor(Math.random() * 4);
      const cols = 2 + Math.floor(Math.random() * 4);
      const grid = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => 1 + Math.floor(Math.random() * 9)),
      );
      const ref = minSumRef(grid);
      expect(minSum.buildTrace({ grid }, "memo").meta.answer).toBe(ref);
      if (rows <= 5)
        expect(minSum.buildTrace({ grid }, "bruteforce").meta.answer).toBe(ref);
    }
  });
});
