/**
 * Core domain types for the DP trace engine.
 *
 * These live in the service layer (pure TS, no Express/Mongoose imports)
 * so the same code that generates a visualizer trace is also what unit
 * tests assert against.
 */

export type DPMode = "bruteforce" | "memo" | "tabulation" | "spaceOptimized";

export type CodeVariant = "bruteforce" | "memoization" | "tabulation" | "spaceOptimized";

export const MODE_TO_VARIANT: Record<DPMode, CodeVariant> = {
  bruteforce: "bruteforce",
  memo: "memoization",
  tabulation: "tabulation",
  spaceOptimized: "spaceOptimized",
};

export type DPStepType =
  | "recurse-call"
  | "recurse-return"
  | "memo-hit"
  | "table-write"
  | "table-read"
  | "base-case";

/** One atomic event in the life of an algorithm run. */
export interface DPStep {
  stepIndex: number;
  type: DPStepType;
  /** The DP state this step concerns, e.g. [i] or [index, target]. */
  coordinates: number[];
  value?: number | boolean;
  /**
   * Cells/states this step READ (dependencies to highlight in every view).
   * For recursion trees prefer callId/parentCallId for edges.
   */
  deps?: number[][];
  /** Recursion-tree edge bookkeeping (bruteforce/memo modes). */
  callId?: number;
  parentCallId?: number;
  /** True when this call revisits a state already solved elsewhere -> "duplicate subtree". */
  dup?: boolean;
  /** Semantic anchor into the code snippet, resolved per-language via `anchors`. */
  codeAnchor?: string;
  explanation: string;
}

export interface TableShape {
  rows: number;
  cols: number;
}

export interface AxisLabels {
  rowsTitle: string;
  colsTitle: string;
  /** Explicit labels; when omitted the client renders 0..n-1 numbers. */
  rowLabels?: string[];
  colLabels?: string[];
}

export type ValueFormat = "bool" | "int";

export type InputKind = "number" | "array" | "grid" | "stringPair";

export interface InputFieldDescriptor {
  key: string;
  label: string;
  kind: InputKind;
  min?: number;
  max?: number;
  /** Optional separate range for the column slider of grid inputs. */
  colsRange?: [number, number];
  valueRange?: [number, number];
  /** stringPair only: character-class body overriding the default `[a-z]` sanitizer (e.g. "[a-z*?]"). */
  allow?: string;
}

export interface TraceMeta {
  mode: DPMode;
  answer: number | boolean | null;
  answerLabel: string;
  /** Plain-English derivation line (e.g. "target = sum / 2 = 24 / 2 = 12"). */
  derived?: string;
  tableShape: TableShape | null;
  axisLabels: AxisLabels | null;
  valueFormat: ValueFormat;
  rollingWindow?: boolean;
  stats: {
    steps: number;
    calls?: number;
    memoHits?: number;
    writes?: number;
  };
}

export interface GeneratedTrace {
  steps: DPStep[];
  meta: TraceMeta;
}

/* ------------------------------------------------------------------ */
/* Problem service contract                                            */
/* ------------------------------------------------------------------ */

import type { ZodType } from "zod";
import type { CodeSnippet } from "../data/code.types";

export interface ProblemServiceDef {
  slug: string;
  patternSlug: string;
  inputDescriptor: InputFieldDescriptor[];
  schema: ZodType<any>;
  defaultInput: unknown;
  randomInput: () => unknown;
  /** Hard caps per mode so traces stay renderable (< ~2k steps). */
  limitsPerMode: Record<DPMode, (mode: DPMode, input: any) => string | null>;
  buildTrace: (input: any, mode: DPMode) => GeneratedTrace;
  codes: Partial<Record<CodeVariant, Record<string, CodeSnippet>>>;
}

export function key(c: number[]): string {
  return c.join(",");
}
