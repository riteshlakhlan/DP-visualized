import { describe, it, expect } from "vitest";
import { getService } from "../../src/services/registry";

const lisLen = getService("lis-length")!;
const lisPrint = getService("lis-print")!;
const lisBin = getService("lis-binary-search")!;
const divSubset = getService("largest-divisible-subset")!;
const strChain = getService("longest-string-chain")!;
const bitonic = getService("longest-bitonic")!;
const numLIS = getService("number-of-lis")!;

const MODES = ["bruteforce", "memo", "tabulation", "spaceOptimized"] as const;

/* ------------------------------ references ------------------------------ */

const o2Lis = (a: number[]): number[] => {
  const n = a.length;
  const dp = new Array(n).fill(1);
  for (let i = 1; i < n; i++)
    for (let j = 0; j < i; j++)
      if (a[j] < a[i]) dp[i] = Math.max(dp[i], dp[j] + 1);
  return dp;
};
const lisLenRef = (a: number[]): number => Math.max(...o2Lis(a));

function lisExhaustive(a: number[]): number {
  let best = 0;
  const rec = (i: number, lastVal: number, len: number) => {
    best = Math.max(best, len);
    for (let k = i; k < a.length; k++)
      if (a[k] > lastVal) rec(k + 1, a[k], len + 1);
  };
  rec(0, -Infinity, 0);
  return best;
}

function isSubsequenceOf(sub: number[], arr: number[]): boolean {
  let ai = 0;
  for (const x of sub) {
    while (ai < arr.length && arr[ai] !== x) ai++;
    if (ai >= arr.length) return false;
    ai++;
  }
  return true;
}

const strictlyIncreasing = (sub: number[]) =>
  sub.every((x, i) => i === 0 || x > sub[i - 1]);

function divSubsetExhaustive(a: number[]): number {
  let best = 0;
  const ok = (sub: number[]) => {
    for (const x of sub)
      for (const y of sub) {
        const big = Math.max(x, y), small = Math.min(x, y);
        if (big % small !== 0) return false;
      }
    return true;
  };
  const rec = (i: number, cur: number[]) => {
    if (ok(cur)) best = Math.max(best, cur.length);
    if (i === a.length) return;
    rec(i + 1, [...cur, a[i]]);
    rec(i + 1, cur);
  };
  rec(0, []);
  return best;
}

function oneLetterDiff(a: string, b: string): boolean {
  // b must equal a plus exactly one inserted letter
  if (b.length !== a.length + 1) return false;
  let ai = 0, bi = 0, used = false;
  while (ai < a.length && bi < b.length) {
    if (a[ai] === b[bi]) { ai++; bi++; }
    else { if (used) return false; used = true; bi++; }
  }
  return true; // tail of b (one leftover char) is the insertion
}

function strChainExhaustive(wordsRaw: string): number {
  const words = wordsRaw.split(",");
  let best = 1;
  const rec = (w: string, len: number) => {
    best = Math.max(best, len);
    for (const cand of words)
      if (oneLetterDiff(w, cand)) rec(cand, len + 1);
  };
  for (const w of words) rec(w, 1);
  return best;
}

/** exhaustive count of distinct LIS */
function numLisExhaustive(a: number[]): { len: number; count: number } {
  let bestLen = 0, count = 0;
  const seqs: number[][] = [];
  const rec = (i: number, seq: number[]) => {
    if (i === a.length) {
      seqs.push(seq);
      return;
    }
    rec(i + 1, seq);                                   // skip index i
    if (seq.length === 0 || a[i] > seq[seq.length - 1])
      rec(i + 1, [...seq, a[i]]);                      // take index i
  };
  rec(0, []);
  for (const s of seqs) bestLen = Math.max(bestLen, s.length);
  for (const s of seqs) if (s.length === bestLen) count++;
  return { len: bestLen, count };
}

