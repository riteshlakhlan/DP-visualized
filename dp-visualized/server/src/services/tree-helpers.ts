import { z } from "zod";
import { TraceBuilder } from "./helpers";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";

/* Shared binary-tree helpers for the DP-on-Trees services.
 * Trees arrive as LEVEL-ORDER arrays where -100 marks a missing node.
 */

export interface TreeNode {
  idx: number;      // index in the level-order array
  val: number;
  children: number[]; // indices of existing children (0..2)
}

export const NULL_SENTINEL = -100;

export function buildTree(arr: number[]): (TreeNode | null)[] {
  const nodes: (TreeNode | null)[] = arr.map((v, idx) =>
    v === NULL_SENTINEL ? null : { idx, val: v, children: [] },
  );
  for (let i = 0; i < arr.length; i++) {
    if (!nodes[i]) continue;
    const left = 2 * i + 1;
    const right = 2 * i + 2;
    if (left < arr.length && nodes[left]) nodes[i]!.children.push(left);
    if (right < arr.length && nodes[right]) nodes[i]!.children.push(right);
  }
  return nodes;
}

/** node count cap shared by all tree services */
export function treeLimit(mode: DPMode, input: { tree: number[] }, bruteMaxNodes = 5): string | null {
  const real = input.tree.filter((v) => v !== NULL_SENTINEL).length;
  if (mode === "bruteforce" && real > bruteMaxNodes)
    return `Brute force enumerates every per-node decision. Use trees of at most ${bruteMaxNodes} nodes.`;
  if (mode === "spaceOptimized")
    return "Trees have no linear rolling window — each node's value depends on its whole subtree. Use Memoization or Tabulation.";
  return null;
}

export const treeSchema = z.object({
  tree: z.array(z.number().int().min(-99).max(99)).min(1).max(15),
});
