import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { api } from "../api/client";
import { visitedSlugs } from "../lib/progress";
import type { ProblemSummary } from "../types";

export function PatternDetailPage() {
  const { slug = "" } = useParams();
  const patternsQ = useQuery({ queryKey: ["patterns"], queryFn: api.patterns });
  const problemsQ = useQuery({ queryKey: ["problems", slug], queryFn: () => api.problems(slug) });

  const pat = patternsQ.data?.find((p) => p.slug === slug);
  const visited = new Set(visitedSlugs());

  const problems: ProblemSummary[] = problemsQ.data ?? [];
  problems.sort((a, b) => Number(b.implemented) - Number(a.implemented));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <Link to="/patterns" className="font-mono text-xs text-slate-500 hover:text-accent">← all patterns</Link>
        <h1 className="mt-3 mb-1 font-sans text-2xl font-semibold text-white">{pat?.name ?? slug}</h1>
        <p className="mb-8 text-sm text-slate-500">{pat?.description}</p>

        {problemsQ.isLoading && <p className="text-xs text-slate-500">loading…</p>}
        <div className="space-y-2">
          {problems.map((p) => (
            <div
              key={p.slug}
              className={`flex items-center gap-3 rounded-lg border p-3.5 ${
                p.implemented
                  ? "border-line bg-panel transition-colors hover:border-accent/50"
                  : "border-dashed border-line opacity-60"
              }`}
            >
              {visited.has(p.slug) ? (
                <CheckCircle2 size={15} className="shrink-0 text-known" />
              ) : (
                <span className="ml-[5px] mr-[6px] h-2 w-2 shrink-0 rounded-full border border-slate-600" />
              )}
              {p.implemented ? (
                <Link to={`/problem/${p.slug}`} className="min-w-0 flex-1 truncate text-sm text-white hover:text-accent">
                  {p.title}
                </Link>
              ) : (
                <span className="min-w-0 flex-1 cursor-not-allowed truncate text-sm text-slate-400">{p.title}</span>
              )}
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${
                  p.difficulty === "Easy"
                    ? "bg-known/10 text-known"
                    : p.difficulty === "Medium"
                      ? "bg-amber-500/10 text-amber-400"
                      : "bg-rose-500/10 text-rose-400"
                }`}
              >
                {p.difficulty}
              </span>
              {p.implemented ? (
                <Link to={`/problem/${p.slug}`} className="btn px-2.5 py-1 text-[10px]">
                  visualize →
                </Link>
              ) : (
                <span className="rounded-md border border-line px-2.5 py-1 font-mono text-[10px] text-slate-600">
                  viz soon
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
