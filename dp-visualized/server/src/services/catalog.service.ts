import type { ProblemSeed } from "../data/catalog";
import { problems as seedProblems, patterns as seedPatterns, implementedSlugs } from "../data/catalog";
import { Problem } from "../models/Problem";
import { Pattern } from "../models/Pattern";
import { isDbConnected } from "../config/db";
import { COMPLEXITY } from "../data/complexity";

/**
 * Business-logic data access for the catalog. Reads MongoDB when connected,
 * falls back to the in-code seed otherwise — controllers stay identical.
 */

export interface CatalogProblem extends ProblemSeed {
  implemented: boolean;
}

export async function allProblems(): Promise<CatalogProblem[]> {
  if (!isDbConnected()) {
    return seedProblems.map((p) => ({
    ...p,
    implemented: implementedSlugs.has(p.slug),
    timeComplexity: COMPLEXITY[p.slug]?.time ?? null,
    spaceComplexity: COMPLEXITY[p.slug]?.space ?? null,
    keyInsight: COMPLEXITY[p.slug]?.insight ?? null,
  }));
  }
  const docs = await Problem.find().sort({ patternSlug: 1, title: 1 }).lean();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return docs.map((d: any) => ({
    slug: d.slug,
    patternSlug: d.patternSlug,
    title: d.title,
    difficulty: d.difficulty,
    striverLink: d.striverLink ?? "",
    statement: d.statement ?? "",
    constraints: d.constraints ?? [],
    examples: (d.examples ?? []).map((e: any) => ({
      input: e?.input ?? "",
      output: e?.output ?? "",
      ...(e?.explanation ? { explanation: e.explanation } : {}),
    })),
    dimensions: (d.dimensions ?? 2) as 1 | 2 | 3,
    recurrence: d.recurrence ?? "",
    baseCase: d.baseCase ?? "",
    implemented: Boolean(d.implemented),
    timeComplexity: COMPLEXITY[d.slug]?.time ?? null,
    spaceComplexity: COMPLEXITY[d.slug]?.space ?? null,
    keyInsight: COMPLEXITY[d.slug]?.insight ?? null,
  }));
}

export async function allPatterns(): Promise<(typeof seedPatterns)[number][]> {
  if (!isDbConnected()) return [...seedPatterns].sort((a, b) => a.order - b.order);
  const docs = await Pattern.find().sort({ order: 1 }).lean();
  if (docs.length === 0) return [...seedPatterns].sort((a, b) => a.order - b.order);
  return docs.map((d) => ({ slug: d.slug, name: d.name, order: d.order, description: d.description }));
}
