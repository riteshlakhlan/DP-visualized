import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function PatternsPage() {
  const patternsQ = useQuery({ queryKey: ["patterns"], queryFn: api.patterns });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-1 font-sans text-2xl font-semibold text-white">DP Patterns</h1>
        <p className="mb-8 text-sm text-slate-500">
          Groups follow Striver's A2Z sheet ordering. Counts show problems with live 3D walkthroughs.
        </p>
        <div className="space-y-3">
          {(patternsQ.data ?? []).map((pat) => (
            <Link
              key={pat.slug}
              to={`/patterns/${pat.slug}`}
              className="flex items-center gap-4 rounded-lg border border-line bg-panel p-4 transition-colors hover:border-accent/50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/10 font-mono text-sm text-accent">
                {pat.order}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white">{pat.name}</span>
                <span className="block truncate text-xs text-slate-500">{pat.description}</span>
              </span>
              <span className="shrink-0 rounded-full border border-line px-2.5 py-0.5 font-mono text-[11px] text-slate-400">
                {pat.implementedCount}/{pat.problemCount} live
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