function expectAnchorsResolve(slug: string, svc: ReturnType<typeof getService>, input: unknown) {
  const s = svc!;
  for (const mode of MODES) {
    const variant = { bruteforce: "bruteforce", memo: "memoization", tabulation: "tabulation", spaceOptimized: "spaceOptimized" }[mode] as keyof typeof s.codes;
    const def = s.codes[variant];
    if (!def) continue;
    const { steps } = s.buildTrace(input, mode);
    const used = new Set(steps.map((st) => st.codeAnchor).filter(Boolean));
    for (const [lang, snip] of Object.entries(def))
      for (const a of used)
        expect(snip.anchors[a as string], `${slug}/${mode}/${lang} missing anchor "${a}"`).toBeDefined();
  }
}

const randArr = () => Array.from({ length: 3 + Math.floor(Math.random() * 5) }, () => 1 + Math.floor(Math.random() * 5));

/* ------------------------------- lis length ------------------------------ */

describe("lis-length", () => {
  it("LC300 classic = 4 across available modes", () => {
    const arr = [10, 9, 2, 5, 3, 7, 101, 18];
    expect(lisLenRef(arr)).toBe(4);
    for (const mode of ["memo", "tabulation"] as const)
      expect(lisLen.buildTrace({ arr }, mode).meta.answer).toBe(4);
  });

  it("randomized cross-check vs O(n^2) reference", () => {
    for (let t = 0; t < 20; t++) {
      const a = randArr();
      const ref = lisLenRef(a);
      expect(lisLen.buildTrace({ arr: a }, "memo").meta.answer).toBe(ref);
      expect(lisLen.buildTrace({ arr: a }, "tabulation").meta.answer).toBe(ref);
    }
  });

  it("brute agrees on small inputs", () => {
    for (let t = 0; t < 10; t++) {
      const a = randArr().slice(0, 5);
      expect(lisLen.buildTrace({ arr: a }, "bruteforce").meta.answer).toBe(lisExhaustive(a));
    }
  });

  it("spaceOptimized intentionally declined", () => {
    expect(lisLen.limitsPerMode.spaceOptimized("spaceOptimized", lisLen.defaultInput)).toContain("no further compression");
    expect(lisLen.codes.spaceOptimized).toBeUndefined();
  });

  it("anchors resolve in available variants", () => expectAnchorsResolve("lis-length", lisLen, lisLen.defaultInput));
});

/* --------------------------------- lis print ------------------------------- */

