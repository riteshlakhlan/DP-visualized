import type { DPMode, ProblemServiceDef } from "./types";
import { MODE_TO_VARIANT } from "./types";

import { climbingStairs } from "./climbing-stairs.service";
import { frogJump } from "./frog-jump.service";
import { frogJumpK } from "./frog-jump-k.service";
import { houseRobber } from "./house-robber.service";
import { houseRobberII } from "./house-robber-ii.service";
import { gridUniquePaths } from "./grid-unique-paths.service";
import { gridUniquePathsII } from "./grid-unique-paths-ii.service";
import { minimumPathSum } from "./minimum-path-sum.service";
import { ninjaTraining } from "./ninja-training.service";
import { minFallingPathSum } from "./min-falling-path-sum.service";
import { trianglePath } from "./triangle-path.service";
import { subsetSumEqualsTarget } from "./subset-sum.service";
import { partitionEqualSubsetSum } from "./partition-equal-subset-sum.service";
import { partitionMinAbsDiff } from "./partition-min-abs-diff.service";
import { zeroOneKnapsack } from "./zero-one-knapsack.service";
import { minimumCoins } from "./minimum-coins.service";
import { coinChangeII } from "./coin-change-ii.service";
import { countSubsetsSumK } from "./count-subsets-sum-k.service";
import { countPartitionsDiff } from "./count-partitions-diff.service";
import { targetSum } from "./target-sum.service";
import { unboundedKnapsack } from "./unbounded-knapsack.service";
import { rodCutting } from "./rod-cutting.service";
import { longestCommonSubsequence } from "./longest-common-subsequence.service";
import { longestCommonSubstring } from "./longest-common-substring.service";
import { longestPalindromicSubsequence } from "./longest-palindromic-subsequence.service";
import { printLCS } from "./print-lcs.service";
import { minInsertDelete } from "./min-insert-delete.service";
import { minInsertionsPalindrome } from "./min-insertions-palindrome.service";
import { scsService } from "./scs.service";
import { distinctSubsequences } from "./distinct-subsequences.service";
import { wildcardMatching } from "./wildcard-matching.service";
import { editDistance } from "./edit-distance.service";
import { stockI } from "./stock-i.service";
import { stockII } from "./stock-ii.service";
import { stockIII } from "./stock-iii.service";
import { stockIV } from "./stock-iv.service";
import { stockCooldown } from "./stock-cooldown.service";
import { stockFee } from "./stock-fee.service";
import { lisLength } from "./lis-length.service";
import { lisPrint } from "./lis-print.service";
import { lisBinarySearch } from "./lis-binary-search.service";
import { largestDivisibleSubset } from "./largest-divisible-subset.service";
import { longestStringChain } from "./longest-string-chain.service";
import { longestBitonic } from "./longest-bitonic.service";
import { numberOfLIS } from "./number-of-lis.service";
import { mcmService } from "./mcm.service";
import { mcmBottomUp } from "./mcm-bottom-up.service";
import { burstBalloons } from "./burst-balloons.service";
import { minCostCutStick } from "./min-cost-cut-stick.service";
import { booleanParenthesization } from "./boolean-parenthesization.service";
import { palindromePartitioningII } from "./palindrome-partitioning-ii.service";
import { partitionMaxSum } from "./partition-max-sum.service";
import { maxSquareWithOnes } from "./max-square-with-ones.service";
import { countSquareSubmatrices } from "./count-square-submatrices.service";
import { houseRobberIII } from "./house-robber-iii.service";
import { maxPathSumTree } from "./max-path-sum-tree.service";
import { treeDiameter } from "./tree-diameter.service";
import { wordBreak } from "./word-break.service";

/** Single source of truth: slug -> trace-generating service. */
const REGISTRY: Record<string, ProblemServiceDef> = Object.fromEntries(
  [
    climbingStairs,
    frogJump,
    frogJumpK,
    houseRobber,
    houseRobberII,
    ninjaTraining,
    gridUniquePaths,
    gridUniquePathsII,
    minimumPathSum,
    minFallingPathSum,
    trianglePath,
    subsetSumEqualsTarget,
    partitionEqualSubsetSum,
    partitionMinAbsDiff,
    countSubsetsSumK,
    countPartitionsDiff,
    targetSum,
    zeroOneKnapsack,
    minimumCoins,
    coinChangeII,
    unboundedKnapsack,
    rodCutting,
    longestCommonSubsequence,
    longestCommonSubstring,
    longestPalindromicSubsequence,
    printLCS,
    minInsertDelete,
    minInsertionsPalindrome,
    scsService,
    distinctSubsequences,
    wildcardMatching,
    editDistance,
    stockI,
    stockII,
    stockIII,
    stockIV,
    stockCooldown,
    stockFee,
    lisLength,
    lisPrint,
    lisBinarySearch,
    largestDivisibleSubset,
    longestStringChain,
    longestBitonic,
    numberOfLIS,
    mcmService,
    mcmBottomUp,
    burstBalloons,
    minCostCutStick,
    booleanParenthesization,
    palindromePartitioningII,
    partitionMaxSum,
    maxSquareWithOnes,
    countSquareSubmatrices,
    houseRobberIII,
    maxPathSumTree,
    treeDiameter,
    wordBreak,
  ].map((s) => [s.slug, s]),
);

export function getService(slug: string): ProblemServiceDef | undefined {
  return REGISTRY[slug];
}

export function listImplementedSlugs(): string[] {
  return Object.keys(REGISTRY);
}

export function supportsMode(slug: string, mode: DPMode): boolean {
  const def = REGISTRY[slug];
  if (!def) return false;
  return Boolean(def.codes[MODE_TO_VARIANT[mode]]);
}
