import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Palindrome Partitioning II (Striver DP-53): minimum cuts so every piece of
 * s is a palindrome. Front-partition DP over suffix starts:
 *   cuts[i] = 0 if s[i..n) is a palindrome
 *   cuts[i] = 1 + min(cuts[j+1]) over j >= i where s[i..j] is a palindrome
 * Palindrome checks are done inline with two pointers and narrated.
 */

const schema = z.object({
  s: z.string().regex(/^[a-z]{1,7}$/),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && Math.pow(2, input.s.length) > 128)
    return "Brute force tries all 2^(n-1) cut placements. Use at most 7 characters.";
  if (mode === "spaceOptimized")
    return "The suffix DP needs the whole remaining suffix — no rolling window exists. Use Memoization or Tabulation.";
  return null;
}

function isPal(s: string, i: number, j: number): boolean {
  while (i < j) {
    if (s[i] !== s[j]) return false;
    i++; j--;
  }
  return true;
}

const AXIS = (n: number) => ({
  rowsTitle: "suffix start",
  colsTitle: "index",
  rowLabels: ["cuts(i)"],
  colLabels: Array.from({ length: n }, (_, i) => String(i)),
});

function genBrute(input: In): GeneratedTrace {
  const s = input.s;
  const n = s.length;
  const b = new TraceBuilder();
  let calls = 0;

  function f(i: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i], `f(${i}) called: min cuts for suffix "${s.slice(i)}".`, { callId, parentCallId, codeAnchor: "recurse" });
    if (isPal(s, i, n - 1)) {
      b.push("base-case", [i], `"${s.slice(i)}" is already a palindrome → 0 cuts.`, { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    let best = Infinity;
    for (let j = i; j < n; j++)
      if (isPal(s, i, j)) {
        const cand = 1 + f(j + 1, callId);
        if (cand < best) best = cand;
      }
    b.push("recurse-return", [i], `f(${i}) = ${best}.`, { callId, parentCallId, value: best, deps: [], codeAnchor: "combine" });
    return best;
  }

  const answer = f(0);
  return {
    steps: b.steps,
    meta: { mode: "bruteforce", answer, answerLabel: "min cuts", tableShape: null, axisLabels: null, valueFormat: "int", stats: { steps: b.count, calls } },
  };
}

function genMemo(input: In): GeneratedTrace {
  const s = input.s;
  const n = s.length;
  const b = new TraceBuilder();
  const memo = new Map<number, number>();
  let calls = 0;
  let hits = 0;

  function f(i: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i], `f(${i}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (isPal(s, i, n - 1)) {
      b.push("base-case", [i], `"${s.slice(i)}" is a palindrome → 0 cuts.`, { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    if (memo.has(i)) {
      hits++;
      const v = memo.get(i)!;
      b.push("memo-hit", [i], `Memo hit! f(${i}) = ${v}.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    let best = Infinity;
    for (let j = i; j < n; j++)
      if (isPal(s, i, j)) best = Math.min(best, 1 + f(j + 1, callId));
    memo.set(i, best);
    b.push("recurse-return", [i], `f(${i}) = ${best}, stored in memo.`, { callId, parentCallId, value: best, deps: [], codeAnchor: "memoStore" });
    return best;
  }

  const answer = f(0);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "min cuts",
      tableShape: { rows: 1, cols: n },
      axisLabels: AXIS(n),
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const s = input.s;
  const n = s.length;
  const b = new TraceBuilder();
  const cuts = new Array(n + 1).fill(0);

  cuts[n] = -1; // sentinel so "j+1" past the end contributes 0 extra
  for (let i = n - 1; i >= 0; i--) {
    if (isPal(s, i, n - 1)) {
      cuts[i] = 0;
      b.push("table-write", [i], `"${s.slice(i)}" is a palindrome → cuts[${i}] = 0.`, { value: 0, deps: [], codeAnchor: "palindrome" });
      continue;
    }
    let best = Infinity;
    let bestJ = -1;
    for (let j = i; j < n; j++)
      if (isPal(s, i, j) && 1 + cuts[j + 1] < best) {
        best = 1 + cuts[j + 1];
        bestJ = j;
      }
    cuts[i] = best;
    b.push("table-write", [i],
      `Best palindromic first piece ends at ${bestJ}: cuts[${i}] = 1 + cuts[${bestJ + 1}] = ${best}.`,
      { value: best, deps: [[Math.min(bestJ + 1, n - 1)]], codeAnchor: "transition" });
  }

  const answer = cuts[0];
  b.push("table-read", [0], `Answer at the start: cuts[0] = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "min cuts",
      tableShape: { rows: 1, cols: n },
      axisLabels: AXIS(n),
      valueFormat: "int",
      stats: { steps: b.count, writes: n + 2 },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int i, string& s) {
    if (isPal(s, i, s.size() - 1)) return 0;   // base
    int best = INT_MAX;
    for (int j = i; j < (int)s.size(); ++j)     // recurse
        if (isPal(s, i, j))
            best = min(best, 1 + f(j + 1, s));
    return best;                               // combine
}`,
      { base: "base", recurse: "recurse", combine: "combine" },
    ),
    java: withAnchors(
`static int f(int i, String s) {
    if (isPal(s, i, s.length() - 1)) return 0;  // base
    int best = Integer.MAX_VALUE;
    for (int j = i; j < s.length(); ++j)         // recurse
        if (isPal(s, i, j))
            best = Math.min(best, 1 + f(j + 1, s));
    return best;                                // combine
}`,
      { base: "base", recurse: "recurse", combine: "combine" },
    ),
    python: withAnchors(
`def f(i, s):
    if is_pal(s, i, len(s) - 1):          # base
        return 0
    best = math.inf
    for j in range(i, len(s)):             # recurse
        if is_pal(s, i, j):
            best = min(best, 1 + f(j + 1, s))
    return best                           # combine`,
      { base: "base", recurse: "recurse", combine: "combine" },
    ),
    js: withAnchors(
`function f(i, s) {
  if (isPal(s, i, s.length - 1)) return 0;   // base
  let best = Infinity;
  for (let j = i; j < s.length; j++)         // recurse
    if (isPal(s, i, j))
      best = Math.min(best, 1 + f(j + 1, s));
  return best;                              // combine
}`,
      { base: "base", recurse: "recurse", combine: "combine" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int i, string& s, vector<int>& memo) {
    if (isPal(s, i, s.size() - 1)) return 0;     // base
    if (memo[i] != -1) return memo[i];           // memo check
    int best = INT_MAX;
    for (int j = i; j < (int)s.size(); ++j)       // recurse
        if (isPal(s, i, j))
            best = min(best, 1 + f(j + 1, s, memo));
    return memo[i] = best;                       // memo store
}`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store" },
    ),
    java: withAnchors(
`static int f(int i, String s, int[] memo) {
    if (isPal(s, i, s.length() - 1)) return 0;    // base
    if (memo[i] != -1) return memo[i];            // memo check
    int best = Integer.MAX_VALUE;
    for (int j = i; j < s.length(); ++j)           // recurse
        if (isPal(s, i, j))
            best = Math.min(best, 1 + f(j + 1, s, memo));
    return memo[i] = best;                        // memo store
}`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store" },
    ),
    python: withAnchors(
`def f(i, s, memo):
    if is_pal(s, i, len(s) - 1):          # base
        return 0
    if memo[i] != -1:                     # memo check
        return memo[i]
    best = math.inf
    for j in range(i, len(s)):             # recurse
        if is_pal(s, i, j):
            best = min(best, 1 + f(j + 1, s, memo))
    memo[i] = best
    return best                           # memo store`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store" },
    ),
    js: withAnchors(
`function f(i, s, memo) {
  if (isPal(s, i, s.length - 1)) return 0;   // base
  if (memo[i] !== -1) return memo[i];        // memo check
  let best = Infinity;
  for (let j = i; j < s.length; j++)         // recurse
    if (isPal(s, i, j))
      best = Math.min(best, 1 + f(j + 1, s, memo));
  memo[i] = best;
  return best;                              // memo store
}`,
      { base: "base", recurse: "recurse", memoCheck: "memo check", memoStore: "memo store" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int minCut(string& s) {
    int n = s.size();
    vector<int> cuts(n + 1, 0);              // base: sentinel beyond end
    for (int i = n - 1; i >= 0; --i) {
        if (isPal(s, i, n - 1)) {                 // palindrome
            cuts[i] = 0;
            continue;
        }
        int best = INT_MAX;
        for (int j = i; j < n; ++j)
            if (isPal(s, i, j))
                best = min(best, 1 + cuts[j + 1]); // transition
        cuts[i] = best;
    }
    return cuts[0];                          // driver
}`,
      { base: "sentinel beyond end", palindrome: "palindrome", transition: "transition", driver: "driver" },
    ),
    java: withAnchors(
`static int minCut(String s) {
    int n = s.length();
    int[] cuts = new int[n + 1];             // base: sentinel beyond end
    for (int i = n - 1; i >= 0; --i) {
        if (isPal(s, i, n - 1)) {                 // palindrome
            cuts[i] = 0;
            continue;
        }
        int best = Integer.MAX_VALUE;
        for (int j = i; j < n; ++j)
            if (isPal(s, i, j))
                best = Math.min(best, 1 + cuts[j + 1]); // transition
        cuts[i] = best;
    }
    return cuts[0];                          // driver
}`,
      { base: "base: sentinel beyond end", palindrome: "palindrome", transition: "transition", driver: "driver" },
    ),
    python: withAnchors(
`def min_cut(s):
    n = len(s)
    cuts = [0] * (n + 1)               # base: sentinel beyond end
    for i in range(n - 1, -1, -1):
        if is_pal(s, i, n - 1):             # palindrome
            cuts[i] = 0
            continue
        best = math.inf
        for j in range(i, n):
            if is_pal(s, i, j):
                best = min(best, 1 + cuts[j + 1])   # transition
        cuts[i] = best
    return cuts[0]                     # driver`,
      { base: "base: sentinel beyond end", palindrome: "palindrome", transition: "transition", driver: "driver" },
    ),
    js: withAnchors(
`function minCut(s) {
  const n = s.length;
  const cuts = new Array(n + 1).fill(0);   // base: sentinel beyond end
  for (let i = n - 1; i >= 0; i--) {
    if (isPal(s, i, n - 1)) {                   // palindrome
      cuts[i] = 0;
      continue;
    }
    let best = Infinity;
    for (let j = i; j < n; j++)
      if (isPal(s, i, j))
        best = Math.min(best, 1 + cuts[j + 1]); // transition
    cuts[i] = best;
  }
  return cuts[0];                          // driver
}`,
      { base: "base: sentinel beyond end", palindrome: "palindrome", transition: "transition", driver: "driver" },
    ),
  },
};

export const palindromePartitioningII: ProblemServiceDef = {
  slug: "palindrome-partitioning-ii",
  patternSlug: "dp-mcm",
  inputDescriptor: [
    { key: "s", label: "STRING", kind: "stringPair", min: 1, max: 6 },
  ],
  schema,
  defaultInput: { s: "abccbc" }, // Striver example → 2 ("a|bccb|c"? verified in tests → "a|b|ccbc"? computed live)
  randomInput: () => ({
    s: Array.from({ length: 3 + Math.floor(Math.random() * 4) }, () => "abc"[Math.floor(Math.random() * 3)]).join(""),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input as In) : mode === "memo" ? genMemo(input as In) : genTab(input as In),
  codes,
};
