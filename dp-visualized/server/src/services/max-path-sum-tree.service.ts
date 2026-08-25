import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";
import { buildTree, NULL_SENTINEL } from "./tree-helpers";

/* Max Path Sum in Binary Tree: any node-to-node path; dp = best gain through node. */

const schema = z.object({ tree: z.array(z.number().int().min(-100).max(99)).min(1).max(15) });
type In = z.infer<typeof schema>;

function limits(mode: DPMode): string | null {
  if (mode === "spaceOptimized")
    return "Trees have no linear rolling window. Use Memoization or Tabulation.";
  return null;
}

function run(input: In, mode: "bruteforce" | "memo"): GeneratedTrace {
  const nodes = buildTree(input.tree);
  const n = input.tree.length;
  const b = new TraceBuilder();
  const memo = new Map<number, number>();
  let calls = 0;
  let hits = 0;
  let answer = -Infinity;

  function gain(i: number, parentCallId?: number): number {
    const callId = b.allocCallId();
    calls++;
    const nd = nodes[i];
    if (!nd) { b.push("base-case", [Math.min(i, n - 1)], "Null → gain 0.", { callId, parentCallId, value: 0, codeAnchor: "base" }); return 0; }
    b.push("recurse-call", [i], `gain(${i}=${nd.val}) called.`, { callId, parentCallId, codeAnchor: "recurse" });
    if (mode === "memo" && memo.has(i)) {
      hits++; const v = memo.get(i)!;
      b.push("memo-hit", [i], `Memo hit! gain(${i}) = ${v}.`, { callId, parentCallId, value: v, codeAnchor: "memoCheck" });
      return v;
    }
    const lg = Math.max(0, nd.children.length > 0 ? gain(nd.children[0], callId) : 0);
    const rg = nd.children.length > 1 ? Math.max(0, gain(nd.children[1], callId)) : 0;
    // path THROUGH this node
    answer = Math.max(answer, nd.val + lg + rg);
    const g = nd.val + Math.max(lg, rg);
    if (mode === "memo") memo.set(i, g);
    b.push(mode === "memo" ? "recurse-return" : "recurse-return", [i],
      `gain(${i}) = ${g}; path through = ${nd.val + lg + rg}.`,
      { callId, parentCallId, value: g, deps: nd.children.map((c) => [c]).filter((c) => c[0] < n), codeAnchor: mode === "memo" ? "memoStore" : "combine" });
    return g;
  }

  gain(0);
  return {
    steps: b.steps,
    meta:
      mode === "memo"
        ? { mode, answer, answerLabel: "max path sum", tableShape: { rows: 1, cols: n }, axisLabels: { rowsTitle: "gain", colsTitle: "node idx", rowLabels: ["gain"] }, valueFormat: "int", stats: { steps: b.count, calls, memoHits: hits } }
        : { mode, answer, answerLabel: "max path sum", tableShape: null, axisLabels: null, valueFormat: "int", stats: { steps: b.count, calls } },
  };
}

