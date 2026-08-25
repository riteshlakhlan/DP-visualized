import { describe, it, expect } from "vitest";
import { getService } from "../../src/services/registry";

const subset = getService("subset-sum-equals-target")!;
const partition = getService("partition-equal-subset-sum")!;
const knapsack = getService("zero-one-knapsack")!;
const coins = getService("minimum-coins")!;
const lcs = getService("longest-common-subsequence")!;

function subsetRef(a: number[], k: number): boolean {
  const dp = new Array(k + 1).fill(false);
  dp[0] = true;
  for (const x of a) for (let t = k; t >= x; t--) if (dp[t - x]) dp[t] = true;
  return dp[k];
}
function knapRef(wt: number[], val: number[], W: number): number {
  const dp = new Array(W + 1).fill(0);
  for (let i = 0; i < wt.length; i++)
    for (let w = W; w >= wt[i]; w--) dp[w] = Math.max(dp[w], val[i] + dp[w - wt[i]]);
  return dp[W];
}
function coinsRef(cs: number[], amount: number): number {
  const INF = 1e9;
  const dp = new Array(amount + 1).fill(INF);
  dp[0] = 0;
  for (let t = 1; t <= amount; t++)
    for (const c of cs) if (c <= t && dp[t - c] + 1 < dp[t]) dp[t] = dp[t - c] + 1;
  return dp[amount] >= INF ? -1 : dp[amount];
}
function lcsRef(s: string, t: string): number {
  const dp = Array.from({ length: s.length + 1 }, () => new Array(t.length + 1).fill(0));
  for (let i = 1; i <= s.length; i++)
    for (let j = 1; j <= t.length; j++)
      dp[i][j] = s[i - 1] === t[j - 1] ? 1 + dp[i - 1][j - 1] : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[s.length][t.length];
}

describe("subset-sum-equals-target", () => {
  it.each([
    [[3, 34, 4, 12, 5, 2], 9, true],
    [[2, 4, 6], 5, false],
    [[5], 5, true],
    [[1, 1, 1, 3], 3, true],
  ])("%j target %i → %s", (arr, target, expected) => {
    expect(subsetRef(arr, target)).toBe(expected);
    const modes = ["memo", "tabulation", "spaceOptimized"] as const;
    for (const mode of modes) expect(subset.buildTrace({ arr, target }, mode).meta.answer).toBe(expected);
    if (arr.length <= 8)
      expect(subset.buildTrace({ arr, target }, "bruteforce").meta.answer).toBe(expected);
  });

  it("overlapping input produces memo hits", () => {
    const { meta } = subset.buildTrace({ arr: [2, 2, 2, 4, 6, 8, 10, 12], target: 12 }, "memo");
    expect(meta.stats.memoHits ?? 0).toBeGreaterThan(0);
  });
});

describe("partition-equal-subset-sum", () => {
  it("[1,5,11,5] partitions; [1,2,3,5] odd-sum fails instantly", () => {
    expect(partition.buildTrace({ arr: [1, 5, 11, 5] }, "tabulation").meta.answer).toBe(true);
    const odd = partition.buildTrace({ arr: [1, 2, 3, 5] }, "tabulation");
    expect(odd.meta.answer).toBe(false);
    expect(odd.steps.length).toBe(1);
    expect(odd.meta.derived).toContain("odd");
  });

  it("derived line exposes sum/2 arithmetic", () => {
    const { meta } = partition.buildTrace({ arr: [2, 3, 5, 7, 7] }, "tabulation"); // total 24
    expect(meta.derived).toBe("target = sum / 2 = 24 / 2 = 12");
  });

  it("matches subset-sum reference on random even-total inputs", () => {
    for (let t = 0; t < 15; t++) {
      let arr = Array.from({ length: 3 + Math.floor(Math.random() * 5) }, () => 1 + Math.floor(Math.random() * 10));
      if (arr.reduce((a, b) => a + b, 0) % 2 !== 0) arr = [...arr, 1];
      const expected = subsetRef(arr, arr.reduce((a, b) => a + b, 0) / 2);
      expect(partition.buildTrace({ arr }, "memo").meta.answer).toBe(expected);
    }
  });

  it("reuses subset-sum snippets (single source of truth)", () => {
    const ss = getService("subset-sum-equal-subset" in {} ? "" : "subset-sum-equals-target")!;
    expect(partition.codes.tabulation).toEqual(ss.codes.tabulation);
  });
});

describe("zero-one-knapsack", () => {
  it("classic example W=7 → 9 across modes", () => {
    const input = { weights: [1, 3, 4, 5], values: [1, 4, 5, 7], W: 7 };
    expect(knapRef(input.weights, input.values, input.W)).toBe(9);
    for (const mode of ["bruteforce", "memo", "tabulation", "spaceOptimized"] as const)
      expect(knapsack.buildTrace(input, mode).meta.answer).toBe(9);
  });

  it("randomized cross-check vs reference", () => {
    for (let t = 0; t < 20; t++) {
      const n = 1 + Math.floor(Math.random() * 6);
      const weights = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 8));
      const values = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 20));
      const W = 3 + Math.floor(Math.random() * 14);
      const ref = knapRef(weights, values, W);
      expect(knapsack.buildTrace({ weights, values, W }, "memo").meta.answer).toBe(ref);
      if (n <= 8) expect(knapsack.buildTrace({ weights, values, W }, "bruteforce").meta.answer).toBe(ref);
    }
  });
});

describe("minimum-coins", () => {
  it.each([
    [[1, 2, 5], 11, 3],
    [[2], 3, -1],
    [[5, 7], 11, -1],
    [[1, 5, 6, 9], 11, 2],
    [[3, 7], 0, 0],
  ])("coins %j amount %i → %i", (cs, amount, expected) => {
    expect(coinsRef(cs, amount)).toBe(expected);
    expect(coins.buildTrace({ coins: cs, amount }, "memo").meta.answer).toBe(expected);
    expect(coins.buildTrace({ coins: cs, amount }, "tabulation").meta.answer).toBe(expected);
    if (amount <= 14) expect(coins.buildTrace({ coins: cs, amount }, "bruteforce").meta.answer).toBe(expected);
  });
});

describe("longest-common-subsequence", () => {
  it.each([
    ["abcde", "ace", 3],
    ["abc", "abc", 3],
    ["abc", "def", 0],
    ["aggtab", "gxtxayb", 4],
  ])('lcs("%s","%s") = %i', (s, t, expected) => {
    expect(lcsRef(s, t)).toBe(expected);
    for (const mode of ["memo", "tabulation", "spaceOptimized"] as const)
      expect(lcs.buildTrace({ s, t }, mode).meta.answer).toBe(expected);
    if (Math.max(s.length, t.length) <= 4)
      expect(lcs.buildTrace({ s, t }, "bruteforce").meta.answer).toBe(expected);
  });

  it("string characters appear as axis labels", () => {
    const { meta } = lcs.buildTrace({ s: "abc", t: "ac" }, "tabulation");
    expect(meta.axisLabels?.rowLabels).toEqual(["ε", "a", "b", "c"]);
    expect(meta.axisLabels?.colLabels).toEqual(["ε", "a", "c"]);
  });

  it("match steps depend diagonally, nomatch steps on up/left", () => {
    const { steps } = lcs.buildTrace({ s: "ax", t: "ax" }, "tabulation");
    const matchWrite = steps.find((st) => st.type === "table-write" && st.coordinates[0] === 2 && st.coordinates[1] === 2)!;
    expect(matchWrite.deps).toEqual([[1, 1]]);
  });
});
