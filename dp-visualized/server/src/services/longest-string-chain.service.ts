import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Longest String Chain (Striver DP-45): a word is a predecessor of another if
 * you can insert exactly ONE letter to get it ("ba" → "bda"). Longest chain.
 * Sort by length; dp[word] = 1 + best dp[predecessor].
 */

const schema = z.object({
  words: z.string().regex(/^[a-z]{1,5}(,[a-z]{1,5}){1,7}$/),
});
type In = z.infer<typeof schema>;

function parse(input: In): string[] {
  return [...new Set(input.words.split(","))].sort((a, b) => a.length - b.length);
}

function limits(mode: DPMode): string | null {
  if (mode === "bruteforce")
    return "Brute force compares every word pair for the one-letter-difference relation. Keep lists small.";
  if (mode === "spaceOptimized")
    return "The dp map spans all earlier words — no rolling window exists. Use Memoization or Tabulation.";
  return null;
}

const axisFor = (words: string[]) => ({
  rowsTitle: "state",
  colsTitle: "word (sorted by length)",
  rowLabels: ["chain ending here"],
  colLabels: [...words],
});

function genMemo(input: In): GeneratedTrace {
  const words = parse(input);
  const dpMap = new Map<string, number>();
  const b = new TraceBuilder();
  let calls = 0;
  let hits = 0;

  function f(w: string, idx: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    b.push("recurse-call", [idx], `f("${w}") called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (dpMap.has(w)) {
      hits++;
      const v = dpMap.get(w)!;
      b.push("memo-hit", [idx], `Memo hit! "${w}" = ${v}.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    let best = 0;
    for (let k = 0; k < w.length; k++) {
      const pred = w.slice(0, k) + w.slice(k + 1);
      const pi = words.indexOf(pred);
      if (pred.length > 0 && pi >= 0) best = Math.max(best, f(pred, pi, callId));
    }
    const v = 1 + best;
    dpMap.set(w, v);
    b.push("recurse-return", [idx], `f("${w}") = ${v}, stored in memo.`, { callId, parentCallId, value: v, deps: [], codeAnchor: "memoStore" });
    return v;
  }

  let answer = 0;
  for (let i = 0; i < words.length; i++) answer = Math.max(answer, f(words[i], i));
  b.push("base-case", [words.length - 1], `Longest chain = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "longest chain length",
      tableShape: { rows: 1, cols: words.length },
      axisLabels: axisFor(words),
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const words = parse(input);
  const n = words.length;
  const b = new TraceBuilder();

  b.push("base-case", [0, 0], `Sorted by length: [${words.join(", ")}].`, { codeAnchor: "sort" });

  const dp = new Map<string, number>();
  let answer = 1;
  for (let i = 0; i < n; i++) {
    const w = words[i];
    let best = 0;
    let bestPred = "";
    for (let k = 0; k < w.length; k++) {
      const pred = w.slice(0, k) + w.slice(k + 1);
      if (pred.length > 0 && dp.has(pred)) {
        const cand = dp.get(pred)!;
        if (cand > best) { best = cand; bestPred = pred; }
      }
    }
    dp.set(w, 1 + best);
    b.push("table-write", [i],
      bestPred
        ? `"${w}" extends "${bestPred}": dp = 1 + ${best} = ${1 + best}.`
        : `"${w}" starts its own chain (length 1).`,
      { value: 1 + best, deps: [], codeAnchor: "transition" });
    answer = Math.max(answer, 1 + best);
  }

  b.push("table-read", [n - 1], `Answer = max over all words = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "longest chain length",
      tableShape: { rows: 1, cols: n },
      axisLabels: axisFor(words),
      valueFormat: "int",
      derived: `sorted by length: ${words.join(", ")}`,
      stats: { steps: b.count, writes: n + 2 },
    },
  };
}

