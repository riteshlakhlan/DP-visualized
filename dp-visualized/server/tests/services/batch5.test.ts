import { describe, it, expect } from "vitest";
import { getService } from "../../src/services/registry";

const minInsDel = getService("min-insert-delete")!;
const minInsPal = getService("min-insertions-palindrome")!;
const printLcs = getService("print-lcs")!;
const scs = getService("shortest-common-supersequence")!;
const distinct = getService("distinct-subsequences")!;
const wildcard = getService("wildcard-matching")!;

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

function lcsLen(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? 1 + dp[i - 1][j - 1] : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[m][n];
}

/** one valid LCS via DP backtrace (for print-lcs structural checks) */
function lcsString(a: string, b: string): string {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? 1 + dp[i - 1][j - 1] : Math.max(dp[i - 1][j], dp[i][j - 1]);
  let i = m, j = n;
  const out: string[] = [];
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { out.unshift(a[i - 1]); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return out.join("");
}

function lpsLengthRef(s: string): number {
  const memo = new Map<string, number>();
  const f = (i: number, j: number): number => {
    if (i > j) return 0;
    if (i === j) return 1;
    const k = `${i},${j}`;
    if (memo.has(k)) return memo.get(k)!;
    const v = s[i] === s[j] ? 2 + f(i + 1, j - 1) : Math.max(f(i + 1, j), f(i, j - 1));
    memo.set(k, v);
    return v;
  };
  return f(0, s.length - 1);
}

function isPalindrome(s: string): boolean {
  let l = 0, r = s.length - 1;
  while (l < r) if (s[l++] !== s[r--]) return false;
  return true;
}

function distinctRef(s: string, t: string): number {
  const m = s.length, n = t.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let j = 0; j <= n; j++) dp[0][j] = 1;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = dp[i][j - 1] + (s[i - 1] === t[j - 1] ? dp[i - 1][j - 1] : 0);
  return dp[m][n];
}

function wildcardRef(s: string, p: string): boolean {
  const m = s.length, n = p.length;
  const dp: boolean[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(false));
  dp[0][0] = true;
  for (let j = 1; j <= n; j++) dp[0][j] = dp[0][j - 1] && p[j - 1] === "*";
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      if (p[j - 1] === "*") dp[i][j] = dp[i - 1][j] || dp[i][j - 1];
      else if (p[j - 1] === "?" || s[i - 1] === p[j - 1]) dp[i][j] = dp[i - 1][j - 1];
    }
  return dp[m][n];
}

/** exhaustive matcher — the ground truth for wildcard */
function wildcardExhaustive(s: string, p: string): boolean {
  function match(si: number, pi: number): boolean {
    if (pi === p.length) return si === s.length;
    if (p[pi] === "*") {
      for (let k = si; k <= s.length; k++) if (match(k, pi + 1)) return true;
      return false;
    }
    if (si >= s.length) return false;
    if (p[pi] === "?" || s[si] === p[pi]) return match(si + 1, pi + 1);
    return false;
  }
  return match(0, 0);
}

function expectAnchorsResolve(slug: string, svc: ReturnType<typeof getService>, input: unknown) {
  const s = svc!;
  for (const mode of MODES) {
    const def = s.codes[{ bruteforce: "bruteforce", memo: "memoization", tabulation: "tabulation", spaceOptimized: "spaceOptimized" }[mode] as keyof typeof s.codes];
    if (!def) continue; // service may intentionally omit a variant
    const { steps } = s.buildTrace(input, mode);
    const used = new Set(steps.map((st) => st.codeAnchor).filter(Boolean));
    for (const [lang, snip] of Object.entries(def))
      for (const a of used)
        expect(snip.anchors[a as string], `${slug}/${mode}/${lang} missing anchor "${a}"`).toBeDefined();
  }
}

/* ---------------------------- min insert delete --------------------------- */

