/** Progress persistence in localStorage (v1; DB-backed sync is a roadmap item). */
const KEY = "dpviz.progress";

function read(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function markVisited(slug: string): void {
  const p = read();
  p[slug] = Date.now();
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function visitedSlugs(): string[] {
  return Object.keys(read());
}
