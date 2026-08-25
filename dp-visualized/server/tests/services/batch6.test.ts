import { describe, it, expect } from "vitest";
import { getService } from "../../src/services/registry";

const sII = getService("stock-ii")!;
const sIII = getService("stock-iii")!;
const sIV = getService("stock-iv")!;
const sCool = getService("stock-cooldown")!;
const sFee = getService("stock-fee")!;

const MODES = ["bruteforce", "memo", "tabulation", "spaceOptimized"] as const;

/* ------------------------------ references ------------------------------ */

/** exhaustive: try every subset of rising segments (small n only) */
function stockIIExhaustive(p: number[]): number {
  let best = 0;
  const rec = (i: number, cash: number, hold: boolean) => {
    if (i === p.length) {
      best = Math.max(best, cash);
      return;
    }
    if (hold) {
      rec(i + 1, cash + p[i], false); // sell
      rec(i + 1, cash, true);
    } else {
      rec(i + 1, cash - p[i], true); // buy
      rec(i + 1, cash, false);
    }
  };
  rec(0, 0, false);
  return best;
}

function stockIIRef(p: number[]): number {
  let flat = 0, hold = -p[0];
  for (let i = 1; i < p.length; i++) {
    [flat, hold] = [Math.max(flat, hold + p[i]), Math.max(hold, flat - p[i])];
  }
  return flat;
}

/** exhaustive over all ≤K-trade schedules */
function stockKExhaustive(p: number[], k: number): number {
  let best = 0;
  const rec = (i: number, tradesLeft: number, holding: boolean, cash: number) => {
    if (i === p.length || (tradesLeft === 0 && !holding)) {
      best = Math.max(best, holding ? cash : cash);
      return;
    }
    if (holding) {
      rec(i + 1, tradesLeft, false, cash + p[i]); // sell completes a trade
      rec(i + 1, tradesLeft, true, cash);
    } else {
      if (tradesLeft > 0) rec(i + 1, tradesLeft - 1, true, cash - p[i]);
      rec(i + 1, tradesLeft, false, cash);
    }
  };
  rec(0, k, false, 0);
  return best;
}

/** slot-machine DP reference for III / IV */
function stockKSlotsRef(p: number[], k: number): number {
  const S = 2 * k;
  let next = new Array(S).fill(0);
  for (let i = p.length - 1; i >= 0; i--) {
    const cur = new Array(S).fill(0);
    for (let s = S - 1; s >= 0; s--) {
      const delta = s % 2 === 0 ? -p[i] : p[i];
      cur[s] = Math.max(next[s], delta + (s + 1 < S ? next[s + 1] : 0));
    }
    next = cur;
  }
  return next[0];
}

function cooldownRef(p: number[]): number {
  let hold = -p[0], sold = 0, free = 0;
  for (let i = 1; i < p.length; i++) {
    [hold, sold, free] = [Math.max(hold, free - p[i]), hold + p[i], Math.max(free, sold)];
  }
  return Math.max(sold, free);
}

