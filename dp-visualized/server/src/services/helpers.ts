import type { DPStep, DPStepType, CodeVariant } from "./types";
import { MODE_TO_VARIANT } from "./types";

/**
 * Mutable accumulator used by every problem's generator.
 * Keeps stepIndex consistent and centralizes common fields.
 */
export class TraceBuilder {
  readonly steps: DPStep[] = [];
  private nextCallId = 0;

  push(
    type: DPStepType,
    coordinates: number[],
    explanation: string,
    extra: Partial<Omit<DPStep, "stepIndex" | "type" | "coordinates" | "explanation">> = {},
  ): DPStep {
    const step: DPStep = {
      stepIndex: this.steps.length,
      type,
      coordinates,
      explanation,
      ...extra,
    };
    this.steps.push(step);
    return step;
  }

  allocCallId(): number {
    return this.nextCallId++;
  }

  get count(): number {
    return this.steps.length;
  }
}

/** Count aggregate stats off the finished trace. */
export function computeStats(steps: DPStep[]) {
  let calls = 0;
  let memoHits = 0;
  let writes = 0;
  for (const s of steps) {
    if (s.type === "recurse-call") calls++;
    else if (s.type === "memo-hit") memoHits++;
    else if (s.type === "table-write") writes++;
  }
  return { calls, memoHits, writes };
}

export function variantFor(mode: keyof typeof MODE_TO_VARIANT): CodeVariant {
  return MODE_TO_VARIANT[mode];
}
