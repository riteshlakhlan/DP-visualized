/**
 * A code snippet as authored next to the service that generates its trace.
 * `anchors` maps semantic step anchors ("pick", "skip", "base", ...) to
 * 1-based line numbers inside `code`, so line highlighting can never drift:
 * both are authored together and the client resolves anchor -> line for the
 * currently selected language.
 */
export interface CodeSnippet {
  code: string;
  anchors: Record<string, number>;
}

export type Lang = "cpp" | "java" | "python" | "js";

export function snippet(code: string): Omit<CodeSnippet, "anchors"> {
  return { code };
}

/** Helper: compute anchor lines by finding marker comments in the source. */
export function withAnchors(code: string, markers: Record<string, string>): CodeSnippet {
  const lines = code.split("\n");
  const anchors: Record<string, number> = {};
  for (const [key, needle] of Object.entries(markers)) {
    const idx = lines.findIndex((l) => l.includes(needle));
    if (idx >= 0) anchors[key] = idx + 1;
  }
  return { code, anchors };
}
