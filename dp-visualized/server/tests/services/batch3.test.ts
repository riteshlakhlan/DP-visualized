import { describe, it, expect } from "vitest";
import { getService } from "../../src/services/registry";

const editDist = getService("edit-distance")!;
const lcSubstr = getService("longest-common-substring")!;
const coinII = getService("coin-change-ii")!;
const countK = getService("count-subsets-sum-k")!;
const rod = getService("rod-cutting")!;

const MODES = ["bruteforce", "memo", "tabulation", "spaceOptimized"] as const;

/* ------------------------------ references ------------------------------ */

function editDistRef(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function lcSubstrRef(a: string, b: string): number {
  let best = 0;
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? 1 + dp[i - 1][j - 1] : 0;
      best = Math.max(best, dp[i][j]);
    }
  return best;
}

function coinIIRef(coinsRaw: number[], amount: number): number {
  const coins = [...new Set(coinsRaw)];
  const dp = new Array(amount + 1).fill(0);
  dp[0] = 1;
  for (const c of coins)
    for (let a = c; a <= amount; a++) dp[a] += dp[a - c];
  return dp[amount];
}

function countKRef(arr: number[], k: number): number {
  const dp = new Array(k + 1).fill(0);
  dp[0] = 1;
  for (const x of arr)
    for (let t = k; t >= x; t--) dp[t] += dp[t - x];
  return dp[k];
}

function rodRef(prices: number[]): number {
  const n = prices.length;
  const dp = new Array(n + 1).fill(0);
  for (let len = 1; len <= n; len++)
    for (let k = 1; k <= Math.min(len, n); k++)
      dp[len] = Math.max(dp[len], prices[k - 1] + dp[len - k]);
  return dp[n];
}

/** Every codeAnchor referenced by steps must resolve in EVERY language's snippet. */
function expectAnchorsResolve(slug: string, svc: ReturnType<typeof getService>, input: unknown) {
  const s = svc!;
  for (const mode of MODES) {
    const { steps } = s.buildTrace(input, mode);
    const variant = { bruteforce: "bruteforce", memo: "memoization", tabulation: "tabulation", spaceOptimized: "spaceOptimized" }[mode] as string;
    const langPack = s.codes[variant as keyof typeof s.codes];
    expect(langPack, `${slug}/${variant}`).toBeDefined();
    const used = new Set(steps.map((st) => st.codeAnchor).filter(Boolean));
    for (const [lang, snip] of Object.entries(langPack ?? {})) {
      for (const a of used)
        expect(snip.anchors[a as string], `${slug}/${variant}/${lang} missing anchor "${a}"`).toBeDefined();
    }
  }
}

/* ------------------------------ edit distance ----------------------------- */

