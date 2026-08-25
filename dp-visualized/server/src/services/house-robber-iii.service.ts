import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { withAnchors } from "../data/code.types";
import { buildTree, NULL_SENTINEL } from "./tree-helpers";

/* House Robber III: rob binary-tree nodes, never father + child together.
 * Post-order pair DP per node: (bestIfRobbed, bestIfSkipped).
 */

const schema = z.object({
  tree: z.array(z.number().int().min(-100).max(99)).min(1).max(15),
});
type In = z.infer<typeof schema>;

function limits(mode: DPMode, input: In): string | null {
  const real = input.tree.filter((v) => v !== NULL_SENTINEL).length;
  if (mode === "bruteforce" && Math.pow(2, real) > 128)
    return "Brute force tries every rob/skip subset. Use at most ~7 nodes.";
  if (mode === "spaceOptimized")
    return "Trees have no linear rolling window — each node depends on its whole subtree. Use Memoization or Tabulation.";
  return null;
}

const axisFor = (n: number) => ({
  rowsTitle: "decision",
  colsTitle: "node idx",
  rowLabels: ["rob", "skip"],
  colLabels: Array.from({ length: n }, (_, i) => `#${i}`),
});

interface Pair { rob: number; skip: number }

function makeRunner(mode: "bruteforce" | "memo") {
  return (input: In): GeneratedTrace => {
    const nodes = buildTree(input.tree);
    const n = input.tree.length;
    const b = new TraceBuilder();
    const memo = new Map<string, Pair>();
    let calls = 0;
    let hits = 0;

    function f(i: number, parentCallId?: number): Pair {
      const callId = b.allocCallId();
      calls++;
      const node = nodes[i];
      if (!node) {
        b.push("base-case", [1, Math.min(i, n - 1)], "Empty subtree → rob=skip=0.", { callId, parentCallId, value: 0, codeAnchor: "base" });
        return { rob: 0, skip: 0 };
      }
      b.push("recurse-call", [0, i], `f(node ${i} = ${node.val}) called.`, { callId, parentCallId, codeAnchor: "recurse" });

      if (mode === "memo") {
        const kk = `${i}`;
        if (memo.has(kk)) {
          hits++;
          const v = memo.get(kk)!;
          b.push("memo-hit", [0, i], `Memo hit! node ${i}: rob=${v.rob}, skip=${v.skip}.`, { callId, parentCallId, value: v.rob, codeAnchor: "memoCheck" });
          return v;
        }
      }

      let robVal = node.val;
      let skipVal = 0;
      for (const c of node.children) {
        const childPair = f(c, callId);
        robVal += childPair.skip;
        skipVal += Math.max(childPair.rob, childPair.skip);
      }
      const pair: Pair = { rob: robVal, skip: skipVal };
      if (mode === "memo") memo.set(`${i}`, pair);

      b.push("recurse-return", [0, i], `rob[${i}] = ${robVal} (val + skipped children).`, {
        callId, parentCallId, value: robVal,
        deps: node.children.map((c) => [1, c]),
        codeAnchor: mode === "memo" ? "memoStore" : "combine",
      });
      b.push("recurse-return", [1, i], `skip[${i}] = ${skipVal} (best of children).`, {
        value: skipVal,
        deps: node.children.map((c) => [Math.max(0, c === i ? 0 : 0), c] as [number, number]).map(([r, c2]) => [r, c2] as [number, number]).map((x) => x),
        codeAnchor: mode === "memo" ? "memoStore" : "combine",
      });
      return pair;
    }

    const rootPair = f(0);
    const answer = Math.max(rootPair.rob, rootPair.skip);

    return {
      steps: b.steps,
      meta:
        mode === "memo"
          ? {
              mode, answer, answerLabel: "max loot",
              tableShape: { rows: 2, cols: n }, axisLabels: axisFor(n), valueFormat: "int" as const,
              stats: { steps: b.count, calls, memoHits: hits },
            }
          : {
              mode, answer, answerLabel: "max loot",
              tableShape: null, axisLabels: null, valueFormat: "int" as const,
              stats: { steps: b.count, calls },
            },
    };
  };
}

