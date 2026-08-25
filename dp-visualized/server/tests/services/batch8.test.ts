import { describe, it, expect } from "vitest";
import { getService } from "../../src/services/registry";

const mcm = getService("mcm")!;
const mcmBU = getService("mcm-bottom-up")!;
const balloons = getService("burst-balloons")!;
const cutStick = getService("min-cost-cut-stick")!;
const boolParen = getService("boolean-parenthesization")!;
const palPart = getService("palindrome-partitioning-ii")!;
const partMax = getService("partition-max-sum")!;

const MODES = ["bruteforce", "memo", "tabulation", "spaceOptimized"] as const;

/* ------------------------------ references ------------------------------ */

/** independent memoized MCM (different keying than services) */
function mcmRef(p: number[]): number {
  const n = p.length - 1;
  const memo = new Map<string, number>();
  const f = (i: number, j: number): number => {
    if (i === j) return 0;
    const k0 = `${i}|${j}`;
    if (memo.has(k0)) return memo.get(k0)!;
    let best = Infinity;
    for (let k = i; k < j; k++)
      best = Math.min(best, f(i, k) + f(k + 1, j) + p[i - 1] * p[k] * p[j]);
    memo.set(k0, best);
    return best;
  };
  return f(1, n);
}

/** exhaustive burst order simulation */
function burstExhaustive(nums: number[]): number {
  let best = 0;
  const rec = (arr: number[], coins: number) => {
    if (arr.length === 0) {
      best = Math.max(best, coins);
      return;
    }
    for (let i = 0; i < arr.length; i++) {
      const left = arr[i - 1] ?? 1;
      const right = arr[i + 1] ?? 1;
      const gain = left * arr[i] * right;
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      rec(rest, coins + gain);
    }
  };
  rec([...nums], 0);
  return best;
}

function cutStickExhaustive(n: number, cuts: number[]): number {
  let best = Infinity;
  for (const perm of perms([...cuts].sort((a, b) => a - b))) {
    const segs: [number, number][] = [[0, n]];
    let total = 0;
    let ok = true;
    for (const c of perm) {
      const si = segs.findIndex(([a, b]) => a < c && c < b);
      if (si < 0) { ok = false; break; }
      total += segs[si][1] - segs[si][0];
      const [a] = segs[si];
      segs.splice(si, 1, [a, c], [c, segs[si][1]]);
    }
    if (ok) best = Math.min(best, total);
  }
  return best;
}

