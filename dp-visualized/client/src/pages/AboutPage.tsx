import { Link } from "react-router-dom";

export function AboutPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-12 leading-relaxed">
        <h1 className="mb-6 font-sans text-2xl font-semibold text-white">About DP·Visualized</h1>

        <div className="space-y-4 text-sm text-body">
          <p>
            <strong className="text-white">DP Visualized</strong> is a fan-made, non-commercial study companion for the{" "}
            <a
              className="text-accent hover:underline"
              href="https://takeuforward.org/strivers-a2z-dsa-course/strivers-a2z-dsa-sheet/"
              target="_blank"
              rel="noreferrer"
            >
              A2Z DSA Sheet
            </a>{" "}
            curated by <strong className="text-white">Striver (takeuforward.org)</strong>. All credit for the problem
            selection, ordering and pedagogy of the sheet belongs to Striver. This tool only adds an interactive layer:
            watching each algorithm's state space build itself.
          </p>
          <p>
            Every visualization is driven by a real implementation of the algorithm running on this project's own
            backend — the same code that renders the animation is unit-tested against reference solutions. If the
            animation shows a cell reading <code className="rounded bg-raised px-1 font-mono text-xs">dp[i-1][j]</code>,
            that's because the traced algorithm actually read it.
          </p>

          <h2 className="pt-4 font-sans text-lg font-semibold text-white">How it works</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>The server runs the chosen mode (brute force / memoization / tabulation / space-optimized) and records every event as a step.</li>
            <li>The frontend scrubs through that step trace like a video timeline — table view and 3D view consume the identical trace.</li>
            <li>Code panels highlight lines semantically anchored to each step, per language.</li>
            <li>Your exploration progress is stored in localStorage only. No accounts in v1.</li>
          </ul>

          <h2 className="pt-4 font-sans text-lg font-semibold text-white">Status</h2>
          <p>
            Ten flagship problems across five archetypes are fully wired (all four modes). The remaining sheet entries
            are seeded with statements and marked <em>viz soon</em>. See the README for the architecture and roadmap.
          </p>

          <p className="pt-6">
            <Link to="/patterns" className="btn btn-primary">Pick a pattern →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
