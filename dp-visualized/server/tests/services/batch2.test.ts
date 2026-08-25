import { describe, it, expect } from "vitest";
import { getService } from "../../src/services/registry";

const frogK = getService("frog-jump-k")!;
const robberII = getService("house-robber-ii")!;
const ninja = getService("ninja-training")!;
const pathsII = getService("grid-unique-paths-ii")!;
const falling = getService("min-falling-path-sum")!;
const triangle = getService("triangle-path")!;

const MODES = ["bruteforce", "memo", "tabulation", "spaceOptimized"] as const;

/* ------------------------- independent references ------------------------- */

function frogKRef(h: number[], k: number): number {
  const dp = [0];
  for (let i = 1; i < h.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= Math.min(i, k); j++) best = Math.min(best, dp[i - j] + Math.abs(h[i] - h[i - j]));
    dp[i] = best;
  }
  return dp[h.length - 1];
}

function lin(a: number[]): number {
  let p2 = 0, p = 0;
  for (const x of a) { const c = Math.max(p2 + x, p); p2 = p; p = c; }
  return p;
}
function robCircleRef(a: number[]): number {
  if (a.length === 2) return Math.max(a[0], a[1]);
  return Math.max(lin(a.slice(0, -1)), lin(a.slice(1)));
}

function ninjaRef(p: number[][]): number {
  const n = p.length;
  let prev = Array.from({ length: 4 }, (_, last) => {
    let best = 0;
    for (let t = 0; t < 3; t++) if (t !== last - 1) best = Math.max(best, p[0][t]);
    return best;
  });
  for (let day = 1; day < n; day++) {
    prev = prev.map((_, last) => {
      let best = 0;
      for (let t = 0; t < 3; t++) if (t !== last - 1) best = Math.max(best, p[day][t] + prev[t + 1]);
      return best;
    });
  }
  return prev[0]; // column 0 = "nothing forbidden yet" — the unrestricted answer
}

function pathsIIRef(g: number[][]): number {
  const m = g.length, n = g[0].length;
  if (g[0][0] === 1 || g[m - 1][n - 1] === 1) return 0;
  const dp = Array.from({ length: m }, () => new Array(n).fill(0));
  dp[0][0] = 1;
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++) {
      if (g[i][j] === 1 || (i === 0 && j === 0)) continue;
      const up = i > 0 ? dp[i - 1][j] : 0;
      const left = j > 0 ? dp[i][j - 1] : 0;
      dp[i][j] = up + left;
    }
  return dp[m - 1][n - 1];
}

function fallingRef(g: number[][]): number {
  const m = g.length;
  let row = [...g[m - 1]];
  for (let r = m - 2; r >= 0; r--) {
    row = g[r].map((v, c) => {
      let best = row[c];
      if (c > 0) best = Math.min(best, row[c - 1]);
      if (c + 1 < g[0].length) best = Math.min(best, row[c + 1]);
      return v + best;
    });
  }
  return Math.min(...row);
}

function triangleRef(t: number[][]): number {
  let front = [...t[t.length - 1]];
  for (let r = t.length - 2; r >= 0; r--)
    front = t[r].map((v, c) => v + Math.min(front[c], front[c + 1]));
  return front[0];
}

/* ------------------------------ shared checks ----------------------------- */

/** Every codeAnchor referenced by steps must resolve in EVERY language's snippet. */
function expectAnchorsResolve(slug: string, svc: ReturnType<typeof getService>, input: unknown) {
  expect(svc).toBeDefined();
  const s = svc!;
  for (const mode of MODES) {
    const { steps } = s.buildTrace(input, mode);
    const variant = { bruteforce: "bruteforce", memo: "memoization", tabulation: "tabulation", spaceOptimized: "spaceOptimized" }[mode] as string;
    const langPack = s.codes[variant as keyof typeof s.codes];
    expect(langPack, `${slug}/${variant}`).toBeDefined();
    const used = new Set(steps.map((st) => st.codeAnchor).filter(Boolean));
    for (const [lang, snip] of Object.entries(langPack ?? {})) {
      for (const a of used)
        expect(
          snip.anchors[a as string],
          `${slug}/${variant}/${lang} missing anchor "${a}"`,
        ).toBeDefined();
    }
  }
}

