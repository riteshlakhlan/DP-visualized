/** Client mirrors of the server's DTO contracts. */

export type DPMode = "bruteforce" | "memo" | "tabulation" | "spaceOptimized";
export const DP_MODES: DPMode[] = ["bruteforce", "memo", "tabulation", "spaceOptimized"];

export const MODE_LABEL: Record<DPMode, string> = {
  bruteforce: "Brute Force",
  memo: "Memoization",
  tabulation: "Tabulation",
  spaceOptimized: "Space Optimized",
};

export interface DPStep {
  stepIndex: number;
  type: "recurse-call" | "recurse-return" | "memo-hit" | "table-write" | "table-read" | "base-case";
  coordinates: number[];
  value?: number | boolean;
  deps?: number[][];
  callId?: number;
  parentCallId?: number;
  dup?: boolean;
  codeAnchor?: string;
  explanation: string;
}

export interface TraceMeta {
  mode: DPMode;
  answer: number | boolean | null;
  answerLabel: string;
  derived?: string;
  tableShape: { rows: number; cols: number } | null;
  axisLabels: {
    rowsTitle: string;
    colsTitle: string;
    rowLabels?: string[];
    colLabels?: string[];
  } | null;
  valueFormat: "bool" | "int";
  rollingWindow?: boolean;
  stats: { steps: number; calls?: number; memoHits?: number; writes?: number };
}

export interface TraceResponse {
  slug: string;
  meta: TraceMeta;
  steps: DPStep[];
  codeLines?: Record<string, number> | null;
}

export interface CodeSnippetDTO {
  code: string;
  anchors: Record<string, number>;
}

export type Lang = "cpp" | "java" | "python" | "js";

export interface ProblemDetail {
  slug: string;
  title: string;
  patternSlug: string;
  difficulty: "Easy" | "Medium" | "Hard";
  dimensions: 1 | 2 | 3;
  implemented: boolean;
  striverLink: string;
  statement: string;
  constraints: string[];
  examples: { input: string; output: string; explanation?: string }[];
  recurrence: string;
  baseCase: string;
  timeComplexity?: string | null;
  spaceComplexity?: string | null;
  keyInsight?: string | null;
  codes: Partial<Record<"bruteforce" | "memoization" | "tabulation" | "spaceOptimized", Partial<Record<Lang, CodeSnippetDTO>>>> | null;
  inputDescriptor: {
    key: string;
    label: string;
    kind: "number" | "array" | "grid" | "stringPair";
    min?: number;
    max?: number;
    valueRange?: [number, number];
  }[] | null;
  defaultInput?: unknown;
}

export interface ProblemSummary {
  slug: string;
  title: string;
  patternSlug: string;
  difficulty: "Easy" | "Medium" | "Hard";
  dimensions: 1 | 2 | 3;
  implemented: boolean;
}

export interface PatternInfo {
  slug: string;
  name: string;
  order: number;
  description: string;
  problemCount: number;
  implementedCount: number;
}