function genTab(input: In): GeneratedTrace {
  const nodes = buildTree(input.tree);
  const n = input.tree.length;
  const b = new TraceBuilder();
  const dpR = new Array(n).fill(0);
  const dpS = new Array(n).fill(0);

  // iterative post-order via two-pass stack
  const order: number[] = [];
  const stack = [0];
  while (stack.length) {
    const i = stack.pop()!;
    if (!nodes[i]) continue;
    order.push(i);
    for (const c of nodes[i]!.children) stack.push(c);
  }
  order.reverse(); // children before parents

  for (const i of order) {
    const node = nodes[i]!;
    let robVal = node.val;
    let skipVal = 0;
    for (const c of node.children) {
      robVal += dpS[c];
      skipVal += Math.max(dpR[c], dpS[c]);
    }
    dpR[i] = robVal;
    dpS[i] = skipVal;
    b.push("table-write", [0, i], `rob[${i}] = val(${node.val}) + Σ skip[children] = ${robVal}.`, {
      value: robVal, deps: node.children.map((c) => [1, c]), codeAnchor: "transition",
    });
    b.push("table-write", [1, i], `skip[${i}] = Σ max(rob,skip)[children] = ${skipVal}.`, {
      value: skipVal, deps: node.children.map((c) => [0, c]), codeAnchor: "transition",
    });
  }

  const answer = Math.max(dpR[0], dpS[0]);
  b.push("table-read", [0, 0], `Answer = max(rob[root]=${dpR[0]}, skip[root]=${dpS[0]}) = ${answer}.`, { value: answer, codeAnchor: "driver" });

  return {
    steps: b.steps,
    meta: {
      mode: "tabulation", answer, answerLabel: "max loot",
      tableShape: { rows: 2, cols: n }, axisLabels: axisFor(n), valueFormat: "int",
      stats: { steps: b.count, writes: 2 * n + 1 },
    },
  };
}

