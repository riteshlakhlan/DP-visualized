import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";

/* Ninja's Training (Striver DP-7): one activity per day among 3
 * (run / fight / learn); the same activity cannot be chosen two days in a
 * row. Maximize total merit points.
 *
 * State: f(day, last) = best merit for days 0..day given `last` is the
 * FORBIDDEN activity (the one done on day+1 in memo form / previous day in
 * table form). Column index = last + 1, so column 3 means "nothing forbidden".
 */

const ACTIVITY_NAMES = ["run", "fight", "learn"];

const schema = z.object({
  points: z.array(z.array(z.number().int().min(1).max(9)).length(3)).min(3).max(7),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && Math.pow(2, input.points.length) > 128)
    return "Pure recursion branches ~2 ways per day. Keep the plan at most 7 days for Brute Force.";
  return null;
}

const AXIS = {
  rowsTitle: "day",
  colsTitle: "forbidden task",
  colLabels: ["none", ...ACTIVITY_NAMES],
};

/** column index for a forbidden-task value (-1 => none). */
const colOf = (last: number) => last + 1;

function genBrute(input: In): GeneratedTrace {
  const pts = input.points;
  const n = pts.length;
  const b = new TraceBuilder();
  let calls = 0;
  const seen = new Set<string>();

  function f(day: number, last: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    const c = colOf(last);
    if (day < 0) {
      b.push("base-case", [0, c], "No days left below day 0 → contributes 0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
      return 0;
    }
    if (day === 0) {
      let best = 0;
      let bestTask = -1;
      for (let t = 0; t < 3; t++) {
        if (t === last) continue;
        if (pts[0][t] > best) { best = pts[0][t]; bestTask = t; }
      }
      b.push("recurse-call", [0, c], `f(0, ${c === 0 ? "none" : ACTIVITY_NAMES[last]}) called — first day.`, { callId, parentCallId, codeAnchor: "base" });
      b.push("base-case", [0, c], `Base case: day 0 picks the best allowed task (${ACTIVITY_NAMES[bestTask]} = ${best}).`, { callId, parentCallId, value: best, codeAnchor: "base" });
      return best;
    }
    const kk = `${day},${c}`;
    const dup = seen.has(kk);
    b.push("recurse-call", [day, c],
      dup ? `f(${day}, ${c}) called AGAIN — this (day, forbidden-task) state repeats.`
          : `f(${day}, ${c}) called: best merit through day ${day} while avoiding task "${c === 0 ? "none" : ACTIVITY_NAMES[last]}" as a repeat.`,
      { callId, parentCallId, dup: dup || undefined, codeAnchor: "recurse" });
    seen.add(kk);
    const parts: string[] = [];
    const deps: number[][] = [];
    let best = 0;
    for (let t = 0; t < 3; t++) {
      if (t === last) continue;
      const sub = f(day - 1, t, callId);
      const cand = pts[day][t] + sub;
      parts.push(`${ACTIVITY_NAMES[t]}: ${pts[day][t]}+${sub}`);
      deps.push([day - 1, colOf(t)]);
      if (cand > best) best = cand;
    }
    b.push("recurse-return", [day, c], `f(${day},${c}) = max(${parts.join(", ")}) = ${best}.`, {
      callId,
      parentCallId,
      value: best,
      deps,
      codeAnchor: "combine",
    });
    return best;
  }

  const answer = f(n - 1, -1);
  return {
    steps: b.steps,
    meta: {
      mode: "bruteforce",
      answer,
      answerLabel: "max merit points",
      tableShape: null,
      axisLabels: null,
      valueFormat: "int",
      stats: { steps: b.count, calls },
    },
  };
}

function genMemo(input: In): GeneratedTrace {
  const pts = input.points;
  const n = pts.length;
  const b = new TraceBuilder();
  const memo = new Map<string, number>();
  let calls = 0;
  let hits = 0;

  function f(day: number, last: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    const c = colOf(last);
    b.push("recurse-call", [day, c], `f(${day}, ${c}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (day === 0) {
      let best = 0;
      let bestTask = -1;
      for (let t = 0; t < 3; t++) {
        if (t === last) continue;
        if (pts[0][t] > best) { best = pts[0][t]; bestTask = t; }
      }
      b.push("base-case", [0, c], `Base case: day 0 → best allowed task is ${ACTIVITY_NAMES[bestTask]} = ${best}.`, { callId, parentCallId, value: best, codeAnchor: "base" });
      return best;
    }
    const kk = `${day},${c}`;
    if (memo.has(kk)) {
      hits++;
      const v = memo.get(kk)!;
      b.push("memo-hit", [day, c], `Memo hit! f(${day},${c}) = ${v} fetched instantly.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    const parts: string[] = [];
    const deps: number[][] = [];
    let best = 0;
    for (let t = 0; t < 3; t++) {
      if (t === last) continue;
      const sub = f(day - 1, t, callId);
      const cand = pts[day][t] + sub;
      parts.push(`${pts[day][t]}+${sub}`);
      deps.push([day - 1, colOf(t)]);
      if (cand > best) best = cand;
    }
    memo.set(kk, best);
    b.push("recurse-return", [day, c], `f(${day},${c}) = max(${parts.join(", ")}) = ${best}, stored in memo.`, {
      callId,
      parentCallId,
      value: best,
      deps,
      codeAnchor: "memoStore",
    });
    return best;
  }

  const answer = f(n - 1, -1);
  return {
    steps: b.steps,
    meta: {
      mode: "memo",
      answer,
      answerLabel: "max merit points",
      tableShape: { rows: n, cols: 4 },
      axisLabels: AXIS,
      valueFormat: "int",
      stats: { steps: b.count, calls, memoHits: hits },
    },
  };
}

function genTab(input: In): GeneratedTrace {
  const pts = input.points;
  const n = pts.length;
  const b = new TraceBuilder();
  const dp: number[][] = Array.from({ length: n }, () => [-1, -1, -1, -1]);

  // Day 0: best allowed task per forbidden-column
  for (let c = 0; c < 4; c++) {
    const last = c - 1;
    let best = 0;
    let bestTask = -1;
    for (let t = 0; t < 3; t++) {
      if (t === last) continue;
      if (pts[0][t] > best) { best = pts[0][t]; bestTask = t; }
    }
    b.push("base-case", [0, c],
      last < 0
        ? `dp[0][none]: day 0 unrestricted → best task ${ACTIVITY_NAMES[bestTask]} = ${best}.`
        : `dp[0][${ACTIVITY_NAMES[last]}]: day 0 can't repeat it → picks ${ACTIVITY_NAMES[bestTask]} = ${best}.`,
      { value: best, codeAnchor: "base" });
    dp[0][c] = best;
  }

  for (let day = 1; day < n; day++) {
    for (let c = 0; c < 4; c++) {
      const last = c - 1;
      const parts: string[] = [];
      const deps: number[][] = [];
      let best = 0;
      for (let t = 0; t < 3; t++) {
        if (t === last) continue;
        const cand = pts[day][t] + dp[day - 1][colOf(t)];
        parts.push(`${pts[day][t]}+${dp[day - 1][colOf(t)]}`);
        deps.push([day - 1, colOf(t)]);
        if (cand > best) best = cand;
      }
      b.push("table-write", [day, c], `dp[${day}][${c}] = max(${parts.join(", ")}) = ${best}.`, {
        value: best,
        deps,
        codeAnchor: "transition",
      });
      dp[day][c] = best;
    }
  }
  // Column 0 is the "nothing forbidden yet" state — the top-level answer.
  const answer = dp[n - 1][0];
  b.push("table-write", [n - 1, 0], `Answer read off dp[${n - 1}][none] = ${answer}.`, { value: answer, codeAnchor: "transition" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation",
      answer,
      answerLabel: "max merit points",
      tableShape: { rows: n, cols: 4 },
      axisLabels: AXIS,
      valueFormat: "int",
      stats: { steps: b.count, writes: 4 * n + 1 },
    },
  };
}

function genSpace(input: In): GeneratedTrace {
  const pts = input.points;
  const n = pts.length;
  const b = new TraceBuilder();

  let prevRow = [-1, -1, -1, -1];
  for (let c = 0; c < 4; c++) {
    const last = c - 1;
    let best = 0;
    for (let t = 0; t < 3; t++) {
      if (t === last) continue;
      best = Math.max(best, pts[0][t]);
    }
    prevRow[c] = best;
    b.push("base-case", [0, c], `Day 0 row initialised inline: column ${c} = ${best}. Only ONE previous row is ever kept.`, { value: best, codeAnchor: "init" });
  }

  for (let day = 1; day < n; day++) {
    const cur = [-1, -1, -1, -1];
    for (let c = 0; c < 4; c++) {
      const last = c - 1;
      const parts: string[] = [];
      const deps: number[][] = [];
      let best = 0;
      for (let t = 0; t < 3; t++) {
        if (t === last) continue;
        const cand = pts[day][t] + prevRow[colOf(t)];
        parts.push(`${pts[day][t]}+${prevRow[colOf(t)]}`);
        deps.push([day - 1, colOf(t)]);
        if (cand > best) best = cand;
      }
      cur[c] = best;
      b.push("table-write", [day, c], `cur[${c}] = max(${parts.join(", ")}) = ${best}; previous row discarded afterwards.`, {
        value: best,
        deps,
        codeAnchor: "transition",
      });
    }
    prevRow = cur;
  }
  const answer = prevRow[0];
  b.push("table-write", [n - 1, 0], `Answer = last computed row, column none = ${answer}.`, { value: answer, codeAnchor: "transition" });

  return {
    steps: b.steps,
    meta: {
      mode: "spaceOptimized",
      answer,
      answerLabel: "max merit points",
      tableShape: { rows: n, cols: 4 },
      axisLabels: AXIS,
      valueFormat: "int",
      rollingWindow: true,
      stats: { steps: b.count, writes: 4 * n + 1 },
    },
  };
}

const codes = {
  bruteforce: {
    cpp: withAnchors(
`int f(int day, int last, vector<vector<int>>& p) {
    if (day == 0) {                                  // base
        int best = 0;
        for (int t = 0; t < 3; ++t)
            if (t != last) best = max(best, p[0][t]);
        return best;
    }
    int best = 0;
    for (int t = 0; t < 3; ++t) {                    // recurse
        if (t == last) continue;
        int merit = p[day][t] + f(day - 1, t, p);
        best = max(best, merit);                     // combine
    }
    return best;
}
// call: f(n - 1, 3, points)   -- last=3 means "no restriction yet"
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int day, int last, int[][] p) {
    if (day == 0) {                                   // base
        int best = 0;
        for (int t = 0; t < 3; ++t)
            if (t != last) best = Math.max(best, p[0][t]);
        return best;
    }
    int best = 0;
    for (int t = 0; t < 3; ++t) {                     // recurse
        if (t == last) continue;
        best = Math.max(best, p[day][t] + f(day - 1, t, p));
    }
    return best;                                      // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(day, last, p):
    if day == 0:                                # base
        return max(p[0][t] for t in range(3) if t != last)
    best = 0
    for t in range(3):                          # recurse
        if t == last:
            continue
        best = max(best, p[day][t] + f(day - 1, t, p))
    return best                                 # combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: transition`,
      { base: "# base", recurse: "# recurse", combine: "# combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(day, last, p) {
  if (day === 0) {                               // base
    let best = 0;
    for (let t = 0; t < 3; t++)
      if (t !== last) best = Math.max(best, p[0][t]);
    return best;
  }
  let best = 0;
  for (let t = 0; t < 3; t++) {                  // recurse
    if (t === last) continue;
    best = Math.max(best, p[day][t] + f(day - 1, t, p));
  }
  return best;                                   // combine
}
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: transition`,
      { base: "// base", recurse: "// recurse", combine: "// combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", transition: "// anchor: transition" },
    ),
  },
  memoization: {
    cpp: withAnchors(
`int f(int day, int last, vector<vector<int>>& p, vector<vector<int>>& memo) {
    if (day == 0) {                                    // base
        int best = 0;
        for (int t = 0; t < 3; ++t)
            if (t != last) best = max(best, p[0][t]);
        return best;
    }
    if (memo[day][last] != -1) return memo[day][last]; // memo check
    int best = 0;
    for (int t = 0; t < 3; ++t) {                      // recurse
        if (t == last) continue;
        best = max(best, p[day][t] + f(day - 1, t, p, memo));
    }
    return memo[day][last] = best;                     // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    java: withAnchors(
`static int f(int day, int last, int[][] p, int[][] memo) {
    if (day == 0) {                                    // base
        int best = 0;
        for (int t = 0; t < 3; ++t)
            if (t != last) best = Math.max(best, p[0][t]);
        return best;
    }
    if (memo[day][last] != -1) return memo[day][last]; // memo check
    int best = 0;
    for (int t = 0; t < 3; ++t) {                      // recurse
        if (t == last) continue;
        best = Math.max(best, p[day][t] + f(day - 1, t, p, memo));
    }
    return memo[day][last] = best;                     // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
    python: withAnchors(
`def f(day, last, p, memo):
    if day == 0:                                 # base
        return max(p[0][t] for t in range(3) if t != last)
    if memo[day][last] != -1:                    # memo check
        return memo[day][last]
    best = 0
    for t in range(3):                           # recurse
        if t == last:
            continue
        best = max(best, p[day][t] + f(day - 1, t, p, memo))
    memo[day][last] = best
    return best                                  # memo store
# anchor: combine
# anchor: init
# anchor: transition
# memoCheck
# memoStore`,
      { base: "# base", recurse: "# recurse", memoCheck: "# memoCheck", memoStore: "# memoStore", combine: "# anchor: combine", init: "# anchor: init", transition: "# anchor: transition" },
    ),
    js: withAnchors(
`function f(day, last, p, memo) {
  if (day === 0) {                               // base
    let best = 0;
    for (let t = 0; t < 3; t++)
      if (t !== last) best = Math.max(best, p[0][t]);
    return best;
  }
  if (memo[day][last] !== -1) return memo[day][last]; // memo check
  let best = 0;
  for (let t = 0; t < 3; t++) {                  // recurse
    if (t === last) continue;
    best = Math.max(best, p[day][t] + f(day - 1, t, p, memo));
  }
  memo[day][last] = best;
  return best;                                   // memo store
}
// anchor: combine
// anchor: init
// anchor: transition
// memoCheck
// memoStore`,
      { base: "// base", recurse: "// recurse", memoCheck: "// memoCheck", memoStore: "// memoStore", combine: "// anchor: combine", init: "// anchor: init", transition: "// anchor: transition" },
    ),
  },
  tabulation: {
    cpp: withAnchors(
`int ninjaTraining(vector<vector<int>>& p) {
    int n = p.size();
    vector<vector<int>> dp(n, vector<int>(4, 0));
    for (int last = 0; last < 4; ++last)             // base: day 0
        for (int t = 0; t < 3; ++t)
            if (t != last - 1) dp[0][last] = max(dp[0][last], p[0][t]);
    for (int day = 1; day < n; ++day)
        for (int last = 0; last < 4; ++last) {
            dp[day][last] = 0;
            for (int t = 0; t < 3; ++t)              // transition
                if (t != last - 1)
                    dp[day][last] = max(dp[day][last], p[day][t] + dp[day - 1][t + 1]);
        }
    return dp[n - 1][0];
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int ninjaTraining(int[][] p) {
    int n = p.length;
    int[][] dp = new int[n][4];
    for (int last = 0; last < 4; ++last)              // base: day 0
        for (int t = 0; t < 3; ++t)
            if (t != last - 1) dp[0][last] = Math.max(dp[0][last], p[0][t]);
    for (int day = 1; day < n; ++day)
        for (int last = 0; last < 4; ++last)
            for (int t = 0; t < 3; ++t)               // transition
                if (t != last - 1)
                    dp[day][last] = Math.max(dp[day][last], p[day][t] + dp[day - 1][t + 1]);
    return dp[n - 1][0];
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def ninja_training(p):
    n = len(p)
    dp = [[0] * 4 for _ in range(n)]
    for last in range(4):                        # base: day 0
        for t in range(3):
            if t != last - 1:
                dp[0][last] = max(dp[0][last], p[0][t])
    for day in range(1, n):
        for last in range(4):
            for t in range(3):                   # transition
                if t != last - 1:
                    dp[day][last] = max(dp[day][last], p[day][t] + dp[day - 1][t + 1])
    return dp[n - 1][3]
# anchor: combine
# anchor: init
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { base: "# base", transition: "# transition", combine: "# anchor: combine", init: "# anchor: init", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function ninjaTraining(p) {
  const n = p.length;
  const dp = Array.from({ length: n }, () => [0, 0, 0, 0]);
  for (let last = 0; last < 4; last++)           // base: day 0
    for (let t = 0; t < 3; t++)
      if (t !== last - 1) dp[0][last] = Math.max(dp[0][last], p[0][t]);
  for (let day = 1; day < n; day++)
    for (let last = 0; last < 4; last++)
      for (let t = 0; t < 3; t++)                // transition
        if (t !== last - 1)
          dp[day][last] = Math.max(dp[day][last], p[day][t] + dp[day - 1][t + 1]);
  return dp[n - 1][0];
}
// anchor: combine
// anchor: init
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { base: "// base", transition: "// transition", combine: "// anchor: combine", init: "// anchor: init", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
  spaceOptimized: {
    cpp: withAnchors(
`int ninjaTraining(vector<vector<int>>& p) {
    vector<int> prev(4, 0);                          // init: day-0 row only
    for (int last = 0; last < 4; ++last)
        for (int t = 0; t < 3; ++t)
            if (t != last - 1) prev[last] = max(prev[last], p[0][t]);
    for (int day = 1; day < (int)p.size(); ++day) {
        vector<int> cur(4, 0);
        for (int last = 0; last < 4; ++last)
            for (int t = 0; t < 3; ++t)              // transition
                if (t != last - 1)
                    cur[last] = max(cur[last], p[day][t] + prev[t + 1]);
        prev = cur;
    }
    return prev[0];
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    java: withAnchors(
`static int ninjaTraining(int[][] p) {
    int[] prev = new int[4];                          // init: day-0 row only
    for (int last = 0; last < 4; ++last)
        for (int t = 0; t < 3; ++t)
            if (t != last - 1) prev[last] = Math.max(prev[last], p[0][t]);
    for (int day = 1; day < p.length; ++day) {
        int[] cur = new int[4];
        for (int last = 0; last < 4; ++last)
            for (int t = 0; t < 3; ++t)               // transition
                if (t != last - 1)
                    cur[last] = Math.max(cur[last], p[day][t] + prev[t + 1]);
        prev = cur;
    }
    return prev[0];
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
    python: withAnchors(
`def ninja_training(p):
    prev = [0] * 4                                # init: day-0 row only
    for last in range(4):
        for t in range(3):
            if t != last - 1:
                prev[last] = max(prev[last], p[0][t])
    for day in range(1, len(p)):
        cur = [0] * 4
        for last in range(4):
            for t in range(3):                    # transition
                if t != last - 1:
                    cur[last] = max(cur[last], p[day][t] + prev[t + 1])
        prev = cur
    return prev[3]
# anchor: base
# anchor: combine
# anchor: memoCheck
# anchor: memoStore
# anchor: recurse`,
      { init: "# init", transition: "# transition", base: "# anchor: base", combine: "# anchor: combine", memoCheck: "# anchor: memoCheck", memoStore: "# anchor: memoStore", recurse: "# anchor: recurse" },
    ),
    js: withAnchors(
`function ninjaTraining(p) {
  let prev = [0, 0, 0, 0];                      // init: day-0 row only
  for (let last = 0; last < 4; last++)
    for (let t = 0; t < 3; t++)
      if (t !== last - 1) prev[last] = Math.max(prev[last], p[0][t]);
  for (let day = 1; day < p.length; day++) {
    const cur = [0, 0, 0, 0];
    for (let last = 0; last < 4; last++)
      for (let t = 0; t < 3; t++)               // transition
        if (t !== last - 1)
          cur[last] = Math.max(cur[last], p[day][t] + prev[t + 1]);
    prev = cur;
  }
  return prev[0];
}
// anchor: base
// anchor: combine
// anchor: memoCheck
// anchor: memoStore
// anchor: recurse`,
      { init: "// init", transition: "// transition", base: "// anchor: base", combine: "// anchor: combine", memoCheck: "// anchor: memoCheck", memoStore: "// anchor: memoStore", recurse: "// anchor: recurse" },
    ),
  },
};

export const ninjaTraining: ProblemServiceDef = {
  slug: "ninja-training",
  patternSlug: "dp-grids",
  inputDescriptor: [
    { key: "points", label: "DAILY POINTS", kind: "grid", min: 3, max: 7, colsRange: [3, 3], valueRange: [1, 9] },
  ],
  schema,
  defaultInput: {
    points: [
      [1, 2, 5],
      [3, 1, 1],
      [3, 3, 3],
    ],
  },
  randomInput: () => ({
    points: Array.from({ length: 3 + Math.floor(Math.random() * 4) }, () =>
      Array.from({ length: 3 }, () => 1 + Math.floor(Math.random() * 9)),
    ),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? genBrute(input) : mode === "memo" ? genMemo(input) : mode === "tabulation" ? genTab(input) : genSpace(input),
  codes,
};