function genTab(input: In): GeneratedTrace {
  const nodes = buildTree(input.tree);
  const n = input.tree.length;
  const b = new TraceBuilder();
  const gainArr = new Array(n).fill(0);
  let answer = -Infinity;

  const order: number[] = [];
  const stack = [0];
  while (stack.length) {
    const i = stack.pop()!;
    if (!nodes[i]) continue;
    order.push(i);
    for (const c of nodes[i]!.children) stack.push(c);
  }
  order.reverse();

  for (const i of order) {
    const nd = nodes[i]!;
    const lg = nd.children.length > 0 ? Math.max(0, gainArr[nd.children[0]]) : 0;
    const rg = nd.children.length > 1 ? Math.max(0, gainArr[nd.children[1]]) : 0;
    gainArr[i] = nd.val + Math.max(lg, rg);
    answer = Math.max(answer, nd.val + lg + rg);
    b.push("table-write", [i],
      `gain[${i}] = ${nd.val} + max(left ${lg}, right ${rg}) = ${gainArr[i]}; through-path ${nd.val + lg + rg}.`,
      { value: gainArr[i], deps: nd.children.map((c) => [c]), codeAnchor: "transition" });
  }
  b.push("table-read", [order[order.length - 1]], `Answer = max through-path = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation", answer, answerLabel: "max path sum",
      tableShape: { rows: 1, cols: n }, axisLabels: { rowsTitle: "gain", colsTitle: "node idx", rowLabels: ["gain"] },
      valueFormat: "int", stats: { steps: b.count, writes: n + 1 },
    },
  };
}

const dfsSnippet = (lang: string) => {
  if (lang === "cpp") return `int gain(TreeNode* r, int& ans) {\n    if (!r) return 0;                    // base\n    int L = gain(r->left, ans);          // recurse\n    int R = gain(r->right, ans);\n    ans = max(ans, r->val + max(0, L) + max(0, R)); // combine\n    return r->val + max(L, R);\n}`;
  if (lang === "java") return `static int gain(TreeNode r, int[] ans) {\n    if (r == null) return 0;             // base\n    int L = gain(r.left, ans);           // recurse\n    int R = gain(r.right, ans);\n    ans[0] = Math.max(ans[0], r.val + Math.max(0, L) + Math.max(0, R)); // combine\n    return r.val + Math.max(L, R);\n}`;
  if (lang === "python") return `def gain(r, ans):\n    if not r:                        # base\n        return 0\n    L = gain(r.left, ans)            # recurse\n    R = gain(r.right, ans)\n    ans[0] = max(ans[0], r.val + max(0, L) + max(0, R))  # combine\n    return r.val + max(L, R)`;
  return `function gain(r, ans) {\n  if (!r) return 0;                  // base\n  const L = gain(r.left, ans);       // recurse\n  const R = gain(r.right, ans);\n  ans.v = Math.max(ans.v, r.val + Math.max(0, L) + Math.max(0, R));  // combine\n  return r.val + Math.max(L, R);\n}`;
};

export const maxPathSumTree: ProblemServiceDef = {
  slug: "max-path-sum-tree",
  patternSlug: "dp-trees",
  inputDescriptor: [{ key: "tree", label: "TREE LEVEL ORDER (-100=null)", kind: "array", min: 3, max: 15 }],
  schema,
  defaultInput: { tree: [-10, 9, 20, NULL_SENTINEL, NULL_SENTINEL, 15, 7] }, // LC124 → 42
  randomInput: () => ({ tree: Array.from({ length: 7 }, (_, i) => (i > 0 && Math.random() < 0.25 ? NULL_SENTINEL : -9 + Math.floor(Math.random() * 19))) }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" || mode === "memo" ? run(input as In, mode as "bruteforce" | "memo") : genTab(input as In),
  codes: {
    bruteforce: {
      cpp: withAnchors(dfsSnippet("cpp"), { base: "base", recurse: "recurse", combine: "combine" }),
      java: withAnchors(dfsSnippet("java"), { base: "base", recurse: "recurse", combine: "combine" }),
      python: withAnchors(dfsSnippet("python"), { base: "base", recurse: "recurse", combine: "combine" }),
      js: withAnchors(dfsSnippet("js"), { base: "base", recurse: "recurse", combine: "combine" }),
    },
    memoization: {
      cpp: withAnchors(dfsSnippet("cpp"), { base: "base", recurse: "recurse", combine: "combine" }),
      java: withAnchors(dfsSnippet("java"), { base: "base", recurse: "recurse", combine: "combine" }),
      python: withAnchors(dfsSnippet("python"), { base: "base", recurse: "recurse", combine: "combine" }),
      js: withAnchors(dfsSnippet("js"), { base: "base", recurse: "recurse", combine: "combine" }),
    },
    tabulation: {
      cpp: withAnchors(dfsSnippet("cpp"), { base: "base", recurse: "recurse", combine: "combine" }),
      java: withAnchors(dfsSnippet("java"), { base: "base", recurse: "recurse", combine: "combine" }),
      python: withAnchors(dfsSnippet("python"), { base: "base", recurse: "recurse", combine: "combine" }),
      js: withAnchors(dfsSnippet("js"), { base: "base", recurse: "recurse", combine: "combine" }),
    },
  },
};