export const houseRobberIII: ProblemServiceDef = {
  slug: "house-robber-iii",
  patternSlug: "dp-trees",
  inputDescriptor: [
    { key: "tree", label: "TREE LEVEL ORDER", kind: "array", min: 3, max: 15, valueRange: [1, 9] },
  ],
  schema,
  defaultInput: { tree: [3, 2, 3, NULL_SENTINEL, 3, NULL_SENTINEL, 1] }, // LC337 → 7
  randomInput: () => ({
    tree: Array.from({ length: 7 }, (_, i) =>
      i > 0 && Math.random() < 0.25 ? NULL_SENTINEL : 1 + Math.floor(Math.random() * 9)),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (input, mode) =>
    mode === "bruteforce" ? makeRunner("bruteforce")(input as In)
    : mode === "memo" ? makeRunner("memo")(input as In)
    : genTab(input as In),
  codes: {
    bruteforce: {
      cpp: withAnchors(`pair<int,int> dfs(TreeNode* r) {\n    if (!r) return {0, 0};                    // base\n    auto L = dfs(r->left), R = dfs(r->right); // recurse\n    int rob = r->val + L.second + R.second;\n    int skip = max(L.first, L.second) + max(R.first, R.second);\n    return {rob, skip};                       // combine\n}`, { base: "base", recurse: "recurse", combine: "combine" }),
      java: withAnchors(`static int[] dfs(TreeNode r) {\n    if (r == null) return new int[]{0, 0};     // base\n    int[] L = dfs(r.left), R = dfs(r.right);   // recurse\n    int rob = r.val + L[1] + R[1];\n    int skip = Math.max(L[0], L[1]) + Math.max(R[0], R[1]);\n    return new int[]{rob, skip};               // combine\n}`, { base: "base", recurse: "recurse", combine: "combine" }),
      python: withAnchors(`def dfs(r):\n    if not r:                              # base\n        return 0, 0\n    lr, ls = dfs(r.left)                   # recurse\n    rr, rs = dfs(r.right)\n    rob = r.val + ls + rs\n    skip = max(lr, ls) + max(rr, rs)\n    return rob, skip                       # combine`, { base: "base", recurse: "recurse", combine: "combine" }),
      js: withAnchors(`function dfs(r) {\n  if (!r) return [0, 0];                  // base\n  const [lr, ls] = dfs(r.left);           // recurse\n  const [rr, rs] = dfs(r.right);\n  const rob = r.val + ls + rs;\n  const skip = Math.max(lr, ls) + Math.max(rr, rs);\n  return [rob, skip];                     // combine\n}`, { base: "base", recurse: "recurse", combine: "combine" }),
    },
    memoization: {
      cpp: withAnchors(`pair<int,int> dfs(TreeNode* r) {\n    if (!r) return {0, 0};                    // base\n    auto L = dfs(r->left), R = dfs(r->right); // recurse\n    int rob = r->val + L.second + R.second;\n    int skip = max(L.first, L.second) + max(R.first, R.second);\n    return {rob, skip};                       // combine\n}`, { base: "base", recurse: "recurse", combine: "combine" }),
      java: withAnchors(`static int[] dfs(TreeNode r) {\n    if (r == null) return new int[]{0, 0};     // base\n    int[] L = dfs(r.left), R = dfs(r.right);   // recurse\n    int rob = r.val + L[1] + R[1];\n    int skip = Math.max(L[0], L[1]) + Math.max(R[0], R[1]);\n    return new int[]{rob, skip};               // combine\n}`, { base: "base", recurse: "recurse", combine: "combine" }),
      python: withAnchors(`def dfs(r):\n    if not r:                              # base\n        return 0, 0\n    lr, ls = dfs(r.left)                   # recurse\n    rr, rs = dfs(r.right)\n    rob = r.val + ls + rs\n    skip = max(lr, ls) + max(rr, rs)\n    return rob, skip                       # combine`, { base: "base", recurse: "recurse", combine: "combine" }),
      js: withAnchors(`function dfs(r) {\n  if (!r) return [0, 0];                  // base\n  const [lr, ls] = dfs(r.left);           // recurse\n  const [rr, rs] = dfs(r.right);\n  const rob = r.val + ls + rs;\n  const skip = Math.max(lr, ls) + Math.max(rr, rs);\n  return [rob, skip];                     // combine\n}`, { base: "base", recurse: "recurse", combine: "combine" }),
    },
    tabulation: {
      cpp: withAnchors(`int rob(TreeNode* root) {\n    auto res = dfs(root);                 // driver\n    return max(res.first, res.second);\n}\npair<int,int> dfs(TreeNode* r) {\n    if (!r) return {0, 0};                // base\n    auto L = dfs(r->left), R = dfs(r->right); // transition\n    int rob = r->val + L.second + R.second;\n    int skip = max(L.first, L.second) + max(R.first, R.second);\n    return {rob, skip};                   // transition\n}`, { driver: "driver", base: "base", transition: "// transition" }),
      java: withAnchors(`static int rob(TreeNode root) {\n    int[] res = dfs(root);                // driver\n    return Math.max(res[0], res[1]);\n}\nstatic int[] dfs(TreeNode r) {\n    if (r == null) return new int[]{0, 0};   // base\n    int[] L = dfs(r.left), R = dfs(r.right); // transition\n    int rob = r.val + L[1] + R[1];\n    int skip = Math.max(L[0], L[1]) + Math.max(R[0], R[1]);\n    return new int[]{rob, skip};             // transition\n}`, { driver: "driver", base: "base", transition: "// transition" }),
      python: withAnchors(`def rob(root):\n    return max(dfs(root))               # driver\n\ndef dfs(r):\n    if not r:                            # base\n        return 0, 0\n    lr, ls = dfs(r.left)                 # transition\n    rr, rs = dfs(r.right)\n    rob = r.val + ls + rs\n    skip = max(lr, ls) + max(rr, rs)\n    return rob, skip                     # transition`, { driver: "driver", base: "base", transition: "transition" }),
      js: withAnchors(`function rob(root) {\n  return Math.max(...dfs(root));        // driver\n}\nfunction dfs(r) {\n  if (!r) return [0, 0];               // base\n  const [lr, ls] = dfs(r.left);        // transition\n  const [rr, rs] = dfs(r.right);\n  const rob = r.val + ls + rs;\n  const skip = Math.max(lr, ls) + Math.max(rr, rs);\n  return [rob, skip];                  // transition\n}`, { driver: "driver", base: "base", transition: "transition" }),
    },
  },
};