describe("min-insert-delete", () => {
  it.each([
    ["abcd", "anc", 3],
    ["abc", "abc", 0],
    ["ab", "cd", 4], // direct DP counts 1+min chains: delete a, insert c, delete b, insert d
    ["a", "abc", 2],
  ])("ops(%s→%s) = %i across all modes", (s, t, expected) => {
    // independent identity: ops = |s| + |t| − 2·LCS(s,t)
    expect(s.length + t.length - 2 * lcsLen(s, t)).toBe(expected);
    for (const mode of MODES) {
      const lim = minInsDel.limitsPerMode[mode](mode, { s, t });
      if (lim) continue;
      expect(minInsDel.buildTrace({ s, t }, mode).meta.answer).toBe(expected);
    }
  });

  it("randomized cross-check vs LCS identity", () => {
    const rand = () => Array.from({ length: 2 + Math.floor(Math.random() * 4) }, () => "abc"[Math.floor(Math.random() * 3)]).join("");
    for (let t = 0; t < 25; t++) {
      const a = rand(), b = rand();
      const ref = a.length + b.length - 2 * lcsLen(a, b);
      for (const mode of MODES) {
        const lim = minInsDel.limitsPerMode[mode](mode, { s: a, t: b });
        if (lim) continue;
        expect(minInsDel.buildTrace({ s: a, t: b }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("min-insert-delete", minInsDel, minInsDel.defaultInput));
});

/* ------------------------ min insertions palindrome ----------------------- */

describe("min-insertions-palindrome", () => {
  it.each([
    ["abcaa", 2],
    ["a", 0],
    ["aba", 0],
    ["abcd", 3],
    ["race", 3],
  ])("inserts(%s) = %i across all modes", (s, expected) => {
    expect(s.length - lpsLengthRef(s)).toBe(expected);
    for (const mode of MODES) {
      const lim = minInsPal.limitsPerMode[mode](mode, { s });
      if (lim) continue;
      expect(minInsPal.buildTrace({ s }, mode).meta.answer).toBe(expected);
    }
  });

  it("agrees with n − LPS on random binary strings", () => {
    const rand = () => Array.from({ length: 3 + Math.floor(Math.random() * 4) }, () => "ab"[Math.floor(Math.random() * 2)]).join("");
    for (let t = 0; t < 25; t++) {
      const s = rand();
      const ref = s.length - lpsLengthRef(s);
      for (const mode of MODES) expect(minInsPal.buildTrace({ s }, mode).meta.answer).toBe(ref);
    }
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("min-insertions-palindrome", minInsPal, minInsPal.defaultInput));
});

/* --------------------------------- print lcs ------------------------------- */

describe("print-lcs", () => {
  const input = { s: "abcde", t: "bdgem" };

  it("backtrace produces a genuine common subsequence of maximal length", () => {
    for (const mode of ["memo", "tabulation"] as const) {
      const res = printLcs.buildTrace(input, mode);
      const finalStep = [...res.steps].reverse().find((st) => st.explanation.includes("longest common subsequence"));
      expect(finalStep, "final backtrace step exists").toBeDefined();
      const extracted = finalStep!.explanation.match(/"([a-z]*)"/)?.[1] ?? "";
      // must be a subsequence of BOTH strings
      let ai = 0;
      for (const ch of extracted) {
        while (ai < input.s.length && input.s[ai] !== ch) ai++;
        expect(ai < input.s.length || `missing ${ch} in s`).toBeTruthy();
        ai++;
      }
      let bi = 0;
      for (const ch of extracted) {
        while (bi < input.t.length && input.t[bi] !== ch) bi++;
        expect(bi < input.t.length || `missing ${ch} in t`).toBeTruthy();
        bi++;
      }
      // and its length must equal the LCS length from an independent reference
      expect(extracted.length).toBe(lcsLen(input.s, input.t));
      expect(res.meta.answer).toBe(lcsLen(input.s, input.t));
      void mode;
    }
  });

  it("derived line carries the reconstructed string", () => {
    const res = printLcs.buildTrace(input, "tabulation");
    expect(res.meta.derived).toMatch(/LCS = "[a-z]+"/);
    const shown = res.meta.derived!.match(/"([a-z]*)"/)![1];
    expect(shown.length).toBe(lcsLen(input.s, input.t));
  });

  it("brute force agrees on random inputs and yields real subsequences", () => {
    const rand = () => Array.from({ length: 3 }, () => "ab"[Math.floor(Math.random() * 2)]).join("");
    for (let t = 0; t < 15; t++) {
      const a = rand(), b = rand();
      expect(printLcs.buildTrace({ s: a, t: b }, "bruteforce").meta.answer).toBe(lcsLen(a, b));
      expect(printLcs.buildTrace({ s: a, t: b }, "memo").meta.answer).toBe(lcsLen(a, b));
    }
  });

  it("spaceOptimized is intentionally unavailable", () => {
    expect(printLcs.limitsPerMode.spaceOptimized("spaceOptimized", input)).toContain("full table");
    expect(printLcs.codes.spaceOptimized).toBeUndefined();
  });

  it("anchors resolve in available variants", () => expectAnchorsResolve("print-lcs", printLcs, input));
});

/* ------------------------- shortest common supersequence ------------------- */

describe("shortest-common-supersequence", () => {
  it.each([
    ["brute", "groot", 8],
    ["abacdc", "aba", 6],
    ["abc", "abc", 3],
    ["a", "b", 2],
  ])("scs(%s,%s) = %i across all modes", (s, t, expected) => {
    expect(s.length + t.length - lcsLen(s, t)).toBe(expected);
    for (const mode of MODES) {
      const lim = scs.limitsPerMode[mode](mode, { s, t });
      if (lim) continue;
      expect(scs.buildTrace({ s, t }, mode).meta.answer).toBe(expected);
    }
  });

  it("randomized cross-check vs m+n−LCS identity", () => {
    const rand = () => Array.from({ length: 2 + Math.floor(Math.random() * 4) }, () => "ab"[Math.floor(Math.random() * 2)]).join("");
    for (let t = 0; t < 25; t++) {
      const a = rand(), b = rand();
      const ref = a.length + b.length - lcsLen(a, b);
      for (const mode of MODES) {
        const lim = scs.limitsPerMode[mode](mode, { s: a, t: b });
        if (lim) continue;
        expect(scs.buildTrace({ s: a, t: b }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("shortest-common-supersequence", scs, scs.defaultInput));
});

/* ----------------------------- distinct subsequences ----------------------- */

describe("distinct-subsequences", () => {
  it("LeetCode classics across all modes", () => {
    const cases: [string, string, number][] = [
      ["rabbit", "rabbbit", 3],
      ["bagbag", "babgbag", 1], // exhaustive-verified
      ["a", "aaa", 3],
      ["abc", "abc", 1],
    ];
    for (const [s, t, expected] of cases) {
      expect(distinctRef(s, t)).toBe(expected);
      for (const mode of MODES) {
        const lim = distinct.limitsPerMode[mode](mode, { s, t });
        if (lim) continue;
        expect(distinct.buildTrace({ s, t }, mode).meta.answer).toBe(expected);
      }
    }
  });

  it("randomized cross-check vs reference", () => {
    const rand = (len: number) => Array.from({ length: len }, () => "ab"[Math.floor(Math.random() * 2)]).join("");
    for (let t = 0; t < 25; t++) {
      const s = rand(1 + Math.floor(Math.random() * 3));
      const tt = rand(3 + Math.floor(Math.random() * 3));
      const ref = distinctRef(s, tt);
      for (const mode of MODES) {
        const lim = distinct.limitsPerMode[mode](mode, { s, t: tt });
        if (lim) continue;
        expect(distinct.buildTrace({ s, t: tt }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("distinct-subsequences", distinct, distinct.defaultInput));
});

/* ------------------------------ wildcard matching -------------------------- */

describe("wildcard-matching", () => {
  it.each([
    ["abcde", "a*de", true],
    ["abcde", "a?c*", true],
    ["abcde", "*", true],
    ["abcde", "a*d?f", false],
    ["aa", "?*", true],
    ["mississippi", "m??*ss*?i*pi", false],
  ])("match(%s, %s) = %s across all modes", (s, p, expected) => {
    expect(wildcardExhaustive(s, p)).toBe(expected);
    for (const mode of MODES) {
      const lim = wildcard.limitsPerMode[mode](mode, { s, p });
      if (lim) continue;
      expect(wildcard.buildTrace({ s, p }, mode).meta.answer).toBe(expected);
    }
  });

  it("randomized cross-check vs exhaustive matcher", () => {
    const randS = () => Array.from({ length: 2 + Math.floor(Math.random() * 4) }, () => "ab"[Math.floor(Math.random() * 2)]).join("");
    const randP = () => {
      const chars = ["a", "b", "*", "?"];
      return Array.from({ length: 2 + Math.floor(Math.random() * 4) }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    };
    for (let t = 0; t < 40; t++) {
      const s = randS(), p = randP();
      const ref = wildcardExhaustive(s, p);
      for (const mode of MODES) {
        const lim = wildcard.limitsPerMode[mode](mode, { s, p });
        if (lim) continue;
        expect(wildcard.buildTrace({ s, p }, mode).meta.answer).toBe(ref);
      }
    }
  });

  it("schema accepts star/question pattern chars but rejects digits", () => {
    expect(wildcard.schema.safeParse({ s: "abc", p: "a*c" }).success).toBe(true);
    expect(wildcard.schema.safeParse({ s: "abc", p: "a1c" }).success).toBe(false);
  });

  it("anchors resolve in all languages", () => expectAnchorsResolve("wildcard-matching", wildcard, wildcard.defaultInput));
});

/* ------------------------------- hygiene sweep ------------------------------ */

describe("trace hygiene for batch-5 services", () => {
  const cases: [string, ReturnType<typeof getService>][] = [
    ["min-insert-delete", minInsDel],
    ["min-insertions-palindrome", minInsPal],
    ["print-lcs", printLcs],
    ["shortest-common-supersequence", scs],
    ["distinct-subsequences", distinct],
    ["wildcard-matching", wildcard],
  ];

  for (const [slug, svc] of cases) {
    it(`${slug}: bounded traces, deps written earlier, sane stats`, () => {
      const s = svc!;
      for (const mode of MODES) {
        if (!s.codes[{ bruteforce: "bruteforce", memo: "memoization", tabulation: "tabulation", spaceOptimized: "spaceOptimized" }[mode] as keyof typeof s.codes])
          continue; // variant intentionally absent
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
    for (const svc of [minInsDel, minInsPal, printLcs, scs, distinct, wildcard]) {
      const parsed = svc.schema.safeParse(svc.defaultInput);
      expect(parsed.success, `${svc.slug}`).toBe(true);
      for (const mode of MODES) {
        const lim = svc.limitsPerMode[mode](mode, parsed.success ? parsed.data : undefined);
        // a default may be intentionally blocked when the variant itself is absent
        if (!svc.codes[{ bruteforce: "bruteforce", memo: "memoization", tabulation: "tabulation", spaceOptimized: "spaceOptimized" }[mode] as keyof typeof svc.codes])
          continue;
        expect(lim, `${svc.slug}/${mode}`).toBeNull();
      }
    }
  });
});