function perms<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of perms(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

function boolCountExhaustive(e: string): number {
  const vals = e.split("").filter((_, i) => i % 2 === 0);
  const ops = e.split("").filter((_, i) => i % 2 === 1);
  const rec = (l: number, r: number): { t: number; f: number } => {
    if (l === r) return { t: vals[l] === "T" ? 1 : 0, f: vals[l] === "T" ? 0 : 1 };
    let T = 0, F = 0;
    for (let k = l; k < r; k++) {
      const L = rec(l, k), R = rec(k + 1, r);
      if (ops[k] === "&") { T += L.t * R.t; F += L.f * R.f + L.f * R.t + L.t * R.f; }
      else if (ops[k] === "|") { T += L.t * R.t + L.t * R.f + L.f * R.t; F += L.f * R.f; }
      else { T += L.t * R.f + L.f * R.t; F += L.t * R.t + L.f * R.f; }
    }
    return { t: T, f: F };
  };
  return rec(0, vals.length - 1).t;
}

function palCutsExhaustive(s: string): number {
  const pal = (x: string) => x === [...x].reverse().join("");
  let best = Infinity;
  const total = 1 << (s.length - 1);
  for (let m = 0; m < total; m++) {
    const parts: string[] = [];
    let start = 0;
    for (let i = 0; i < s.length - 1; i++)
      if (m & (1 << i)) { parts.push(s.slice(start, i + 1)); start = i + 1; }
    parts.push(s.slice(start));
    if (parts.every(pal)) best = Math.min(best, parts.length - 1);
  }
  return best;
}

function partMaxRef(a: number[], k: number): number {
  const dp = new Array(a.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let mx = 0;
    for (let len = 1; len <= Math.min(i, k); len++) {
      mx = Math.max(mx, a[i - len]);
      dp[i] = Math.max(dp[i], dp[i - len] + mx * len);
    }
  }
  return dp[a.length];
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

/* --------------------------------- mcm pair ------------------------------- */

describe("mcm + mcm-bottom-up", () => {
  it.each([
    [[10, 20, 30, 40, 30], 30000],
    [[40, 20, 30, 10, 30], 26000],
    [[10, 20, 30], 6000],
    [[5, 10], 0],
  ])("dims=%j -> %i across available modes", (dims, expected) => {
    expect(mcmRef(dims)).toBe(expected);
    // mcm: brute capped by matrix count
    const limB = mcm.limitsPerMode.bruteforce("bruteforce", { dims });
    if (!limB) expect(mcm.buildTrace({ dims }, "bruteforce").meta.answer).toBe(expected);
    expect(mcm.buildTrace({ dims }, "memo").meta.answer).toBe(expected);
    expect(mcm.buildTrace({ dims }, "tabulation").meta.answer).toBe(expected);
    // bottom-up: tab only
    expect(mcmBU.buildTrace({ dims }, "tabulation").meta.answer).toBe(expected);
  });

  it("randomized cross-check vs independent reference", () => {
    for (let t = 0; t < 25; t++) {
      const dims = Array.from({ length: 3 + Math.floor(Math.random() * 4) }, () => 1 + Math.floor(Math.random() * 20));
      const ref = mcmRef(dims);
      expect(mcm.buildTrace({ dims }, "memo").meta.answer).toBe(ref);
      expect(mcm.buildTrace({ dims }, "tabulation").meta.answer).toBe(ref);
      expect(mcmBU.buildTrace({ dims }, "tabulation").meta.answer).toBe(ref);
    }
  });

  it("bottom-up declines non-tab modes with explanation", () => {
    for (const m of ["bruteforce", "memo", "spaceOptimized"] as const)
      expect(mcmBU.limitsPerMode[m](m, {} as never)).toContain("bottom-up");
    expect(mcmBU.codes.tabulation).toBeDefined();
  });

  it("anchors resolve in available variants", () => {
    expectAnchorsResolve("mcm", mcm, mcm.defaultInput);
    expectAnchorsResolve("mcm-bottom-up", mcmBU, mcmBU.defaultInput);
  });
});

/* ------------------------------ burst balloons ----------------------------- */

describe("burst-balloons", () => {
  it("LC312 classic [3,1,5,8] = 167 across available modes", () => {
    const nums = [3, 1, 5, 8];
    expect(burstExhaustive(nums)).toBe(167);
    const limB = balloons.limitsPerMode.bruteforce("bruteforce", { nums });
    if (!limB) expect(balloons.buildTrace({ nums }, "bruteforce").meta.answer).toBe(167);
    expect(balloons.buildTrace({ nums }, "memo").meta.answer).toBe(167);
    expect(balloons.buildTrace({ nums }, "tabulation").meta.answer).toBe(167);
  });

  it("randomized cross-check vs exhaustive burst simulation", () => {
    for (let t = 0; t < 12; t++) {
      const nums = Array.from({ length: 2 + Math.floor(Math.random() * 4) }, () => 1 + Math.floor(Math.random() * 6));
      const ref = burstExhaustive(nums);
      for (const mode of MODES) {
        const lim = balloons.limitsPerMode[mode](mode, { nums });
        if (lim) continue;
        expect(balloons.buildTrace({ nums }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("anchors resolve in available variants", () => expectAnchorsResolve("burst-balloons", balloons, balloons.defaultInput));
});

/* ---------------------------- min cost cut stick --------------------------- */

describe("min-cost-cut-stick", () => {
  it("Striver example n=7 cuts=[1,3,4,5] = 16 across available modes", () => {
    const input = { cuts: [1, 3, 4, 5], n: 7 };
    expect(cutStickExhaustive(7, [1, 3, 4, 5])).toBe(16);
    for (const mode of MODES) {
      const lim = cutStick.limitsPerMode[mode](mode, input);
      if (lim) continue;
      expect(cutStick.buildTrace(input, mode).meta.answer).toBe(16);
    }
  });

  it("randomized cross-check vs exhaustive cut orders", () => {
    for (let t = 0; t < 15; t++) {
      const n = 5 + Math.floor(Math.random() * 6);
      const cuts = [...new Set(Array.from({ length: 1 + Math.floor(Math.random() * 3) },
        () => 1 + Math.floor(Math.random() * (n - 1))))];
      const input = { cuts, n };
      const ref = cutStickExhaustive(n, cuts);
      for (const mode of MODES) {
        const lim = cutStick.limitsPerMode[mode](mode, input);
        if (lim) continue;
        expect(cutStick.buildTrace(input, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("pads appear in the derived line", () => {
    const res = cutStick.buildTrace(cutStick.defaultInput as never, "tabulation");
    expect(res.meta.derived).toMatch(/padded cuts = \[0,/);
  });

  it("anchors resolve in available variants", () => expectAnchorsResolve("min-cost-cut-stick", cutStick, cutStick.defaultInput));
});

/* ------------------------- boolean parenthesization ------------------------ */

describe("boolean-parenthesization", () => {
  it.each([
    ["T|F&T^F", 5],
    ["T^F|F", 2],
    ["T&T", 1],
    ["F|F", 0],
  ])("countTrue(%s) = %i", (expr, expected) => {
    expect(boolCountExhaustive(expr)).toBe(expected);
    expect(boolParen.buildTrace({ expr }, "tabulation").meta.answer).toBe(expected);
  });

  it("randomized cross-check vs exhaustive parenthesization", () => {
    for (let t = 0; t < 20; t++) {
      const expr = Array.from({ length: 5 }, (_, i) =>
        i % 2 === 0 ? ("TF")[Math.floor(Math.random() * 2)] : ["&", "|", "^"][Math.floor(Math.random() * 3)]).join("");
      expect(boolParen.buildTrace({ expr }, "tabulation").meta.answer).toBe(boolCountExhaustive(expr));
    }
  });

  it("non-tab modes are not shipped at all", () => {
    for (const m of ["bruteforce", "memo", "spaceOptimized"] as const) {
      const variant = { bruteforce: "bruteforce", memo: "memoization", spaceOptimized: "spaceOptimized" }[m] as keyof typeof boolParen.codes;
      expect((boolParen.codes as Record<string, unknown>)[variant]).toBeUndefined();
      // API-side gate also refuses them
      expect(limitsBlocksOrMissing(boolParen, m, boolParen.defaultInput)).toBe(true);
    }
  });

  function limitsBlocksOrMissing(svc: ReturnType<typeof getService>, mode: DPMode, input: unknown): boolean {
    const variant = { bruteforce: "bruteforce", memo: "memoization", tabulation: "tabulation", spaceOptimized: "spaceOptimized" }[mode] as keyof typeof svc.codes;
    if (!(svc.codes as Record<string, unknown>)[variant]) return true;
    return svc.limitsPerMode[mode](mode, input) !== null;
  }

  it("anchors resolve in tabulation variant", () => expectAnchorsResolve("boolean-parenthesization", boolParen, boolParen.defaultInput));
});

/* ------------------------ palindrome partitioning II ----------------------- */

describe("palindrome-partitioning-ii", () => {
  it.each([
    ["abccbc", 2],
    ["aab", 1],
    ["aaa", 0],
    ["a", 0],
    ["ab", 1],
  ])("minCut(%s) = %i across available modes", (s, expected) => {
    expect(palCutsExhaustive(s)).toBe(expected);
    for (const mode of MODES) {
      const lim = palPart.limitsPerMode[mode](mode, { s });
      if (lim) continue;
      expect(palPart.buildTrace({ s }, mode).meta.answer).toBe(expected);
    }
  });

  it("randomized cross-check vs exhaustive partitions", () => {
    const rand = () => Array.from({ length: 3 + Math.floor(Math.random() * 3) }, () => "abc"[Math.floor(Math.random() * 3)]).join("");
    for (let t = 0; t < 20; t++) {
      const s = rand();
      const ref = palCutsExhaustive(s);
      for (const mode of MODES) {
        const lim = palPart.limitsPerMode[mode](mode, { s });
        if (lim) continue;
        expect(palPart.buildTrace({ s }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("anchors resolve in available variants", () => expectAnchorsResolve("palindrome-partitioning-ii", palPart, palPart.defaultInput));
});

/* --------------------------- partition max sum ----------------------------- */

describe("partition-max-sum", () => {
  it("LC1043 classic = 84 across all four modes", () => {
    const input = { arr: [1, 15, 7, 9, 2, 5, 10], k: 3 };
    for (const mode of MODES)
      expect(partMax.buildTrace(input, mode).meta.answer).toBe(84);
  });

  it("randomized cross-check vs reference DP", () => {
    for (let t = 0; t < 25; t++) {
      const arr = Array.from({ length: 3 + Math.floor(Math.random() * 5) }, () => 1 + Math.floor(Math.random() * 9));
      const k = 1 + Math.floor(Math.random() * 4);
      const ref = partMaxRef(arr, k);
      for (const mode of MODES)
        expect(partMax.buildTrace({ arr, k }, mode).meta.answer).toBe(ref);
    }
  });

  it("k >= n makes whole array one chunk", () => {
    const arr = [2, 5];
    for (const mode of MODES)
      expect(partMax.buildTrace({ arr, k: 4 }, mode).meta.answer).toBe(10); // max 5 * len 2
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("partition-max-sum", partMax, partMax.defaultInput));
});

/* ------------------------------- hygiene sweep ------------------------------ */

describe("trace hygiene for MCM services", () => {
  const cases: [string, ReturnType<typeof getService>][] = [
    ["mcm", mcm],
    ["mcm-bottom-up", mcmBU],
    ["burst-balloons", balloons],
    ["min-cost-cut-stick", cutStick],
    ["boolean-parenthesization", boolParen],
    ["palindrome-partitioning-ii", palPart],
    ["partition-max-sum", partMax],
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
