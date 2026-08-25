import { useMemo, Suspense, lazy } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { api } from "../api/client";
import { fibDemoTrace } from "../lib/fibDemo";
import { replay } from "../lib/replay";
import { visitedSlugs } from "../lib/progress";

const Scene3D = lazy(() => import("../components/three/Scene3D"));

export function HomePage() {
  const patternsQ = useQuery({ queryKey: ["patterns"], queryFn: api.patterns });

  const demo = useMemo(() => {
    const trace = fibDemoTrace(8);
    const state = replay(trace, trace.steps.length - 1);
    return { trace, state };
  }, []);

  const visited = visitedSlugs();

  return (
    <div className="h-full overflow-y-auto">
      {/* hero */}
      <section className="relative mx-auto grid min-h-[62vh] max-w-7xl grid-cols-1 items-center gap-8 px-6 py-10 lg:grid-cols-2">
        <div>
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-accent">
            Striver A2Z Sheet · DP module
          </p>
          <h1 className="font-sans text-4xl font-bold leading-tight text-white lg:text-5xl">
            Watch dynamic programming
            <br />
            <span className="text-accent">build itself</span> in 3D.
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-relaxed text-body">
            Every recursion tree, memo table, tabulation grid and space-optimized array —
            animated step by step, scrubbable like a video timeline, synced to real source code.
            No more squinting at static tables.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to="/problem/partition-equal-subset-sum"
              className="btn btn-primary px-5 py-2.5 text-[13px]"
            >
              Start with Partition Equal Subset Sum <ArrowRight size={14} />
            </Link>
            <Link to="/patterns" className="btn px-5 py-2.5 text-[13px]">
              Browse all patterns
            </Link>
          </div>
          {visited.length > 0 && (
            <p className="mt-6 font-mono text-[11px] text-slate-500">
              progress: {visited.length} problem{visited.length === 1 ? "" : "s"} explored (stored locally)
            </p>
          )}
        </div>

        {/* hero 3D: fib recursion tree with duplicate subtrees in red */}
        <div className="h-[46vh] min-h-[320px] overflow-hidden rounded-xl border border-line shadow-[0_0_60px_rgba(129,140,248,0.07)]">
          <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-slate-600">loading 3D…</div>}>
            <Scene3D trace={demo.trace} replayState={demo.state} currentStep={demo.trace.steps[demo.trace.steps.length - 1]} />
          </Suspense>
        </div>
      </section>

      {/* pattern grid */}
      <section className="mx-auto max-w-7xl px-6 pb-16">
        <h2 className="mb-1 font-sans text-xl font-semibold text-white">The DP module, pattern by pattern</h2>
        <p className="mb-6 text-sm text-slate-500">Every group from the A2Z sheet gets its own visualization archetype.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(patternsQ.data ?? []).map((pat) => (
            <Link
              key={pat.slug}
              to={`/patterns/${pat.slug}`}
              className="group rounded-lg border border-line bg-panel p-4 transition-colors hover:border-accent/50"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white group-hover:text-accent">{pat.name}</h3>
                <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-slate-400">
                  {pat.implementedCount}/{pat.problemCount}
                </span>
              </div>
              <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">{pat.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
