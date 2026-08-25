import type { Request, Response } from "express";
import { allPatterns, allProblems } from "../services/catalog.service";
import { patternView } from "../views/pattern.view";

/** GET /api/patterns — patterns with live problem counts. */
export async function list(_req: Request, res: Response): Promise<void> {
  const [patterns, problems] = await Promise.all([allPatterns(), allProblems()]);
  const counts = new Map<string, { total: number; implemented: number }>();
  for (const prob of problems) {
    const c = counts.get(prob.patternSlug) ?? { total: 0, implemented: 0 };
    c.total++;
    if (prob.implemented) c.implemented++;
    counts.set(prob.patternSlug, c);
  }
  res.json(patterns.map((pat) => patternView(pat, counts.get(pat.slug) ?? { total: 0, implemented: 0 })));
}
