import { z } from "zod";
import { TraceBuilder, computeStats } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* House Robber II (Striver DP-6): houses arranged in a CIRCLE — house 0 and
 * house n-1 are neighbours. Standard reduction: the answer is
 *   max( robLinear(houses 0..n-2), robLinear(houses 1..n-1) )
 * because an optimal plan never robs both ends of the circle.
 * Every mode traces the two linear runs sequentially into two table rows.
 */

const schema = z.object({
  nums: z.array(z.number().int().min(0).max(50)).min(2).max(10),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && input.nums.length > 9)
    return "Pure recursion explores ~Fibonacci(n) pick/skip plans, twice for the circular split. Use at most 9 houses for Brute Force.";
  return null;
}

const ROW_A = 0;
const ROW_B = 1;

/** Clamp any state index into the visible table column range. */
const coord = (row: number, i: number, n: number): [number, number] => [row, Math.min(Math.max(i, 0), n - 1)];
const axisLabels = (n: number) => ({
  rowsTitle: "linear run",
  colsTitle: "house index",
  rowLabels: [`rob h[0..${Math.max(0, n - 2)}]`, `rob h[1..${n - 1}]`],
});

function genBrute(input: In): GeneratedTrace {
  const nums = input.nums;
  const n = nums.length;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<string>();

  /** Linear rob over absolute houses [lo..hi]; states live in table row `row`. */
  function g(i: number, lo: number, hi: number, row: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i > hi) {
      b.push("base-case", coord(row, i, n), `No houses left in this run → g contributes 0.`, { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    const kk = `${row},${i}`;
    const dup = seen.has(kk);
    b.push("recurse-call", [row, i],
      dup ? `g(${i}) called AGAIN — same suffix already solved elsewhere.`
          : `g(${i}) called: best loot from houses ${i}..${hi}.`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(kk);
    const pick = nums[i] + g(i + 2, lo, hi, row, callId);
    const skip = g(i + 1, lo, hi, row, callId);
    const v = Math.max(pick, skip);
    b.push("recurse-return", [row, i], `g(${i}) = max(pick ${nums[i]} + ${pick - nums[i]}, skip ${skip}) = ${v}.`, {
      callId,
      parentCallId,
      value: v,
      deps: [coord(row, i + 1, n), coord(row, i + 2, n)],
      codeAnchor: "combine",
    });
    return v;
  }

  let ansA: number;
  if (n === 2) {
    b.push("base-case", [ROW_A, 0], "Only two houses — both are mutual neighbours, so Case A considers house 0 alone.", { codeAnchor: "driver" });
    ansA = nums[0];
    b.push("recurse-return", [ROW_A, 0], `Case A answer: rob([${nums[0]}]) = ${ansA}.`, { value: ansA, codeAnchor: "combine" });
  } else {
    b.push("base-case", [ROW_A, n - 1], `CASE A: houses 0..${n - 2} (last house excluded — it neighbours house 0).`, { codeAnchor: "driver" });
    ansA = g(0, 0, n - 2, ROW_A);
  }
  b.push("base-case", [ROW_B, 0], `CASE B: houses 1..${n - 1} (first house excluded — same reason, mirrored).`, { codeAnchor: "driver" });
  const ansB = g(1, 1, n - 1, ROW_B);
  const answer = Math.max(ansA, ansB);
  b.push("base-case", [ROW_B, n - 1], `Circular street solved: max(Case A ${ansA}, Case B ${ansB}) = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "bruteforce",
      answer,
      answerLabel: "maximum loot",
      tableShape: null,
      axisLabels: null,
      valueFormat: "int",
      stats: { steps: b.count, calls },
    },
  };
}

function genMemo(input: In): GeneratedTrace {
  const nums = input.nums;
  const n = nums.length;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function g(i: number, hi: number, row: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    if (i > hi) {
      b.push("base-case", coord(row, i, n), "Beyond this run's range → 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    b.push("recurse-call", [row, i], `g(${i}) called: best loot from here to house ${hi}.`, { callId, parentCallId, codeAnchor: "recurse" });
    const kk = `${row},${i}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [row, i], `Memo hit! g(${i}) = ${v} fetched instantly.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    const pick = nums[i] + g(i + 2, hi, row, callId);
    const skip = g(i + 1, hi, row, callId);
    const v = Math.max(pick, skip);
    memo.set(kk, v);
    b.push("recurse-return", [row, i], `g(${i}) = max(pick ${nums[i]} + ${pick - nums[i]}, skip ${skip}) = ${v}, stored in memo.`, {
      callId,
      parentCallId,
      value: v,
      deps: [coord(row, i + 1, n), coord(row, i + 2, n)],
      codeAnchor: "memoStore",
    });
    return v;
  }

  let ansA: number;
  if (n === 2) {
    ansA = nums[0];
    b.push("base-case", [ROW_A, 0], "Two houses: Case A holds only house 0.", { value: ansA, codeAnchor: "driver" });
  } else {
    b.push("base-case", [ROW_A, n - 1], `CASE A: houses 0..${n - 2}, memoized independently of Case B.`, { codeAnchor: "driver" });
    ansA = g(0, n - 2, ROW_A);
  }
  b.push("base-case", [ROW_B, 0], `CASE B: houses 1..${n - 1}.`, { codeAnchor: "driver" });
  const ansB = g(1, n - 1, ROW_B);
  const answer = Math.max(ansA, ansB);
  b.push("base-case", [ROW_B, n - 1], `max(Case A ${ansA}, Case B ${ansB}) = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "maximum loot",
      tableShape: { rows: 2, cols: n },
      axisLabels: axisLabels(n),
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const nums = input.nums;
  const n = nums.length;
  const b = new TraceBuilder();

  function fillRow(lo: number, hi: number, row: number): number[] {
    const len = hi - lo + 1;
    const dp = new Array(len).fill(-1);
    for (let r = 0; r < len; r++) {
      const abs = lo + r;
      const pick = nums[abs] + (r >= 2 ? dp[r - 2] : 0);
      const skip = r >= 1 ? dp[r - 1] : 0;
      const v = Math.max(pick, skip);
      b.push("table-write", [row, abs],
        `dp[${abs}] = max(pick ${nums[abs]} + ${r >= 2 ? `dp[${abs - 2}] (${dp[r - 2]})` : "nothing (0)"}, skip ${skip}) = ${v}.`,
        { value: v, deps: [...(r >= 1 ? [[row, abs - 1]] : []), ...(r >= 2 ? [[row, abs - 2]] : [])], codeAnchor: "transition" });
      dp[r] = v;
    }
    return dp;
  }

  let ansA: number;
  if (n === 2) {
    b.push("base-case", [ROW_A, 0], "Two houses: Case A holds only house 0 (its circle-neighbour is house 1).", { codeAnchor: "driver" });
    b.push("table-write", [ROW_A, 0], `dp[${0}] = ${nums[0]}.`, { value: nums[0], codeAnchor: "transition" });
    ansA = nums[0];
  } else {
    b.push("base-case", [ROW_A, n - 1], `Row A tabulates houses 0..${n - 2} left to right.`, { codeAnchor: "driver" });
    ansA = fillRow(0, n - 2, ROW_A)[n - 2];
  }
  b.push("base-case", [ROW_B, 0], `Row B tabulates houses 1..${n - 1} left to right.`, { codeAnchor: "driver" });
  const rowB = fillRow(1, n - 1, ROW_B);
  const ansB = rowB[rowB.length - 1];
  const answer = Math.max(ansA, ansB);
  b.push("table-write", [ROW_B, n - 1], `Combine the two linear runs: max(${ansA}, ${ansB}) = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "maximum loot",
      tableShape: { rows: 2, cols: n },
      axisLabels: axisLabels(n),
      valueFormat: "int",
      stats: { steps: b.count, ...computeStats(b.steps) },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const nums = input.nums;
  const n = nums.length;
  const b = new TraceBuilder();

  function rollRow(lo: number, hi: number, row: number): number {
    let prev2 = 0;
    let prev = 0;
    for (let abs = lo; abs <= hi; abs++) {
      const v = Math.max(prev2 + nums[abs], prev);
      const depLabel = abs > lo ? `prev (dp[${abs - 1}])` : "empty prefix";
      b.push("table-write", [row, abs],
        `cur = max(prev2 + ${nums[abs]}, ${depLabel}) = max(${prev2} + ${nums[abs]}, ${prev}) = ${v}; two variables replace the row.`,
        { value: v, deps: abs > lo ? [[row, abs - 1]] : [], codeAnchor: "transition" });
      prev2 = prev;
      prev = v;
    }
    return prev;
  }

  b.push("base-case", [ROW_A, 0], "prev2 = prev = 0 for Case A (empty prefix).", { codeAnchor: "init" });
  const ansA = n === 2 ? (() => {
    b.push("table-write", [ROW_A, 0], `cur = max(0 + ${nums[0]}, 0) = ${nums[0]}.`, { value: nums[0], codeAnchor: "transition" });
    return nums[0];
  })() : rollRow(0, n - 2, ROW_A);
  b.push("base-case", [ROW_B, 1], "Variables reset for Case B (houses 1..n-1).", { codeAnchor: "init" });
  const ansB = rollRow(1, n - 1, ROW_B);
  const answer = Math.max(ansA, ansB);
  b.push("table-write", [ROW_B, n - 1], `Final combine: max(Case A ${ansA}, Case B ${ansB}) = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer,
      answerLabel: "maximum loot",
      tableShape: { rows: 2, cols: n },
      axisLabels: axisLabels(n),
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, ...computeStats(b.steps) },
    },
  };
}

const driverCpp = `// driver: circular street -> best of the two linear runs
int rob(vector<int>& nums) {
    int n = nums.size();
    if (n == 2) return max(nums[0], nums[1]);       // driver
    return max(robLine(vector<int>(nums.begin(), nums.end() - 1)),
               robLine(vector<int>(nums.begin() + 1, nums.end())));
}`;

const codes = {
  bruteforce: {
    cpp: withAnchors(
`${driverCpp}
int robLine(vector<int>& a, int i) {
    if (i >= a.size()) return 0;                    // base
    // recurse: pick house i vs skip it
    return max(a[i] + robLine(a, i + 2), robLine(a, i + 1)); // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition
// driver`,
      { driver: "// driver", base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int rob(int[] nums) {
    int n = nums.length;
    if (n == 2) return Math.max(nums[0], nums[1]);  // driver
    return Math.max(robLine(Arrays.copyOfRange(nums, 0, n - 1), 0),
                    robLine(Arrays.copyOfRange(nums, 1, n), 0));
}
static int robLine(int[] a, int i) {
    if (i >= a.length) return 0;                    // base
    int pick = a[i] + robLine(a, i + 2);            // recurse
    int skip = robLine(a, i + 1);
    return Math.max(pick, skip);                    // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { driver: "// driver", base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def rob_line(a, i):
    if i >= len(a):                          # base
        return 0
    # recurse: pick house i vs skip it
    return max(a[i] + rob_line(a, i + 2), rob_line(a, i + 1))  # combine

def rob(nums):
    if len(nums) == 2:                       # driver
        return max(nums)
    return max(rob_line(nums[:-1], 0), rob_line(nums[1:], 0))
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: transition`,
      { base: "# base", recurse: "# recurse", combine: "# combine", driver: "# driver", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function robLine(a, i) {
  if (i >= a.length) return 0;                       // base
  const pick = a[i] + robLine(a, i + 2);             // recurse
  const skip = robLine(a, i + 1);
  return Math.max(pick, skip);                       // combine
}
function rob(nums) {
  if (nums.length === 2) return Math.max(...nums);   // driver
  return Math.max(
    robLine(nums.slice(0, -1), 0),
    robLine(nums.slice(1), 0)
  );
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", driver: "// driver", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int robLine(vector<int>& a, int i, vector<int>& memo) {
    if (i >= (int)a.size()) return 0;                 // base
    if (memo[i] != -1) return memo[i];                // memo check
    int pick = a[i] + robLine(a, i + 2, memo);        // recurse
    int skip = robLine(a, i + 1, memo);
    memo[i] = max(pick, skip);
    return memo[i];                                   // memo store
}
int rob(vector<int>& nums) {
    int n = nums.size();
    if (n == 2) return max(nums[0], nums[1]);
    vector<int> m1(n, -1), m2(n, -1);
    return max(robLine(slice(nums, 0, n-2), 0, m1),  // driver
               robLine(slice(nums, 1, n-1), 0, m2));
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// driver", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int robLine(int[] a, int i, int[] memo) {
    if (i >= a.length) return 0;                      // base
    if (memo[i] != -1) return memo[i];                // memo check
    int pick = a[i] + robLine(a, i + 2, memo);      // recurse
    int skip = robLine(a, i + 1, memo);
    memo[i] = Math.max(pick, skip);
    return memo[i];                                   // memo store
}
static int rob(int[] nums) {
    int n = nums.length;
    if (n == 2) return Math.max(nums[0], nums[1]);
    int[] m1 = fill(-1, Arrays.copyOfRange(nums, 0, n - 1));
    int[] m2 = fill(-1, Arrays.copyOfRange(nums, 1, n));
    return Math.max(robLine(Arrays.copyOfRange(nums, 0, n - 1), 0, m1),  // driver
                    robLine(Arrays.copyOfRange(nums, 1, n), 0, m2));
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// driver", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def rob_line(a, i, memo):
    if i >= len(a):                            # base
        return 0
    if memo[i] != -1:                          # memo check
        return memo[i]
    pick = a[i] + rob_line(a, i + 2, memo)     # recurse
    skip = rob_line(a, i + 1, memo)
    memo[i] = max(pick, skip)
    return memo[i]                             # memo store

def rob(nums):
    if len(nums) == 2:
        return max(nums)
    return max(rob_line(nums[:-1], 0, [-1]*len(nums)),   # driver
               rob_line(nums[1:], 0, [-1]*len(nums)))
# anchor: combine
# anchor: init
# anchor: transition
# memoCheck
# memoStore`,
      { base: "# base", recurse: "# recurse", memoCheck: "# memoCheck", memoStore: "# memoStore", driver: "# driver", combine: "# anchor: combine", init: "# anchor: init", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function robLine(a, i, memo) {
  if (i >= a.length) return 0;                     // base
  if (memo[i] !== -1) return memo[i];              // memo check
  const pick = a[i] + robLine(a, i + 2, memo);     // recurse
  const skip = robLine(a, i + 1, memo);
  memo[i] = Math.max(pick, skip);
  return memo[i];                                  // memo store
}
function rob(nums) {
  if (nums.length === 2) return Math.max(...nums);
  return Math.max(                                  // driver
    robLine(nums.slice(0, -1), 0, Array(nums.length).fill(-1)),
    robLine(nums.slice(1), 0, Array(nums.length).fill(-1))
  );
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", driver: "// driver", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int robLineTab(vector<int>& a) {              // fills one row left->right
    int m = a.size();
    if (m == 1) return a[0];
    vector<int> dp(m);
    for (int r = 0; r < m; ++r) {
        int pick = a[r] + (r >= 2 ? dp[r - 2] : 0);
        int skip = r >= 1 ? dp[r - 1] : 0;
        dp[r] = max(pick, skip);              // transition
    }
    return dp[m - 1];
}
int rob(vector<int>& nums) {
    int n = nums.size();
    if (n == 2) return max(nums[0], nums[1]); // driver: two independent rows
    return max(robLineTab(slice(nums, 0, n - 2)),
               robLineTab(slice(nums, 1, n - 1)));
}
// anchor: base
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { transition: "// transition", driver: "// driver", base: "// anchor: base", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int robLineTab(int[] a) {
    int m = a.length;
    if (m == 1) return a[0];
    int[] dp = new int[m];
    for (int r = 0; r < m; ++r) {
        int pick = a[r] + (r >= 2 ? dp[r - 2] : 0);
        int skip = r >= 1 ? dp[r - 1] : 0;
        dp[r] = Math.max(pick, skip);         // transition
    }
    return dp[m - 1];
}
static int rob(int[] nums) {
    int n = nums.length;
    if (n == 2) return Math.max(nums[0], nums[1]);
    return Math.max(robLineTab(Arrays.copyOfRange(nums, 0, n - 1)),  // driver
                    robLineTab(Arrays.copyOfRange(nums, 1, n)));
}
// anchor: base
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { transition: "// transition", driver: "// driver", base: "// anchor: base", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def rob_line_tab(a):
    m = len(a)
    if m == 1:
        return a[0]
    dp = [0] * m
    for r in range(m):
        pick = a[r] + (dp[r - 2] if r >= 2 else 0)
        skip = dp[r - 1] if r >= 1 else 0
        dp[r] = max(pick, skip)           # transition
    return dp[-1]

def rob(nums):
    if len(nums) == 2:
        return max(nums)
    return max(rob_line_tab(nums[:-1]),   # driver
               rob_line_tab(nums[1:]))
# anchor: base
# anchor: combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { transition: "# transition", driver: "# driver", base: "# anchor: base", combine: "# anchor: combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function robLineTab(a) {
  const m = a.length;
  if (m === 1) return a[0];
  const dp = new Array(m);
  for (let r = 0; r < m; r++) {
    const pick = a[r] + (r >= 2 ? dp[r - 2] : 0);
    const skip = r >= 1 ? dp[r - 1] : 0;
    dp[r] = Math.max(pick, skip);            // transition
  }
  return dp[m - 1];
}
function rob(nums) {
  if (nums.length === 2) return Math.max(...nums);
  return Math.max(                           // driver
    robLineTab(nums.slice(0, -1)),
    robLineTab(nums.slice(1))
  );
}
// anchor: base
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { transition: "// transition", driver: "// driver", base: "// anchor: base", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
  spaceOptimized: {
    cpp: withAnchors(
`int robLineOpt(vector<int>& a) {          // one pass, two variables
    int prev2 = 0, prev = 0;                  // init
    for (int x : a) {
        int cur = max(prev2 + x, prev);       // transition
        prev2 = prev; prev = cur;
    }
    return prev;
}
int rob(vector<int>& nums) {
    int n = nums.size();
    if (n == 2) return max(nums[0], nums[1]);
    return max(robLineOpt(slice(nums, 0, n - 2)),   // driver
               robLineOpt(slice(nums, 1, n - 1)));
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", driver: "// driver", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int robLineOpt(int[] a) {
    int prev2 = 0, prev = 0;                  // init
    for (int x : a) {
        int cur = Math.max(prev2 + x, prev);  // transition
        prev2 = prev; prev = cur;
    }
    return prev;
}
static int rob(int[] nums) {
    int n = nums.length;
    if (n == 2) return Math.max(nums[0], nums[1]);
    return Math.max(robLineOpt(Arrays.copyOfRange(nums, 0, n - 1)),  // driver
                    robLineOpt(Arrays.copyOfRange(nums, 1, n)));
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", driver: "// driver", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def rob_line_opt(a):
    prev2 = prev = 0                        # init
    for x in a:
        prev2, prev = prev, max(prev2 + x, prev)   # transition
    return prev

def rob(nums):
    if len(nums) == 2:
        return max(nums)
    return max(rob_line_opt(nums[:-1]),     # driver
               rob_line_opt(nums[1:]))
# anchor: base
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { init: "# init", transition: "# transition", driver: "# driver", base: "# anchor: base", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function robLineOpt(a) {
  let prev2 = 0, prev = 0;               // init
  for (const x of a) {
    const cur = Math.max(prev2 + x, prev);  // transition
    prev2 = prev; prev = cur;
  }
  return prev;
}
function rob(nums) {
  if (nums.length === 2) return Math.max(...nums);
  return Math.max(robLineOpt(nums.slice(0, -1)),   // driver
                  robLineOpt(nums.slice(1)));
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", driver: "// driver", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
};

export const houseRobberII: ProblemServiceDef = {
  slug: "house-robber-ii",
  patternSlug: "1d-dp",
  inputDescriptor: [
    { key: "nums", label: "HOUSE LOOT", kind: "array", min: 2, max: 10, valueRange: [0, 50] },
  ],
  schema,
  defaultInput: { nums: [1, 7, 9, 4, 5, 8] },
  randomInput: () => ({
    nums: Array.from({ length: 2 + Math.floor(Math.random() * 8) }, () => Math.floor(Math.random() * 51)),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input) : mode === "memo" ? genMemo(input) : mode === "tabulation" ? genTab(input) : genSpace(input),
  codes,
};