describe("frog-jump-k", () => {
  it.each([
    [[10, 30, 40, 20, 50], 3, 40],
    [[10, 20, 30, 10], 2, 20],
    [[40, 10, 20, 60, 30, 50], 2, 50],
    [[5, 5, 5], 4, 0],
  ])("heights=%j k=%i -> %i across all modes", (h, k, expected) => {
    for (const mode of MODES) {
      const lim = frogK.limitsPerMode[mode](mode, { heights: h as number[], k: k as number });
      if (lim) continue; // brute may be capped for large trees
      expect(frogK.buildTrace({ heights: h, k }, mode).meta.answer).toBe(expected);
    }
  });

  it("k=2 agrees with the plain frog-jump service", () => {
    const plain = getService("frog-jump")!;
    const h = [30, 10, 60, 10, 60, 50];
    expect(frogK.buildTrace({ heights: h, k: 2 }, "tabulation").meta.answer).toBe(
      plain.buildTrace({ heights: h }, "tabulation").meta.answer,
    );
  });

  it("randomized cross-check vs reference", () => {
    for (let t = 0; t < 25; t++) {
      const h = Array.from({ length: 2 + Math.floor(Math.random() * 6) }, () => 1 + Math.floor(Math.random() * 40));
      const k = 2 + Math.floor(Math.random() * 3);
      const ref = frogKRef(h, k);
      expect(frogK.buildTrace({ heights: h, k }, "memo").meta.answer).toBe(ref);
      expect(frogK.buildTrace({ heights: h, k }, "spaceOptimized").meta.answer).toBe(ref);
      if (Math.pow(k, h.length - 1) <= 900)
        expect(frogK.buildTrace({ heights: h, k }, "bruteforce").meta.answer).toBe(ref);
    }
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("frog-jump-k", frogK, frogK.defaultInput));
});

describe("house-robber-ii", () => {
  it.each([
    [[1, 7, 9, 4, 5, 8], 19],
    [[2, 1, 1, 2], 3],
    [[5, 5], 5],
    [[10, 1, 1, 10], 11],
    [[7, 9, 4, 5, 8], 17],
  ])("nums=%j -> %i across all modes", (arr, expected) => {
    for (const mode of MODES) {
      const lim = robberII.limitsPerMode[mode](mode, { nums: arr as number[] });
      if (lim) continue;
      expect(robberII.buildTrace({ nums: arr }, mode).meta.answer).toBe(expected);
    }
  });

  it("never robs both circle-neighbours: result equals two-run reduction", () => {
    for (let t = 0; t < 25; t++) {
      const arr = Array.from({ length: 2 + Math.floor(Math.random() * 8) }, () => Math.floor(Math.random() * 30));
      const ref = robCircleRef(arr);
      expect(robberII.buildTrace({ nums: arr }, "memo").meta.answer).toBe(ref);
      expect(robberII.buildTrace({ nums: arr }, "tabulation").meta.answer).toBe(ref);
      expect(robberII.buildTrace({ nums: arr }, "spaceOptimized").meta.answer).toBe(ref);
      if (arr.length <= 9) expect(robberII.buildTrace({ nums: arr }, "bruteforce").meta.answer).toBe(ref);
    }
  });

  it("two-run narration markers appear before each linear pass", () => {
    const { steps } = robberII.buildTrace({ nums: [1, 7, 9, 4, 5, 8] }, "tabulation");
    const caseA = steps.findIndex((s) => s.explanation.includes("Row A"));
    const caseB = steps.findIndex((s) => s.explanation.includes("Row B"));
    expect(caseA).toBeGreaterThanOrEqual(0);
    expect(caseB).toBeGreaterThan(caseA);
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("house-robber-ii", robberII, robberII.defaultInput));
});

describe("ninja-training", () => {
  it("classic example = 11 across all modes", () => {
    const pts = [
      [1, 2, 5],
      [3, 1, 1],
      [3, 3, 3],
    ];
    for (const mode of MODES) expect(ninja.buildTrace({ points: pts }, mode).meta.answer).toBe(11);
  });

  it("randomized cross-check vs reference", () => {
    for (let t = 0; t < 25; t++) {
      const pts = Array.from({ length: 3 + Math.floor(Math.random() * 4) }, () =>
        Array.from({ length: 3 }, () => 1 + Math.floor(Math.random() * 9)),
      );
      const ref = ninjaRef(pts);
      expect(ninja.buildTrace({ points: pts }, "memo").meta.answer).toBe(ref);
      expect(ninja.buildTrace({ points: pts }, "spaceOptimized").meta.answer).toBe(ref);
      if (pts.length <= 6) expect(ninja.buildTrace({ points: pts }, "bruteforce").meta.answer).toBe(ref);
    }
  });

  it("forbidden-task columns are exactly the four states none/0/1/2", () => {
    const { meta } = ninja.buildTrace({ points: [[1, 2, 5]] }, "tabulation");
    expect(meta.tableShape).toEqual({ rows: 1, cols: 4 });
    expect(meta.axisLabels?.colLabels).toEqual(["none", "run", "fight", "learn"]);
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("ninja-training", ninja, ninja.defaultInput));
});

describe("grid-unique-paths-ii", () => {
  it("classic detour example = 2", () => {
    const g = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ];
    for (const mode of MODES) expect(pathsII.buildTrace({ grid: g }, mode).meta.answer).toBe(2);
  });

  it("obstacle at start or goal zeroes everything", () => {
    for (const g of [
      [
        [1, 0],
        [0, 0],
      ],
      [
        [0, 0],
        [0, 1],
      ],
    ])
      for (const mode of ["memo", "tabulation"] as const)
        expect(pathsII.buildTrace({ grid: g }, mode).meta.answer).toBe(0);
  });

  it("without obstacles equals plain grid-unique-paths", () => {
    const plain = getService("grid-unique-paths")!;
    const g = Array.from({ length: 3 }, () => new Array(4).fill(0));
    expect(pathsII.buildTrace({ grid: g }, "tabulation").meta.answer).toBe(
      plain.buildTrace({ m: 3, n: 4 }, "tabulation").meta.answer,
    );
  });

  it("randomized cross-check vs reference", () => {
    for (let t = 0; t < 25; t++) {
      const m = 2 + Math.floor(Math.random() * 4);
      const n = 2 + Math.floor(Math.random() * 4);
      const g = Array.from({ length: m }, (_, ri) =>
        Array.from({ length: n }, (_, ci) => (ri === 0 && ci === 0 ? 0 : Math.random() < 0.25 ? 1 : 0)),
      );
      const ref = pathsIIRef(g);
      for (const mode of MODES) {
        const lim = pathsII.limitsPerMode[mode](mode, { grid: g });
        if (lim) continue;
        expect(pathsII.buildTrace({ grid: g }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("obstacle writes use the obstacle anchor", () => {
    const { steps } = pathsII.buildTrace(
      {
        grid: [
          [0, 1],
          [1, 0],
        ],
      },
      "tabulation",
    );
    const obstacleSteps = steps.filter((s) => s.codeAnchor === "obstacle");
    expect(obstacleSteps.length).toBeGreaterThan(0);
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("grid-unique-paths-ii", pathsII, pathsII.defaultInput));
});

describe("min-falling-path-sum", () => {
  it("example = 13 via 1→4→8", () => {
    const g = [
      [2, 1, 3],
      [6, 5, 4],
      [7, 8, 9],
    ];
    for (const mode of MODES) expect(falling.buildTrace({ grid: g }, mode).meta.answer).toBe(13);
  });

  it("two-column grids pick the cheaper fall", () => {
    const wide = [
      [3, 9],
      [1, 9],
    ];
    for (const mode of MODES) expect(falling.buildTrace({ grid: wide }, mode).meta.answer).toBe(4);
  });

  it("randomized cross-check vs reference", () => {
    for (let t = 0; t < 25; t++) {
      const m = 2 + Math.floor(Math.random() * 4);
      const n = 2 + Math.floor(Math.random() * 4);
      const g = Array.from({ length: m }, () => Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 9)));
      const ref = fallingRef(g);
      for (const mode of MODES) {
        const lim = falling.limitsPerMode[mode](mode, { grid: g });
        if (lim) continue;
        expect(falling.buildTrace({ grid: g }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("min-falling-path-sum", falling, falling.defaultInput));
});

describe("triangle-path", () => {
  it("Striver's example = 11", () => {
    const t = [[2], [3, 4], [6, 5, 7], [4, 1, 8, 3]];
    for (const mode of MODES) expect(triangle.buildTrace({ triangle: t }, mode).meta.answer).toBe(11);
  });

  it("randomized cross-check vs reference", () => {
    for (let t = 0; t < 25; t++) {
      const n = 2 + Math.floor(Math.random() * 5);
      const tri = Array.from({ length: n }, (_, r) =>
        Array.from({ length: r + 1 }, () => 1 + Math.floor(Math.random() * 9)),
      );
      const ref = triangleRef(tri);
      expect(triangle.buildTrace({ triangle: tri }, "memo").meta.answer).toBe(ref);
      expect(triangle.buildTrace({ triangle: tri }, "spaceOptimized").meta.answer).toBe(ref);
      expect(triangle.buildTrace({ triangle: tri }, "bruteforce").meta.answer).toBe(ref);
    }
  });

  it("table stays triangular: no write ever lands above the diagonal", () => {
    const { steps } = triangle.buildTrace({ triangle: [[1], [2, 3], [4, 5, 6]] }, "tabulation");
    for (const s of steps.filter((x) => x.type === "table-write" || x.type === "base-case"))
      expect(s.coordinates[1]).toBeLessThanOrEqual(s.coordinates[0]);
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("triangle-path", triangle, triangle.defaultInput));
});

/* --------------------- cross-service structural sweep --------------------- */

describe("trace hygiene for batch-2 services", () => {
  const cases: [string, ReturnType<typeof getService>][] = [
    ["frog-jump-k", frogK],
    ["house-robber-ii", robberII],
    ["ninja-training", ninja],
    ["grid-unique-paths-ii", pathsII],
    ["min-falling-path-sum", falling],
    ["triangle-path", triangle],
  ];

  for (const [slug, svc] of cases) {
    it(`${slug}: bounded traces, valid deps, sane stats`, () => {
      expect(svc).toBeDefined();
      const s = svc!;
      const input = s.defaultInput as never;
      for (const mode of MODES) {
        const { steps, meta } = s.buildTrace(input, mode);
        expect(steps.length, `${slug}/${mode} step cap`).toBeLessThan(2500);

        const writtenAt = new Map<string, number>();
        steps.forEach((st, idx) => {
          const ck = st.coordinates.join(",");
          if (st.type === "table-write" || ((st.type === "recurse-return" || st.type === "memo-hit" || st.type === "base-case") && st.value !== undefined)) {
            const first = writtenAt.get(ck);
            if (first === undefined || st.type === "table-write") writtenAt.set(ck, first === undefined ? idx : idx);
          }
          for (const d of st.deps ?? []) {
            const dk = d.join(",");
            const at = writtenAt.get(dk);
            if (at !== undefined && st.type === "table-write")
              expect(at, `${slug}/${mode}: dep ${dk} of ${ck} must be written earlier`).toBeLessThan(idx);
          }
        });

        expect(meta.stats.steps).toBe(steps.length);
      }
    });
  }
});
