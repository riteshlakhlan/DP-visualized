import { z } from "zod";
import type { ProblemServiceDef, DPMode, GeneratedTrace } from "./types";
import { bruteGen, memoGen, tabGen, spaceGen, subsetSumEqualsTarget, type LabelInfo } from "./subset-sum.service";

/* Partition Equal Subset Sum (Striver DP-15) — the flagship walkthrough.
 * Key insight: the array can be split into two equal-sum halves iff some
 * subset sums to total/2. So this IS Subset Sum with a derived target,
 * and it reuses Subset Sum's generators and code snippets verbatim
 * (single source of truth for correctness).
 */

const schema = z.object({
  arr: z.array(z.number().int().min(0).max(30)).min(1).max(10),
});
type In = z.infer<typeof schema>;

function labelInfo(arr: number[]): LabelInfo {
  const total = arr.reduce((s, x) => s + x, 0);
  if (total % 2 !== 0)
    return {
      answerLabel: "equal partition exists",
      derived: `sum = ${total} → odd, cannot split evenly`,
      preamble: `Total sum = ${total}, which is ODD. An equal split is impossible before we even start — no DP table needed.`,
    };
  const target = total / 2;
  return {
    answerLabel: "equal partition exists",
    derived: `target = sum / 2 = ${total} / 2 = ${target}`,
    preamble: `If any subset sums to target = sum / 2 = ${total} / 2 = ${target}, the remaining elements automatically form the other half. Reduce to Subset Sum(${target}).`,
  };
}

function limits(mode: DPMode, input: In): string | null {
  if (mode === "bruteforce" && input.arr.length > 8)
    return "Pure recursion explores all 2^n subsets. Keep at most 8 elements for Brute Force.";
  const total = input.arr.reduce((s: number, x: number) => s + x, 0);
  const t = Math.floor(total / 2);
  if (mode !== "bruteforce" && (input.arr.length + 1) * (t + 1) > 500)
    return `The memo table would be ${input.arr.length + 1}x${t + 1} cells — trim the array or its values.`;
  return null;
}

export const partitionEqualSubsetSum: ProblemServiceDef = {
  slug: "partition-equal-subset-sum",
  patternSlug: "dp-subsequences",
  inputDescriptor: [{ key: "arr", label: "ITEMS", kind: "array", min: 1, max: 9, valueRange: [0, 20] }],
  schema,
  defaultInput: { arr: [2, 3, 5, 7, 7] },
  randomInput: () => ({
    arr: Array.from({ length: 4 + Math.floor(Math.random() * 4) }, () => 1 + Math.floor(Math.random() * 12)),
  }),
  limitsPerMode: { bruteforce: limits, memo: limits, tabulation: limits, spaceOptimized: limits },
  buildTrace: (rawInput, mode): GeneratedTrace => {
    const input = rawInput as In;
    const li = labelInfo(input.arr);
    const total = input.arr.reduce((s, x) => s + x, 0);
    if (total % 2 !== 0) {
      return {
        steps: [
          {
            stepIndex: 0,
            type: "base-case",
            coordinates: [0, 0],
            explanation: li.preamble!,
          },
        ],
        meta: {
          mode,
          answer: false,
          answerLabel: li.answerLabel,
          derived: li.derived,
          tableShape: null,
          axisLabels: null,
          valueFormat: "bool",
          stats: { steps: 1 },
        },
      };
    }
    const target = total / 2;
    switch (mode) {
      case "bruteforce": return bruteGen(input.arr, target, li, mode);
      case "memo": return memoGen(input.arr, target, li, mode);
      case "tabulation": return tabGen(input.arr, target, li, mode);
      default: return spaceGen(input.arr, target, li, mode);
    }
  },
  // Identical algorithm shape -> identical snippets; one source of truth.
  codes: subsetSumEqualsTarget.codes,
};
