import type { GeneratedTrace } from "../services/types";

/** Serialize a generated trace into the exact DTO both renderers consume. */
export function traceView(
  slug: string,
  generated: GeneratedTrace,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  codesForVariant?: Record<string, any>,
) {
  const { steps, meta } = generated;
  return {
    slug,
    meta,
    steps,
    /** Convenience for the client's line-highlighter: max lines per language. */
    codeLines: codesForVariant
      ? Object.fromEntries(Object.entries(codesForVariant).map(([lang, s]) => [lang, s.code.split("\n").length]))
      : null,
  };
}
