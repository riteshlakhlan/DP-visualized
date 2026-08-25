import { describe, it, expect } from "vitest";
import { getService } from "../../src/services/registry";

const stockI = getService("stock-i")!;
const unbKnap = getService("unbounded-knapsack")!;
const tSum = getService("target-sum")!;
const partDiff = getService("count-partitions-diff")!;
const minDiff = getService("partition-min-abs-diff")!;
const lps = getService("longest-palindromic-subsequence")!;

const MODES = ["bruteforce", "memo", "tabulation", "spaceOptimized"] as const;

/* ------------------------------ references ------------------------------ */

function stockRef(p: number[]): number {
  let best = 0, min = Infinity;
  for (const x of p) {
    best = Math.max(best, x - min);
    min = Math.min(min, x);
  }
  return best;
}

function unbKnapRef(wt: number[], val: number[], W: number): number {
  const dp = new Array(W + 1).fill(0);
  for (let i = 0; i < wt.length; i++)
    for (let w = wt[i]; w <= W; w++) dp[w] = Math.max(dp[w], val[i] + dp[w - wt[i]]);
  return dp[W];
}

/** brute-force sign assignments — the ground truth for target-sum */
function targetSumBrute(arr: number[], T: number): number {
  let count = 0;
  const rec = (i: number, acc: number) => {
    if (i === arr.length) {
      if (acc === T) count++;
      return;
    }
    rec(i + 1, acc + arr[i]);
    rec(i + 1, acc - arr[i]);
  };
  rec(0, 0);
  return count;
}

function partitionsDiffBrute(arr: number[], D: number): number {
  let count = 0;
  for (let mask = 0; mask < 1 << arr.length; mask++) {
    let s1 = 0, s2 = 0;
    for (let i = 0; i < arr.length; i++) (mask & (1 << i) ? (s1 += arr[i]) : (s2 += arr[i]));
    if (s1 - s2 === D) count++;
  }
  return count; // masks already distinguish which side is S1 (the + group)
}

function minDiffRef(arr: number[]): number {
  const total = arr.reduce((a, b) => a + b, 0);
  let best = total;
  for (let mask = 0; mask < 1 << arr.length; mask++) {
    let s = 0;
    for (let i = 0; i < arr.length; i++) if (mask & (1 << i)) s += arr[i];
    best = Math.min(best, Math.abs(total - 2 * s));
  }
  return best;
}

function lpsRef(s: string): number {
  const n = s.length;
  const memo = new Map<string, number>();
  const f = (i: number, j: number): number => {
    if (i > j) return 0;
    if (i === j) return 1;
    const kk = `${i},${j}`;
    if (memo.has(kk)) return memo.get(kk)!;
    const v = s[i] === s[j] ? 2 + f(i + 1, j - 1) : Math.max(f(i + 1, j), f(i, j - 1));
    memo.set(kk, v);
    return v;
  };
  return f(0, n - 1);
}

function expectAnchorsResolve(slug: string, svc: ReturnType<typeof getService>, input: unknown) {
  const s = svc!;
  for (const mode of MODES) {
    const { steps } = s.buildTrace(input, mode);
    const variant = { bruteforce: "bruteforce", memo: "memoization", tabulation: "tabulation", spaceOptimized: "spaceOptimized" }[mode] as string;
    const langPack = s.codes[variant as keyof typeof s.codes];
    expect(langPack, `${slug}/${variant}`).toBeDefined();
    const used = new Set(steps.map((st) => st.codeAnchor).filter(Boolean));
    for (const [lang, snip] of Object.entries(langPack ?? {}))
      for (const a of used)
        expect(snip.anchors[a as string], `${slug}/${variant}/${lang} missing anchor "${a}"`).toBeDefined();
  }
}

/* -------------------------------- stock I -------------------------------- */

