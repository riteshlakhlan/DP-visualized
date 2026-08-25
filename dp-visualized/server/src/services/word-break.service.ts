import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Word Break (Striver): can the string be segmented into dictionary words? */

const schema = z.object({
  s: z.string().regex(/^[a-z]{1,9}$/),
  wordDict: z.string().regex(/^[a-z.]{3,48}$/),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode): string | null {
  if (mode === "bruteforce") return "Brute force tries every split. Keep strings short.";
  return null;
}

const dict = (input: In) => new Set(input.wordDict.split("."));

function genMemo(input: In): GeneratedTrace {
  const { s } = input;
  const n = s.length;
  const d = dict(input);
  const b = new TraceBuilder();
  const memo = new Map<number, boolean>();
  let calls = 0, hits = 0;

  function f(i: number, parentCallId?: number): boolean {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [i], `f(${i}) called: can "${s.slice(i)}" be segmented?`, { callId, parentCallId, codeAnchor: "recurse" });
    if (i === n) {
      b.push("base-case", [n], "Empty suffix → true.", { callId, parentCallId, value: 1, codeAnchor: "base" });
      return true;
    }
    if (memo.has(i)) {
      hits++; const v = memo.get(i)!;
      b.push("memo-hit", [i], `Memo hit! f(${i}) = ${v}.`, { callId, parentCallId, value: v ? 1 : 0, codeAnchor: "memoCheck" });
      return v;
    }
    let v = false;
    for (let j = i + 1; j <= n; j++) {
      const word = s.slice(i, j);
      if (d.has(word)) {
        b.push("table-read", [i], `Found "${word}" in dictionary.`, { codeAnchor: "match" });
        if (f(j, callId)) { v = true; break; }
      }
    }
    memo.set(i, v);
    b.push("recurse-return", [i], `f(${i}) = ${v}, stored.`, { callId, parentCallId, value: v ? 1 : 0, deps: [], codeAnchor: "memoStore" });
    return v;
  }

  const answer = f(0);
  return {
    steps: b.steps,
    meta: {
      mode: "memo", answer, answerLabel: "can segment",
      tableShape: { rows: 1, cols: n + 1 }, axisLabels: { rowsTitle: "state", colsTitle: "start idx", rowLabels: ["f(i)"] },
      valueFormat: "bool", stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const { s } = input;
  const n = s.length;
  const d = dict(input);
  const b = new TraceBuilder();
  const dp: boolean[] = new Array(n + 1).fill(false);
  dp[n] = true;
  b.push("base-case", [n], "dp[n] = true (empty suffix).", { value: 1, codeAnchor: "base" });

  for (let i = n - 1; i >= 0; i--) {
    for (let j = i + 1; j <= n; j++) {
      const word = s.slice(i, j);
      if (d.has(word) && dp[j]) {
        dp[i] = true;
        b.push("table-write", [i], `"${word}" is a word AND dp[${j}] = T → dp[${i}] = T.`, {
          value: 1, deps: [[j]], codeAnchor: "transition",
        });
        break;
      }
    }
    if (!dp[i])
      b.push("table-write", [i], `No valid word starts here → dp[${i}] = F.`, { value: 0, codeAnchor: "nomatch" });
  }

  const answer = dp[0];
  b.push("table-read", [0], `Answer: dp[0] = ${answer}.`, { value: answer ? 1 : 0, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation", answer, answerLabel: "can segment",
      tableShape: { rows: 1, cols: n + 1 }, axisLabels: { rowsTitle: "state", colsTitle: "start idx", rowLabels: ["dp"] },
      valueFormat: "bool", stats: { steps: b.count, writes: n + 1 },
    },
  };
}

export const wordBreak: ProblemServiceDef = {
  slug: "word-break",
  patternSlug: "dp-graphs",
  inputDescriptor: [
    { key: "s", label: "STRING", kind: "stringPair", min: 1, max: 7 },
    { key: "wordDict", label: "WORDS (. separated)", kind: "stringPair", min: 3, max: 48, allow: "[a-z.]" },
  ],
  schema,
  defaultInput: { s: "catsandog", wordDict: "cats.dog.and.catsandog.cat" }, // LC139 variant
  randomInput: () => ({ s: "abab", wordDict: "a.b.ab" }),
  limitsPerMode: { bruteforce: limits, memo: () => null, tabulation: () => null, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" || mode === "spaceOptimized"
      ? (() => { const b = new TraceBuilder(); b.push("base-case", [0, 0], "Use Memoization or Tabulation.", { codeAnchor: "driver" }); return { steps: b.steps, meta: { mode: mode as DPMode, answer: null as null, answerLabel: "can segment", tableShape: null, axisLabels: null, valueFormat: "int" as const, stats: { steps: b.count } } }; })()
      : mode === "memo" ? genMemo(input as In) : genTab(input as In),
  codes: {
    memoization: {
      cpp: withAnchors(`bool f(int i, string& s, unordered_set<string>& d, vector<int>& m) {\n    if (i == s.size()) return true;              // base\n    if (m[i] != -1) return m[i];                 // memo check\n    for (int j = i + 1; j <= (int)s.size(); ++j)\n        if (d.count(s.substr(i, j - i)) && f(j, s, d, m)) // match\n            return m[i] = true;\n    return m[i] = false;                         // memo store\n}`, { base: "base", recurse: "recurse", match: "match", memoCheck: "memo check", memoStore: "memo store" }),
      java: withAnchors(`static boolean f(int i, String s, Set<String> d, Boolean[] m) {\n    if (i == s.length()) return true;             // base\n    if (m[i] != null) return m[i];                // memo check\n    for (int j = i + 1; j <= s.length(); ++j)\n        if (d.contains(s.substring(i, j)) && f(j, s, d, m)) // match\n            return m[i] = true;\n    return m[i] = false;                          // memo store\n}`, { base: "base", recurse: "recurse", match: "match", memoCheck: "memo check", memoStore: "memo store" }),
      python: withAnchors(`def f(i, s, d, m):\n    if i == len(s):                       # base\n        return True\n    if m[i] != -1:                        # memo check\n        return m[i]\n    for j in range(i+1, len(s)+1):\n        if s[i:j] in d and f(j, s, d, m):  # match\n            m[i] = True\n            return True\n    m[i] = False                           # memo store\n    return False`, { base: "base", recurse: "recurse", match: "match", memoCheck: "memo check", memoStore: "memo store" }),
      js: withAnchors(`function f(i, s, d, m) {\n  if (i === s.length) return true;             // base\n  if (m[i] !== -1) return m[i];                // memo check\n  for (let j = i + 1; j <= s.length; j++)\n    if (d.has(s.slice(i, j)) && f(j, s, d, m))  // match\n      return (m[i] = true);\n  return (m[i] = false);                       // memo store\n}`, { base: "base", recurse: "recurse", match: "match", memoCheck: "memo check", memoStore: "memo store" }),
    },
    tabulation: {
      cpp: withAnchors(`bool wordBreak(string s, vector<string>& wd) {\n    int n = s.size();\n    unordered_set<string> d(wd.begin(), wd.end());\n    vector<bool> dp(n + 1, false);\n    dp[n] = true;                                    // base\n    for (int i = n - 1; i >= 0; --i)\n        for (int j = i + 1; j <= n && !dp[i]; ++j)\n            if (d.count(s.substr(i, j - i)) && dp[j]) // transition\n                dp[i] = true;\n    return dp[0];                                    // driver\n}`, { base: "base", transition: "transition", driver: "driver" }),
      java: withAnchors(`static boolean wordBreak(String s, List<String> wd) {\n    int n = s.length();\n    Set<String> d = new HashSet<>(wd);\n    boolean[] dp = new boolean[n + 1];\n    dp[n] = true;                                     // base\n    for (int i = n - 1; i >= 0; --i)\n        for (int j = i + 1; j <= n && !dp[i]; ++j)\n            if (d.contains(s.substring(i, j)) && dp[j]) // transition\n                dp[i] = true;\n    return dp[0];                                    // driver\n}`, { base: "base", transition: "transition", driver: "driver" }),
      python: withAnchors(`def word_break(s, wd):\n    n = len(s)\n    d = set(wd)\n    dp = [False] * (n + 1)\n    dp[n] = True                                # base\n    for i in range(n - 1, -1, -1):\n        for j in range(i + 1, n + 1):\n            if s[i:j] in d and dp[j]:            # transition\n                dp[i] = True\n                break\n    return dp[0]                                # driver`, { base: "base", transition: "transition", driver: "driver" }),
      js: withAnchors(`function wordBreak(s, wd) {\n  const n = s.length;\n  const d = new Set(wd);\n  const dp = new Array(n + 1).fill(false);\n  dp[n] = true;                                  // base\n  for (let i = n - 1; i >= 0; i--)\n    for (let j = i + 1; j <= n && !dp[i]; j++)\n      if (d.has(s.slice(i, j)) && dp[j])          // transition\n        dp[i] = true;\n  return dp[0];                                  // driver\n}`, { base: "base", transition: "transition", driver: "driver" }),
    },
  },
};