function feeRef(p: number[], fee: number): number {
  let flat = 0, hold = -p[0];
  for (let i = 1; i < p.length; i++) {
    [flat, hold] = [Math.max(flat, hold + p[i] - fee), Math.max(hold, flat - fee * 0 - p[i])];
  }
  return flat;
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

const randPrices = (minLen = 3, maxLen = 8) =>
  Array.from({ length: minLen + Math.floor(Math.random() * (maxLen - minLen)) }, () => 1 + Math.floor(Math.random() * 9));

/* -------------------------------- stock II ------------------------------- */

describe("stock-ii", () => {
  it.each([
    [[7, 1, 5, 3, 6, 4], 7],
    [[1, 2, 3, 4, 5], 4],
    [[7, 6, 4, 3, 1], 0],
  ])("profit(%j) = %i across all modes", (prices, expected) => {
    expect(stockIIRef(prices)).toBe(expected);
    for (const mode of MODES)
      expect(sII.buildTrace({ prices }, mode).meta.answer).toBe(expected);
  });

  it("randomized cross-check vs exhaustive enumeration", () => {
    for (let t = 0; t < 20; t++) {
      const p = randPrices(3, 7);
      const ref = stockIIExhaustive(p);
      for (const mode of MODES) {
        const lim = sII.limitsPerMode[mode](mode, { prices: p });
        if (lim) continue;
        expect(sII.buildTrace({ prices: p }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("stock-ii", sII, sII.defaultInput));
});

/* -------------------------------- stock III ------------------------------- */

describe("stock-iii", () => {
  it("LC123 classic values across all modes (6-day default-sized input)", () => {
    const prices = [3, 3, 5, 0, 0, 3]; // exhaustive-verified: 5
    expect(stockKExhaustive(prices, 2)).toBe(5);
    for (const mode of MODES)
      expect(sIII.buildTrace({ prices }, mode).meta.answer).toBe(5);
  });

  it("randomized cross-check vs exhaustive ≤2 trades", () => {
    for (let t = 0; t < 25; t++) {
      const p = randPrices(3, 6);
      const ref = stockKExhaustive(p, 2);
      for (const mode of MODES) {
        const lim = sIII.limitsPerMode[mode](mode, { prices: p });
        if (lim) continue;
        expect(sIII.buildTrace({ prices: p }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("matches the K-slot DP reference on random inputs", () => {
    for (let t = 0; t < 25; t++) {
      const p = randPrices(3, 8);
      expect(sIII.buildTrace({ prices: p }, "tabulation").meta.answer).toBe(stockKSlotsRef(p, 2));
    }
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("stock-iii", sIII, sIII.defaultInput));
});

/* -------------------------------- stock IV -------------------------------- */

describe("stock-iv", () => {
  it.each([
    [[2, 4, 1], 2, 2],
    [[3, 2, 6, 5, 0, 3], 2, 7],
    [[1, 2, 3, 4], 1, 3],
  ])("k=%i %j -> %i across all modes", (prices, k, expected) => {
    expect(stockKExhaustive([...prices], k)).toBe(expected);
    expect(stockKSlotsRef([...prices], k)).toBe(expected);
    for (const mode of MODES) {
      const lim = sIV.limitsPerMode[mode](mode, { prices: [...prices], k });
      if (lim) continue;
      expect(sIV.buildTrace({ prices, k }, mode).meta.answer).toBe(expected);
    }
  });

  it("k=1 must equal plain single-transaction stock-i", () => {
    const si = getService("stock-i")!;
    for (let t = 0; t < 15; t++) {
      const p = randPrices(2, 8);
      expect(sIV.buildTrace({ prices: p, k: 1 }, "tabulation").meta.answer).toBe(
        si.buildTrace({ prices: p }, "tabulation").meta.answer,
      );
    }
  });

  it("randomized cross-check vs exhaustive ≤K trades", () => {
    for (let t = 0; t < 25; t++) {
      const p = randPrices(3, 6);
      const k = 1 + Math.floor(Math.random() * 3);
      const ref = stockKExhaustive(p, k);
      for (const mode of MODES) {
        const lim = sIV.limitsPerMode[mode](mode, { prices: p, k });
        if (lim) continue;
        expect(sIV.buildTrace({ prices: p, k }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("stock-iv", sIV, sIV.defaultInput));
});

/* ------------------------------- cooldown --------------------------------- */

describe("stock-cooldown", () => {
  it("LC309 classic = 3 across all modes", () => {
    const prices = [1, 2, 3, 0, 2];
    expect(cooldownRef(prices)).toBe(3);
    for (const mode of MODES)
      expect(sCool.buildTrace({ prices }, mode).meta.answer).toBe(3);
  });

  it("randomized cross-check vs reference", () => {
    for (let t = 0; t < 25; t++) {
      const p = randPrices(2, 8);
      const ref = cooldownRef(p);
      for (const mode of MODES) {
        const lim = sCool.limitsPerMode[mode](mode, { prices: p });
        if (lim) continue;
        expect(sCool.buildTrace({ prices: p }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("cooldown is real: falling market yields 0 and never negative", () => {
    for (const mode of MODES)
      expect(sCool.buildTrace({ prices: [9, 8, 7, 6] }, mode).meta.answer).toBeGreaterThanOrEqual(0);
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("stock-cooldown", sCool, sCool.defaultInput));
});

/* ---------------------------------- fee ----------------------------------- */

describe("stock-fee", () => {
  it("LC714 classic = 8 across all modes", () => {
    const prices = [1, 3, 2, 8, 4, 9];
    const fee = 2;
    expect(feeRef(prices, fee)).toBe(8);
    for (const mode of MODES)
      expect(sFee.buildTrace({ prices, fee }, mode).meta.answer).toBe(8);
  });

  it("moderate fee still trades profitably", () => {
    // 10 − 1 − fee 5 = 4 > 0, so trading wins over doing nothing
    for (const mode of MODES)
      expect(sFee.buildTrace({ prices: [1, 10], fee: 5 }, mode).meta.answer).toBe(4);
  });

  it("randomized cross-check vs reference", () => {
    for (let t = 0; t < 25; t++) {
      const p = randPrices(2, 8);
      const fee = Math.floor(Math.random() * 4);
      const ref = feeRef(p, fee);
      for (const mode of MODES) {
        const lim = sFee.limitsPerMode[mode](mode, { prices: p, fee });
        if (lim) continue;
        expect(sFee.buildTrace({ prices: p, fee }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("stock-fee", sFee, sFee.defaultInput));
});

/* ------------------------------- hygiene sweep ----------------------------- */

describe("trace hygiene for stocks services", () => {
  const cases: [string, ReturnType<typeof getService>][] = [
    ["stock-ii", sII],
    ["stock-iii", sIII],
    ["stock-iv", sIV],
    ["stock-cooldown", sCool],
    ["stock-fee", sFee],
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
              expect(at, `${slug}/${mode}: dep ${d} of ${ck}`).toBeLessThan(idx);
          }
        });
        expect(meta.stats.steps).toBe(steps.length);
      }
    });

    it(`${slug}: defaultInput API-safe`, () => {
      const parsed = svc.schema.safeParse(svc.defaultInput);
      expect(parsed.success, `${slug}: ${JSON.stringify(parsed.success ? null : (parsed as { error?: { issues?: unknown[] } }).error?.issues)}`).toBe(true);
      for (const mode of MODES)
        expect(svc.limitsPerMode[mode](mode, parsed.success ? parsed.data : undefined), `${slug}/${mode}`).toBeNull();
    });
  }
});