describe("stock-i", () => {
  it.each([
    [[7, 1, 5, 3, 6, 4], 5],
    [[7, 6, 4, 3, 1], 0],
    [[2, 4, 1, 8], 7],
    [[3, 3, 3], 0],
  ])("prices=%j -> %i across all modes", (prices, expected) => {
    expect(stockRef(prices)).toBe(expected);
    for (const mode of MODES) expect(stockI.buildTrace({ prices }, mode).meta.answer).toBe(expected);
  });

  it("randomized cross-check vs reference", () => {
    for (let t = 0; t < 25; t++) {
      const p = Array.from({ length: 2 + Math.floor(Math.random() * 8) }, () => 1 + Math.floor(Math.random() * 30));
      const ref = stockRef(p);
      for (const mode of MODES) expect(stockI.buildTrace({ prices: p }, mode).meta.answer).toBe(ref);
    }
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("stock-i", stockI, stockI.defaultInput));
});

/* --------------------------- unbounded knapsack --------------------------- */

describe("unbounded-knapsack", () => {
  it("Striver's classic example = 27 across all modes", () => {
    const input = { weights: [2, 4, 6], values: [5, 11, 13], capacity: 10 };
    for (const mode of MODES) expect(unbKnap.buildTrace(input, mode).meta.answer).toBe(27);
  });

  it.each([
    [[3], [5], 10, 15],
    [[1], [1], 5, 5],
    [[2, 3], [3, 4], 7, 10],
  ])("wt=%j val=%j W=%i -> %i", (wt, val, W, expected) => {
    for (const mode of MODES)
      expect(unbKnap.buildTrace({ weights: [...wt], values: [...val], capacity: W }, mode).meta.answer).toBe(expected);
  });

  it("randomized cross-check vs reference", () => {
    for (let t = 0; t < 25; t++) {
      const wt = Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => 1 + Math.floor(Math.random() * 6));
      const val = Array.from({ length: wt.length }, () => 1 + Math.floor(Math.random() * 9));
      const W = 1 + Math.floor(Math.random() * 12);
      const ref = unbKnapRef(wt, val, W);
      for (const mode of MODES) {
        const lim = unbKnap.limitsPerMode[mode](mode, { weights: wt, values: val, capacity: W });
        if (lim) continue;
        expect(unbKnap.buildTrace({ weights: wt, values: val, capacity: W }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("rejects mismatched weight/value lengths", () => {
    expect(unbKnap.schema.safeParse({ weights: [1, 2], values: [1], capacity: 3 }).success).toBe(false);
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("unbounded-knapsack", unbKnap, unbKnap.defaultInput));
});

/* -------------------------------- target sum ------------------------------- */

describe("target-sum", () => {
  it.each([
    [[1, 2, 3, 4, 5], 3, 3],
    [[1], 1, 1],
    [[1], -1, 1],
    [[1, 1, 1, 1, 1], 3, 5],
    [[2, 3], 1, 1], // -2+3 = 1
  ])("arr=%j T=%i -> %i assignments", (arr, target, expected) => {
    expect(targetSumBrute([...arr], target)).toBe(expected);
    for (const mode of MODES) {
      const lim = tSum.limitsPerMode[mode](mode, { arr: [...arr], target });
      if (lim) continue;
      expect(tSum.buildTrace({ arr, target }, mode).meta.answer).toBe(expected);
    }
  });

  it("randomized cross-check vs exhaustive ± enumeration", () => {
    for (let t = 0; t < 25; t++) {
      const arr = Array.from({ length: 1 + Math.floor(Math.random() * 5) }, () => 1 + Math.floor(Math.random() * 5));
      const target = -4 + Math.floor(Math.random() * 9);
      const ref = targetSumBrute(arr, target);
      for (const mode of MODES) {
        const lim = tSum.limitsPerMode[mode](mode, { arr, target });
        if (lim) continue;
        expect(tSum.buildTrace({ arr, target }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("impossible targets narrate a reason and yield 0", () => {
    const { steps } = tSum.buildTrace({ arr: [1, 2], target: 1 }, "tabulation"); // sum 3+... (1+3)=4 even? 1+3=4 → k=2 → possible!
    void steps;
    // pick genuinely impossible: arr=[1,1], T=1 → (1+2)=3 odd
    const res = tSum.buildTrace({ arr: [1, 1], target: 1 }, "tabulation");
    expect(res.meta.answer).toBe(0);
    expect(res.steps.some((s) => s.explanation.includes("even"))).toBe(true);
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("target-sum", tSum, tSum.defaultInput));
});

/* --------------------------- count partitions diff ------------------------ */

describe("count-partitions-diff", () => {
  it.each([
    [[1, 2, 3, 4], 2, 2],
    [[5, 2, 6, 4], 3, 1],
    [[1, 2], 4, 0], // (4+3)=7 odd → 0
    [[0, 1], 1, 2],
  ])("arr=%j D=%i -> %i partitions", (arr, d, expected) => {
    expect(partitionsDiffBrute([...arr], d)).toBe(expected);
    for (const mode of MODES) {
      const lim = partDiff.limitsPerMode[mode](mode, { arr: [...arr], d });
      if (lim) continue;
      expect(partDiff.buildTrace({ arr, d }, mode).meta.answer).toBe(expected);
    }
  });

  it("randomized cross-check vs brute force", () => {
    for (let t = 0; t < 25; t++) {
      const arr = Array.from({ length: 1 + Math.floor(Math.random() * 6) }, () => Math.floor(Math.random() * 8));
      const d = Math.floor(Math.random() * 10);
      const ref = partitionsDiffBrute(arr, d);
      for (const mode of MODES) {
        const lim = partDiff.limitsPerMode[mode](mode, { arr, d });
        if (lim) continue;
        expect(partDiff.buildTrace({ arr, d }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("count-partitions-diff", partDiff, partDiff.defaultInput));
});

/* -------------------------- partition min abs diff ------------------------- */

describe("partition-min-abs-diff", () => {
  it.each([
    [[1, 2, 3, 9], 3],
    [[1, 2, 7, 1, 5], 0],
    [[3, 1, 4, 2, 2, 1], 1],
    [[5], 5],
  ])("minDiff(%j) = %i across all modes", (arr, expected) => {
    expect(minDiffRef(arr)).toBe(expected);
    for (const mode of MODES) {
      const lim = minDiff.limitsPerMode[mode](mode, { arr: [...arr] });
      if (lim) continue;
      expect(minDiff.buildTrace({ arr }, mode).meta.answer).toBe(expected);
    }
  });

  it("randomized cross-check vs brute force", () => {
    for (let t = 0; t < 25; t++) {
      const arr = Array.from({ length: 1 + Math.floor(Math.random() * 6) }, () => 1 + Math.floor(Math.random() * 9));
      const ref = minDiffRef(arr);
      for (const mode of MODES) {
        const lim = minDiff.limitsPerMode[mode](mode, { arr });
        if (lim) continue;
        expect(minDiff.buildTrace({ arr }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("uses boolean cells in the table", () => {
    const { meta } = minDiff.buildTrace({ arr: [1, 2, 3, 9] }, "tabulation");
    expect(meta.valueFormat).toBe("bool");
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("partition-min-abs-diff", minDiff, minDiff.defaultInput));
});

/* ---------------------- longest palindromic subsequence -------------------- */

describe("longest-palindromic-subsequence", () => {
  it.each([
    ["bbbab", 4],
    ["cbbd", 2],
    ["a", 1],
    ["abcdefg", 1],
    ["racecar", 7],
    ["agbdba", 5],
  ])("lps(%s) = %i across all modes", (s, expected) => {
    expect(lpsRef(s)).toBe(expected);
    for (const mode of MODES) {
      const lim = lps.limitsPerMode[mode](mode, { s });
      if (lim) continue;
      expect(lps.buildTrace({ s }, mode).meta.answer).toBe(expected);
    }
  });

  it("randomized binary-string cross-check vs reference", () => {
    for (let t = 0; t < 25; t++) {
      const s = Array.from({ length: 3 + Math.floor(Math.random() * 4) }, () => "ab"[Math.floor(Math.random() * 2)]).join("");
      const ref = lpsRef(s);
      for (const mode of MODES) expect(lps.buildTrace({ s }, mode).meta.answer).toBe(ref);
    }
  });

  it("table stays upper-triangular: no write below the diagonal", () => {
    const { steps } = lps.buildTrace({ s: "abcba" }, "tabulation");
    for (const st of steps.filter((x) => x.type === "table-write" || x.type === "base-case"))
      expect(st.coordinates[1]).toBeGreaterThanOrEqual(st.coordinates[0]);
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("longest-palindromic-subsequence", lps, lps.defaultInput));
});

/* -------------------------------- hygiene sweep ---------------------------- */

describe("trace hygiene for batch-4 services", () => {
  const cases: [string, ReturnType<typeof getService>][] = [
    ["stock-i", stockI],
    ["unbounded-knapsack", unbKnap],
    ["target-sum", tSum],
    ["count-partitions-diff", partDiff],
    ["partition-min-abs-diff", minDiff],
    ["longest-palindromic-subsequence", lps],
  ];

  for (const [slug, svc] of cases) {
    it(`${slug}: bounded traces, deps written earlier, sane stats`, () => {
      const s = svc!;
      for (const mode of MODES) {
        const { steps, meta } = s.buildTrace(s.defaultInput, mode);
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

  it("every defaultInput parses against its schema (API-safe)", () => {
    for (const svc of [stockI, unbKnap, tSum, partDiff, minDiff, lps]) {
      const parsed = svc.schema.safeParse(svc.defaultInput);
      expect(parsed.success, `${svc.slug}: ${JSON.stringify(parsed.success ? null : (parsed as { error?: { issues?: unknown[] } }).error?.issues)}`).toBe(true);
      // and must not be blocked by any per-mode limit either
      for (const mode of MODES)
        expect(svc.limitsPerMode[mode](mode, parsed.success ? parsed.data : undefined), `${svc.slug}/${mode} default limit`).toBeNull();
    }
  });
});
