import { describe, it, expect } from "vitest";
import { getService } from "../../src/services/registry";

const frog = getService("frog-jump")!;
const robber = getService("house-robber")!;

/** Independent O(n) references. */
function frogRef(h: number[]): number {
  let prev2 = 0, prev = 0;
  for (let i = 0; i < h.length; i++) {
    const cur = i === 0 ? 0 : Math.min(
      prev + Math.abs(h[i] - h[i - 1]),
      i > 1 ? prev2 + Math.abs(h[i] - h[i - 2]) : Infinity,
    );
    prev2 = prev; prev = cur;
  }
  return prev;
}

function robRef(a: number[]): number {
  let prev2 = 0, prev = 0;
  for (const x of a) { const cur = Math.max(prev2 + x, prev); prev2 = prev; prev = cur; }
  return prev;
}

describe("frog-jump", () => {
  const h = [30, 10, 60, 10, 60, 50];
  it("matches reference on the classic example", () => {
    expect(frogRef(h)).toBe(40);
    for (const mode of ["bruteforce", "memo", "tabulation", "spaceOptimized"] as const)
      expect(frog.buildTrace({ heights: h }, mode).meta.answer).toBe(40);
  });

  it("randomized cross-check vs reference", () => {
    for (let t = 0; t < 20; t++) {
      const arr = Array.from({ length: 2 + Math.floor(Math.random() * 8) }, () => 1 + Math.floor(Math.random() * 30));
      const ref = frogRef(arr);
      expect(frog.buildTrace({ heights: arr }, "memo").meta.answer).toBe(ref);
      if (arr.length <= 10 && ref !== undefined)
        expect(frog.buildTrace({ heights: arr }, "bruteforce").meta.answer).toBe(ref);
    }
  });

  it("dependency coordinates always point at earlier states", () => {
    const { steps } = frog.buildTrace({ heights: [5, 3, 8, 2] }, "tabulation");
    for (const s of steps)
      for (const d of s.deps ?? [])
        expect(d[0]).toBeLessThan(s.coordinates[0]);
  });
});

describe("house-robber", () => {
  it.each([
    [[2, 7, 9, 3, 1], 12],
    [[2, 1, 1, 2], 4],
    [[5], 5],
    [[1, 3], 3],
  ])("rob(%j) = %i across all modes", (arr, expected) => {
    expect(robRef(arr)).toBe(expected);
    for (const mode of ["bruteforce", "memo", "tabulation", "spaceOptimized"] as const)
      expect(robber.buildTrace({ nums: arr }, mode).meta.answer).toBe(expected);
  });

  it("pick/skip explanations mention both options", () => {
    const { steps } = robber.buildTrace({ nums: [2, 7, 9, 3, 1] }, "tabulation");
    const writes = steps.filter((s) => s.type === "table-write" && s.coordinates[0] >= 2);
    for (const w of writes.slice(0, 3)) expect(w.explanation).toContain("max(pick");
  });
});
