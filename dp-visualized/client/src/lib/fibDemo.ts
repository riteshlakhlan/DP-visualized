import type { TraceResponse } from "../types";

/**
 * Self-contained fib recursion trace used ONLY for the landing-page hero.
 * It feeds the exact same Scene3D/TreeView renderer as real problems.
 */
export function fibDemoTrace(n = 8): TraceResponse {
  const steps: TraceResponse["steps"] = [];
  let callId = 0;
  let seen = new Set<number>();

  function emit(type: TraceResponse["steps"][number]["type"], coords: number[], extra: Partial<TraceResponse["steps"][number]>, explanation: string) {
    steps.push({ stepIndex: steps.length, type, coordinates: coords, explanation, ...extra });
  }

  function fib(k: number, parent?: number): number {
    const id = callId++;
    if (k <= 1) {
      emit("recurse-call", [k], { callId: id, parentCallId: parent }, `fib(${k}) base case`);
      return 1;
    }
    const dup = seen.has(k);
    emit("recurse-call", [k], { callId: id, parentCallId: parent, dup: dup || undefined },
      dup ? `fib(${k}) repeats` : `fib(${k}) splits into fib(${k - 1}) + fib(${k - 2})`);
    seen.add(k);
    const a = fib(k - 1, id);
    const b = fib(k - 2, id);
    emit("recurse-return", [k], { callId: id, parentCallId: parent, value: a + b }, `fib(${k}) = ${a + b}`);
    return a + b;
  }

  fib(n);

  return {
    slug: "demo",
    meta: {
      mode: "bruteforce",
      answer: null,
      answerLabel: "",
      tableShape: null,
      axisLabels: null,
      valueFormat: "int",
      stats: { steps: steps.length },
    },
    steps,
  };
}