describe("edit-distance", () => {
  it.each([
    ["horse", "ros", 3],
    ["abc", "abc", 0],
    ["ab", "cd", 2],
    ["a", "ab", 1],
    ["aaa", "aa", 1],
  ])("dist(%s,%s) = %i across all modes", (s, t, expected) => {
    expect(editDistRef(s, t)).toBe(expected);
    for (const mode of MODES) {
      const lim = editDist.limitsPerMode[mode](mode, { s, t });
      if (lim) continue;
      expect(editDist.buildTrace({ s, t }, mode).meta.answer).toBe(expected);
    }
  });

  it("randomized cross-check vs reference", () => {
    const randStr = () => Array.from({ length: 2 + Math.floor(Math.random() * 4) }, () => "abc"[Math.floor(Math.random() * 3)]).join("");
    for (let t = 0; t < 25; t++) {
      const a = randStr(), b = randStr();
      const ref = editDistRef(a, b);
      for (const mode of MODES) {
        const lim = editDist.limitsPerMode[mode](mode, { s: a, t: b });
        if (lim) continue;
        expect(editDist.buildTrace({ s: a, t: b }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("edit-distance", editDist, editDist.defaultInput));
});

/* --------------------------- longest common substring --------------------- */

describe("longest-common-substring", () => {
  it.each([
    ["abcdgh", "acdghr", 4],
    ["abcde", "abgcd", 2],
    ["xyz", "abc", 0],
    ["aaaa", "aa", 2],
  ])("lcsubstr(%s,%s) = %i across all modes", (s, t, expected) => {
    expect(lcSubstrRef(s, t)).toBe(expected);
    for (const mode of MODES) {
      const lim = lcSubstr.limitsPerMode[mode](mode, { s, t });
      if (lim) continue;
      expect(lcSubstr.buildTrace({ s, t }, mode).meta.answer).toBe(expected);
    }
  });

  it("randomized cross-check vs reference", () => {
    const randStr = () => Array.from({ length: 2 + Math.floor(Math.random() * 4) }, () => "ab"[Math.floor(Math.random() * 2)]).join("");
    for (let t = 0; t < 25; t++) {
      const a = randStr(), b = randStr();
      const ref = lcSubstrRef(a, b);
      for (const mode of MODES) {
        const lim = lcSubstr.limitsPerMode[mode](mode, { s: a, t: b });
        if (lim) continue;
        expect(lcSubstr.buildTrace({ s: a, t: b }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("mismatch resets are visible in the tabulation trace", () => {
    const { steps } = lcSubstr.buildTrace({ s: "abc", t: "abd" }, "tabulation");
    expect(steps.some((s) => s.codeAnchor === "reset" && s.value === 0)).toBe(true);
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("longest-common-substring", lcSubstr, lcSubstr.defaultInput));
});

/* ------------------------------- coin change II --------------------------- */

describe("coin-change-ii", () => {
  it.each([
    [[1, 2, 3], 4, 4],
    [[2], 3, 0],
    [[5], 0, 1],
    [[2, 3, 5, 6], 10, 5],
    [[1, 2, 3], 4, 4],
  ])("change(%j, %i) = %i across all modes", (coins, amount, expected) => {
    expect(coinIIRef([...coins], amount)).toBe(expected);
    for (const mode of MODES) {
      const lim = coinII.limitsPerMode[mode](mode, { coins: [...coins], amount });
      if (lim) continue;
      expect(coinII.buildTrace({ coins, amount }, mode).meta.answer).toBe(expected);
    }
  });

  it("duplicate denominations are merged, never double-counted", () => {
    for (const mode of ["memo", "tabulation"] as const)
      expect(coinII.buildTrace({ coins: [2, 2], amount: 4 }, mode).meta.answer).toBe(
        coinII.buildTrace({ coins: [2], amount: 4 }, mode).meta.answer,
      );
  });

  it("randomized cross-check vs reference", () => {
    for (let t = 0; t < 25; t++) {
      const coins = Array.from({ length: 1 + Math.floor(Math.random() * 4) }, () => 1 + Math.floor(Math.random() * 8));
      const amount = Math.floor(Math.random() * 11);
      const ref = coinIIRef(coins, amount);
      for (const mode of MODES) {
        const lim = coinII.limitsPerMode[mode](mode, { coins, amount });
        if (lim) continue;
        expect(coinII.buildTrace({ coins, amount }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("coin-change-ii", coinII, coinII.defaultInput));
});

/* ------------------------------ count subsets ----------------------------- */

describe("count-subsets-sum-k", () => {
  it.each([
    [[1, 1, 2, 3], 4, 3],
    [[2, 6, 4], 17, 0],
    [[9], 0, 1],
    [[0, 1], 1, 2],
    [[3, 3, 3, 3], 6, 6],
  ])("count(%j, k=%i) = %i across all modes", (arr, k, expected) => {
    expect(countKRef([...arr], k)).toBe(expected);
    for (const mode of MODES) {
      const lim = countK.limitsPerMode[mode](mode, { arr: [...arr], k });
      if (lim) continue;
      expect(countK.buildTrace({ arr, k }, mode).meta.answer).toBe(expected);
    }
  });

  it("randomized cross-check vs reference", () => {
    for (let t = 0; t < 25; t++) {
      const arr = Array.from({ length: 1 + Math.floor(Math.random() * 6) }, () => Math.floor(Math.random() * 8));
      const k = Math.floor(Math.random() * 15);
      const ref = countKRef(arr, k);
      for (const mode of MODES) {
        const lim = countK.limitsPerMode[mode](mode, { arr, k });
        if (lim) continue;
        expect(countK.buildTrace({ arr, k }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("relates correctly to subset-sum-equals-target on shared inputs", () => {
    const subsetSum = getService("subset-sum-equals-target")!;
    const arr = [1, 2, 3];
    const count = countK.buildTrace({ arr, k: 3 }, "tabulation").meta.answer as number;
    const exists = subsetSum.buildTrace({ arr, target: 3 }, "tabulation").meta.answer as boolean;
    expect(count).toBeGreaterThan(0);
    expect(Boolean(exists)).toBe(true);
    // and an unreachable target agrees too
    const count0 = countK.buildTrace({ arr, k: 7 }, "memo").meta.answer as number;
    const exists0 = subsetSum.buildTrace({ arr, target: 7 }, "memo").meta.answer as boolean;
    if (!exists0) expect(count0).toBe(0);
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("count-subsets-sum-k", countK, countK.defaultInput));
});

/* -------------------------------- rod cutting ------------------------------ */

describe("rod-cutting", () => {
  it.each([
    [[2, 5, 7, 8, 10], 12],
    [[1, 1, 1], 3],
    [[3, 1], 6],
    [[1, 5, 8, 9, 10, 17, 17, 20], 22],
  ])("rod(%j) = %i across all modes", (prices, expected) => {
    expect(rodRef(prices)).toBe(expected);
    for (const mode of MODES) {
      const lim = rod.limitsPerMode[mode](mode, { prices: [...prices] });
      if (lim) continue;
      expect(rod.buildTrace({ prices }, mode).meta.answer).toBe(expected);
    }
  });

  it("randomized cross-check vs reference", () => {
    for (let t = 0; t < 25; t++) {
      const prices = Array.from({ length: 2 + Math.floor(Math.random() * 6) }, () => 1 + Math.floor(Math.random() * 9));
      const ref = rodRef(prices);
      for (const mode of MODES) {
        const lim = rod.limitsPerMode[mode](mode, { prices });
        if (lim) continue;
        expect(rod.buildTrace({ prices }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("unbounded supply respected: repeating one piece beats distinct pieces when priced so", () => {
    // all piece lengths priced 1 -> best plan for rod length 3 is three unit pieces
    expect(rod.buildTrace({ prices: [1, 1, 1] }, "memo").meta.answer).toBe(3);
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("rod-cutting", rod, rod.defaultInput));
});

/* ------------------------------ hygiene sweep ------------------------------ */

describe("trace hygiene for batch-3 services", () => {
  const cases: [string, ReturnType<typeof getService>][] = [
    ["edit-distance", editDist],
    ["longest-common-substring", lcSubstr],
    ["coin-change-ii", coinII],
    ["count-subsets-sum-k", countK],
    ["rod-cutting", rod],
  ];

  for (const [slug, svc] of cases) {
    it(`${slug}: bounded traces, deps written earlier, sane stats`, () => {
      const s = svc!;
      const input = s.defaultInput as never;
      for (const mode of MODES) {
        const { steps, meta } = s.buildTrace(input, mode);
        expect(steps.length, `${slug}/${mode} step cap`).toBeLessThan(2500);

        const writtenAt = new Map<string, number>();
        steps.forEach((st, idx) => {
          const ck = st.coordinates.join(",");
          if (st.type === "table-write" || ((st.type === "recurse-return" || st.type === "memo-hit" || st.type === "base-case") && st.value !== undefined))
            writtenAt.set(ck, idx);
          for (const d of st.deps ?? []) {
            const at = writtenAt.get(d.join(","));
            if (at !== undefined && st.type === "table-write")
              expect(at, `${slug}/${mode}: dep ${d} of ${ck} must be written earlier`).toBeLessThan(idx);
          }
        });

        expect(meta.stats.steps).toBe(steps.length);
      }
    });
  }
});
