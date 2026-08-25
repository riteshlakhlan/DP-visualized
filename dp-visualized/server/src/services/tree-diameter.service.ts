import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";
import { buildTree, NULL_SENTINEL } from "./tree-helpers";

/* Diameter of Binary Tree: longest path in edges. depth(i) = 1 + max(depth[children]). */

const schema = z.object({ tree: z.array(z.number().int().min(1).max(99)).min(3).max(15) });
type In = z.infer<typeof schema>;
function limits(mode: DPMode): string | null {
  if (mode === "spaceOptimized") return "No linear rolling window for trees.";
  return null;
}

function genTab(input: In): GeneratedTrace {
  const nodes = buildTree(input.tree);
  const n = input.tree.length;
  const b = new TraceBuilder();
  const depth = new Array(n).fill(0);
  let answer = 0;

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
    const maxChild = nd.children.reduce((m, c) => Math.max(m, depth[c]), 0);
    depth[i] = nd.children.length ? 1 + maxChild : 0;
    // diameter through this node = sum of two deepest child chains
    const sorted = nd.children.map((c) => depth[c]).sort((a, b) => b - a);
    const through = sorted.slice(0, 2).reduce((s, d) => s + d + 1, 0);
    answer = Math.max(answer, through);
    b.push("table-write", [i], `depth[${i}] = ${depth[i]}; through-path ${through} edges.`, {
      value: depth[i], deps: nd.children.map((c) => [c]), codeAnchor: "transition",
    });
  }
  b.push("table-read", [order[order.length - 1]], `Diameter = ${answer} edges.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation", answer, answerLabel: "diameter (edges)",
      tableShape: { rows: 1, cols: n }, axisLabels: { rowsTitle: "depth", colsTitle: "node idx", rowLabels: ["depth"] },
      valueFormat: "int", stats: { steps: b.count, writes: n + 1 },
    },
  };
}

const snippet = (lang: string) => lang === "cpp"
  ? `int dfs(TreeNode* r, int& ans) {\n    if (!r) return 0;                    // base\n    int L = dfs(r->left, ans);           // recurse\n    int R = dfs(r->right, ans);\n    ans = max(ans, L + R);               // combine\n    return 1 + max(L, R);\n}`
  : lang === "java"
  ? `static int dfs(TreeNode r, int[] ans) {\n    if (r == null) return 0;             // base\n    int L = dfs(r.left, ans);            // recurse\n    int R = dfs(r.right, ans);\n    ans[0] = Math.max(ans[0], L + R);   // combine\n    return 1 + Math.max(L, R);\n}`
  : lang === "python"
  ? `def dfs(r, ans):\n    if not r:                        # base\n        return 0\n    L = dfs(r.left, ans)             # recurse\n    R = dfs(r.right, ans)\n    ans[0] = max(ans[0], L + R)     # combine\n    return 1 + max(L, R)`
  : `function dfs(r, ans) {\n  if (!r) return 0;                 // base\n  const L = dfs(r.left, ans);       // recurse\n  const R = dfs(r.right, ans);\n  ans.v = Math.max(ans.v, L + R);  // combine\n  return 1 + Math.max(L, R);\n}`;

export const treeDiameter: ProblemServiceDef = {
  slug: "tree-diameter",
  patternSlug: "dp-trees",
  inputDescriptor: [{ key: "tree", label: "TREE LEVEL ORDER", kind: "array", min: 3, max: 15 }],
  schema,
  defaultInput: { tree: [1, 2, 3, 4, 5] }, // → 3
  randomInput: () => ({ tree: Array.from({ length: 7 }, (_, i) => (i > 0 && Math.random() < 0.25 ? NULL_SENTINEL : 1 + Math.floor(Math.random() * 9))) }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input) => genTab(input as In),
  codes: {
    bruteforce: {
      cpp: withAnchors(snippet("cpp"), { base: "base", recurse: "recurse", combine: "combine" }),
      java: withAnchors(snippet("java"), { base: "base", recurse: "recurse", combine: "combine" }),
      python: withAnchors(snippet("python"), { base: "base", recurse: "recurse", combine: "combine" }),
      js: withAnchors(snippet("js"), { base: "base", recurse: "recurse", combine: "combine" }),
    },
    memoization: {
      cpp: withAnchors(snippet("cpp"), { base: "base", recurse: "recurse", combine: "combine" }),
      java: withAnchors(snippet("java"), { base: "base", recurse: "recurse", combine: "combine" }),
      python: withAnchors(snippet("python"), { base: "base", recurse: "recurse", combine: "combine" }),
      js: withAnchors(snippet("js"), { base: "base", recurse: "recurse", combine: "combine" }),
    },
    tabulation: {
      cpp: withAnchors(snippet("cpp"), { base: "base", recurse: "recurse", combine: "combine" }),
      java: withAnchors(snippet("java"), { base: "base", recurse: "recurse", combine: "combine" }),
      python: withAnchors(snippet("python"), { base: "base", recurse: "recurse", combine: "combine" }),
      js: withAnchors(snippet("js"), { base: "base", recurse: "recurse", combine: "combine" }),
    },
  },
};