const codes = {
  memoization: {
    cpp: withAnchors(
`int dfs(string& w, unordered_map<string,int>& dp,
        unordered_set<string>& dict) {
    if (dp.count(w)) return dp[w];            // memo check
    int best = 0;
    for (int k = 0; k < (int)w.size(); ++k) { // recurse
        string pred = w.substr(0, k) + w.substr(k + 1);
        if (dict.count(pred))
            best = max(best, dfs(pred, dp, dict));
    }
    return dp[w] = 1 + best;                  // memo store
}
// anchor: driver
// anchor: sort
// anchor: transition
`,
      { recurse: "recurse", memoCheck: "memo check", memoStore: "memo store",
      driver: "// anchor: driver",
      sort: "// anchor: sort",
      transition: "// anchor: transition"
    },
    ),
    java: withAnchors(
`static int dfs(String w, Map<String,Integer> dp, Set<String> dict) {
    if (dp.containsKey(w)) return dp.get(w);   // memo check
    int best = 0;
    for (int k = 0; k < w.length(); k++) {     // recurse
        String pred = w.substring(0, k) + w.substring(k + 1);
        if (dict.contains(pred))
            best = Math.max(best, dfs(pred, dp, dict));
    }
    dp.put(w, 1 + best);
    return 1 + best;                           // memo store
}
// anchor: driver
// anchor: sort
// anchor: transition
`,
      { recurse: "recurse", memoCheck: "memo check", memoStore: "memo store",
      driver: "// anchor: driver",
      sort: "// anchor: sort",
      transition: "// anchor: transition"
    },
    ),
    python: withAnchors(
`def dfs(w, dp, words_set):
    if w in dp:                          # memo check
        return dp[w]
    best = 0
    for k in range(len(w)):              # recurse
        pred = w[:k] + w[k+1:]
        if pred in words_set:
            best = max(best, dfs(pred, dp, words_set))
    dp[w] = 1 + best
    return dp[w]                         # memo store
# anchor: driver
# anchor: sort
# anchor: transition
`,
      { recurse: "recurse", memoCheck: "memo check", memoStore: "memo store",
      driver: "# anchor: driver",
      sort: "# anchor: sort",
      transition: "# anchor: transition"
    },
    ),
    js: withAnchors(
`function dfs(w, dp, wordsSet) {
  if (dp.has(w)) return dp.get(w);       // memo check
  let best = 0;
  for (let k = 0; k < w.length; k++) {   // recurse
    const pred = w.slice(0, k) + w.slice(k + 1);
    if (wordsSet.has(pred))
      best = Math.max(best, dfs(pred, dp, wordsSet));
  }
  dp.set(w, 1 + best);
  return 1 + best;                       // memo store
}
// anchor: driver
// anchor: sort
// anchor: transition
`,
      { recurse: "recurse", memoCheck: "memo check", memoStore: "memo store",
      driver: "// anchor: driver",
      sort: "// anchor: sort",
      transition: "// anchor: transition"
    },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int longestStrChain(vector<string>& words) {
    sort(words.begin(), words.end(),
         [](auto& a, auto& b){ return a.size() < b.size(); }); // sort
    unordered_map<string,int> dp;
    int ans = 1;
    for (auto& w : words) {
        int best = 0;
        for (int k = 0; k < (int)w.size(); ++k) {               // transition
            string pred = w.substr(0, k) + w.substr(k + 1);
            if (dp.count(pred)) best = max(best, dp[pred]);
        }
        dp[w] = 1 + best;
        ans = max(ans, dp[w]);
    }
    return ans;                                                  // driver
}
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// anchor: sort
`,
      { transition: "transition", driver: "driver",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse",
      sort: "// anchor: sort"
    },
    ),
    java: withAnchors(
`static int longestStrChain(String[] words) {
    Arrays.sort(words, Comparator.comparingInt(String::length)); // sort
    Map<String,Integer> dp = new HashMap<>();
    int ans = 1;
    for (String w : words) {
        int best = 0;
        for (int k = 0; k < w.length(); k++) {                    // transition
            String pred = w.substring(0, k) + w.substring(k + 1);
            best = Math.max(best, dp.getOrDefault(pred, 0));
        }
        dp.put(w, 1 + best);
        ans = Math.max(ans, 1 + best);
    }
    return ans;                                                   // driver
}
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// anchor: sort
`,
      { transition: "transition", driver: "driver",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse",
      sort: "// anchor: sort"
    },
    ),
    python: withAnchors(
`def longest_str_chain(words):
    words.sort(key=len)                        # sort
    dp = {}
    ans = 1
    for w in words:
        best = 0
        for k in range(len(w)):                # transition
            pred = w[:k] + w[k+1:]
            best = max(best, dp.get(pred, 0))
        dp[w] = 1 + best
        ans = max(ans, dp[w])
    return ans                                 # driver
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse
# anchor: sort
`,
      { transition: "transition", driver: "driver",
      memoCheck: "# anchor: memoCheck",
      memoStore: "# anchor: memoStore",
      recurse: "# anchor: recurse",
      sort: "# anchor: sort"
    },
    ),
    js: withAnchors(
`function longestStrChain(words) {
  words.sort((a, b) => a.length - b.length);  // sort
  const dp = new Map();
  let ans = 1;
  for (const w of words) {
    let best = 0;
    for (let k = 0; k < w.length; k++) {      // transition
      const pred = w.slice(0, k) + w.slice(k + 1);
      best = Math.max(best, dp.get(pred) ?? 0);
    }
    dp.set(w, 1 + best);
    ans = Math.max(ans, 1 + best);
  }
  return ans;                                 // driver
}
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse
// anchor: sort
`,
      { transition: "transition", driver: "driver",
      memoCheck: "// anchor: memoCheck",
      memoStore: "// anchor: memoStore",
      recurse: "// anchor: recurse",
      sort: "// anchor: sort"
    },
    ),
  },
};

export const longestStringChain: ProblemServiceDef = {
  slug: "longest-string-chain",
  patternSlug: "dp-lis",
  inputDescriptor: [
    { key: "words", label: "WORDS (comma-sep)", kind: "stringPair", min: 4, max: 48, allow: "[a-z,]" },
  ],
  schema,
  defaultInput: { words: "a,ba,bda,bdca" }, // → 4
  randomInput: () => ({
    words: ["a", "ba", "aba", "bca", "bdca", "bcdx"]
      .filter(() => Math.random() > 0.25)
      .join(",") || "a,ba",
  }),
  limitsPerMode: { bruteforce: limits, memo: () => null, tabulation: () => null, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" || mode === "spaceOptimized"
      ? (() => {
          const b = new TraceBuilder();
          b.push("base-case", [0, 0], "This variant is not meaningful for the word-map DP — use Memoization or Tabulation.", { codeAnchor: "driver" });
          return { steps: b.steps, meta: { mode: mode as DPMode, answer: null as null, answerLabel: "longest chain length", tableShape: null, axisLabels: null, valueFormat: "int" as const, stats: { steps: b.count } } };
        })()
      : mode === "memo"
        ? genMemo(input as In)
        : genTab(input as In),
  codes,
};