describe("lis-print", () => {
  const input = { arr: [5, 4, 11, 1, 16, 8] };

  it("backtrace yields a real strictly-increasing subsequence of maximal length", () => {
    for (const mode of ["memo", "tabulation"] as const) {
      const res = lisPrint.buildTrace(input, mode);
      const finalStep = [...res.steps].reverse().find((st) => st.explanation.includes("longest increasing subsequence"));
      expect(finalStep).toBeDefined();
      const nums = finalStep!.explanation.match(/\[([\d, ]*)\]/)![1].split(",").filter(Boolean).map(Number);
      expect(nums.every((x) => input.arr.includes(x))).toBe(true);
      expect(isSubsequenceOf(nums, input.arr)).toBe(true);
      expect(strictlyIncreasing(nums)).toBe(true);
      expect(nums.length).toBe(lisLenRef(input.arr));
      void mode;
    }
  });

  it("randomized answers match reference", () => {
    for (let t = 0; t < 25; t++) {
      const a = randArr();
      for (const mode of ["memo", "tabulation"] as const)
        expect(lisPrint.buildTrace({ arr: a }, mode).meta.answer).toBe(lisLenRef(a));
    }
  });

  it("derived line shows the printed LIS", () => {
    const res = lisPrint.buildTrace(input, "tabulation");
    expect(res.meta.derived).toMatch(/LIS = \[\d/);
  });

  it("unusable variants are declined with an explanation", () => {
    expect(lisPrint.limitsPerMode.spaceOptimized("spaceOptimized")).toContain("parent");
    expect(lisPrint.codes.spaceOptimized).toBeUndefined();
  });

  it("anchors resolve in available variants", () => expectAnchorsResolve("lis-print", lisPrint, input));
});

/* ----------------------------- lis binary search --------------------------- */

describe("lis-binary-search", () => {
  it("LC300 classic via patience sorting", () => {
    const arr = [10, 9, 2, 5, 3, 7, 101, 18];
    expect(lisBin.buildTrace({ arr }, "tabulation").meta.answer).toBe(4);
  });

  it("randomized cross-check vs O(n^2) reference", () => {
    for (let t = 0; t < 30; t++) {
      const a = randArr();
      expect(lisBin.buildTrace({ arr: a }, "tabulation").meta.answer).toBe(lisLenRef(a));
    }
  });

  it("other modes are declined with an explanation", () => {
    for (const m of ["bruteforce", "memo", "spaceOptimized"] as const)
      expect(lisBin.limitsPerMode[m](m, {} as never)).toContain("Patience sorting");
    expect(lisBin.codes.tabulation).toBeDefined();
  });

  it("anchors resolve in tabulation variant", () => expectAnchorsResolve("lis-binary-search", lisBin, lisBin.defaultInput));
});

/* -------------------------- largest divisible subset ----------------------- */

describe("largest-divisible-subset", () => {
  it.each([
    [[1, 3, 5, 15], 3],
    [[2, 4, 8], 3],
    [[5], 1],
    [[9, 7], 1],
  ])("divSubset(%j) = %i across available modes", (arr, expected) => {
    expect(divSubsetExhaustive([...arr])).toBe(expected);
    expect(divSubset.buildTrace({ arr }, "memo").meta.answer).toBe(expected);
    expect(divSubset.buildTrace({ arr }, "tabulation").meta.answer).toBe(expected);
    if (arr.length <= 6) {
      const lim = divSubset.limitsPerMode.bruteforce("bruteforce");
      if (!lim) expect(divSubset.buildTrace({ arr }, "bruteforce").meta.answer).toBe(expected);
    }
  });

  it("randomized cross-check vs exhaustive subsets", () => {
    for (let t = 0; t < 15; t++) {
      const a = randArr().slice(0, 6);
      const ref = divSubsetExhaustive(a);
      for (const mode of ["memo", "tabulation"] as const)
        expect(divSubset.buildTrace({ arr: a }, mode).meta.answer).toBe(ref);
    }
  });

  it("anchors resolve in available variants", () => expectAnchorsResolve("largest-divisible-subset", divSubset, divSubset.defaultInput));
});

/* -------------------------------- string chain ------------------------------ */

describe("longest-string-chain", () => {
  it.each([
    ["a,ba,bda,bdca", 4],
    ["xbc,pcxbcf,xb,cxhabfgbxgt,gbxgu,xbc", 2], // degenerate-ish; exhaustive decides
    ["a,b,ab,abc", 3],
  ])("chain(%s) across modes (exhaustive-verified)", (wordsRaw) => {
    const expected = strChainExhaustive(wordsRaw);
    for (const mode of ["memo", "tabulation"] as const)
      expect(strChain.buildTrace({ words: wordsRaw }, mode).meta.answer).toBe(expected);
  });

  it("randomized cross-check vs exhaustive chains", () => {
    const pools = ["a,ba,bda", "a,ab,abc", "b,c,bd"];
    for (let t = 0; t < 10; t++) {
      const raw = pools[t % pools.length];
      const expected = strChainExhaustive(raw);
      for (const mode of ["memo", "tabulation"] as const)
        expect(strChain.buildTrace({ words: raw }, mode).meta.answer).toBe(expected);
    }
  });

  it("anchors resolve in available variants", () => expectAnchorsResolve("longest-string-chain", strChain, strChain.defaultInput));
});

/* ------------------------------- longest bitonic ---------------------------- */

describe("longest-bitonic", () => {
  it.each([
    [[1, 11, 2, 10, 4, 5, 2, 1], 6],
    [[12, 11, 40, 5, 3, 1], 5],
    [[80, 60, 30, 40, 20, 10], 5],
    [[1, 2, 3, 4, 5], 5], // purely rising counts
  ])("bitonic(%j) = %i", (arr, expected) => {
    // independent reference: max over peaks of lisLR + lisRL - 1
    const n = arr.length;
    const inc = new Array(n).fill(1), dec = new Array(n).fill(1);
    for (let i = 1; i < n; i++)
      for (let j = 0; j < i; j++)
        if (arr[j] < arr[i]) inc[i] = Math.max(inc[i], inc[j] + 1);
    for (let i = n - 2; i >= 0; i--)
      for (let j = n - 1; j > i; j--)
        if (arr[j] < arr[i]) dec[i] = Math.max(dec[i], dec[j] + 1);
    let ref = 0;
    for (let i = 0; i < n; i++) ref = Math.max(ref, inc[i] + dec[i] - 1);
    expect(ref).toBe(expected);
    expect(bitonic.buildTrace({ arr }, "tabulation").meta.answer).toBe(expected);
  });

  it("anchors resolve in tabulation variant", () => expectAnchorsResolve("longest-bitonic", bitonic, bitonic.defaultInput));
});

/* -------------------------------- number of LIS ------------------------------ */

describe("number-of-lis", () => {
  it.each([
    [[1, 3, 5, 4, 7], 4, 2],
    [[2, 2, 2, 2, 2], 1, 5],
    [[1], 1, 1],
    [[1, 2, 4, 3, 5, 4, 7, 2], 5, 3],
  ])("numLIS(%j): len=%i count=%i", (arr, len, count) => {
    const ex = numLisExhaustive(arr);
    expect(ex.len).toBe(len);
    expect(ex.count).toBe(count);
    expect(numLIS.buildTrace({ arr }, "tabulation").meta.answer).toBe(count);
  });

  it("randomized cross-check vs exhaustive enumeration", () => {
    for (let t = 0; t < 15; t++) {
      const a = randArr().slice(0, 6);
      const ex = numLisExhaustive(a);
      expect(numLIS.buildTrace({ arr: a }, "tabulation").meta.answer).toBe(ex.count);
    }
  });

  it("anchors resolve in tabulation variant", () => expectAnchorsResolve("number-of-lis", numLIS, numLIS.defaultInput));
});

/* ------------------------------- hygiene sweep ------------------------------ */

describe("trace hygiene for LIS services", () => {
  const cases: [string, ReturnType<typeof getService>][] = [
    ["lis-length", lisLen],
    ["lis-print", lisPrint],
    ["lis-binary-search", lisBin],
    ["largest-divisible-subset", divSubset],
    ["longest-string-chain", strChain],
    ["longest-bitonic", bitonic],
    ["number-of-lis", numLIS],
  ];

  for (const [slug, svc] of cases) {
    it(`${slug}: bounded traces, deps written earlier, sane stats`, () => {
      const s = svc!;
      for (const mode of MODES) {
        if (s.limitsPerMode[mode](mode, s.defaultInput as never)) continue;
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
              expect(at, `${slug}/${mode}: dep ${d} of ${ck}`).toBeLessThan(idx);
          }
        });
        expect(meta.stats.steps).toBe(steps.length);
      }
    });

    it(`${slug}: defaultInput parses and passes limits for shipped variants`, () => {
      const parsed = svc.schema.safeParse(svc.defaultInput);
      expect(parsed.success, slug).toBe(true);
      for (const mode of MODES) {
        const variant = { bruteforce: "bruteforce", memo: "memoization", tabulation: "tabulation", spaceOptimized: "spaceOptimized" }[mode] as keyof typeof svc.codes;
        if (!(svc.codes as Record<string, unknown>)[variant]) continue;
        expect(svc.limitsPerMode[mode](mode, parsed.success ? parsed.data : undefined), `${slug}/${mode}`).toBeNull();
      }
    });
  }
});

