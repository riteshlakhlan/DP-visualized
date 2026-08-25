/** Response serializers (the "views" of this JSON-only API). */

export interface PatternCounts {
  total: number;
  implemented: number;
}

export function patternView(pat: { slug: string; name: string; order: number; description: string }, counts: PatternCounts) {
  return {
    slug: pat.slug,
    name: pat.name,
    order: pat.order,
    description: pat.description,
    problemCount: counts.total,
    implementedCount: counts.implemented,
  };
}

type ProblemLike = {
  slug: string;
  patternSlug: string;
  title: string;
  difficulty: string;
  dimensions: number;
  implemented: boolean;
};

export function problemSummaryView(p: ProblemLike) {
  return {
    slug: p.slug,
    title: p.title,
    patternSlug: p.patternSlug,
    difficulty: p.difficulty,
    dimensions: p.dimensions,
    implemented: p.implemented,
  };
}

export function problemDetailView(
  p: ProblemLike & {
    striverLink: string;
    statement: string;
    constraints: string[];
    examples: { input: string; output: string; explanation?: string }[];
    recurrence: string;
    baseCase: string;
    timeComplexity?: string;
    spaceComplexity?: string;
    keyInsight?: string;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  codes?: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  def?: { inputDescriptor?: any; defaultInput?: any },
) {
  return {
    ...problemSummaryView(p),
    striverLink: p.striverLink,
    statement: p.statement,
    constraints: p.constraints,
    examples: p.examples,
    recurrence: p.recurrence,
    baseCase: p.baseCase,
    timeComplexity: (p as any).timeComplexity ?? null,
    spaceComplexity: (p as any).spaceComplexity ?? null,
    keyInsight: (p as any).keyInsight ?? null,
    codes: codes ?? null,
    /** Editor hints so the client renders inputs without hardcoding per problem. */
    inputDescriptor: def?.inputDescriptor ?? null,
    defaultInput: def?.defaultInput ?? null,
  };
}
