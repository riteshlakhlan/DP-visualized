import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Table2, AlertTriangle } from "lucide-react";
import { api } from "../api/client";
import { usePlayback } from "../stores/playback";
import { replay } from "../lib/replay";
import { TopBar } from "../components/tableview/TopBar";
import { LegendRow, DPTable } from "../components/tableview/DPTable";
import { ItemsRow } from "../components/tableview/InputEditors";
import type { InputFieldDescriptorDTO } from "../components/tableview/InputEditors.types";
import { Sidebar } from "../components/tableview/Sidebar";
import { CurrentStepBox, StatsRow } from "../components/tableview/MobileBits";
import { CodePanel } from "../components/code/CodePanel";
import { markVisited } from "../lib/progress";
import type { DPMode } from "../types";

const Scene3D = lazy(() => import("../components/three/Scene3D"));

const MODES: DPMode[] = ["bruteforce", "memo", "tabulation", "spaceOptimized"];
const VARIANT_OF_MODE: Record<DPMode, string> = {
  bruteforce: "bruteforce",
  memo: "memoization",
  tabulation: "tabulation",
  spaceOptimized: "spaceOptimized",
};
const MODE_LABEL: Record<DPMode, string> = {
  bruteforce: "Brute Force",
  memo: "Memoization",
  tabulation: "Tabulation",
  spaceOptimized: "Space Optimized",
};

export function ProblemPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();

  const problemQ = useQuery({ queryKey: ["problem", slug], queryFn: () => api.problem(slug) });
  const problemsQ = useQuery({ queryKey: ["problems"], queryFn: () => api.problems() });
  const patternsQ = useQuery({ queryKey: ["patterns"], queryFn: api.patterns });

  // progress persistence (localStorage)
  useEffect(() => {
    if (slug) markVisited(slug);
  }, [slug]);

  const [mode, setMode] = useState<DPMode>("tabulation");
  const [view3d, setView3d] = useState(false);
  const [input, setInput] = useState<Record<string, unknown> | null>(null);

  // reset local state when problem changes
  useEffect(() => {
    setInput(null);
    setMode("tabulation");
    setView3d(false);
    clear();
  }, [slug]);

  useEffect(() => {
    if (problemQ.data?.defaultInput && input === null) {
      setInput({ ...(problemQ.data.defaultInput as Record<string, unknown>) });
    }
  }, [problemQ.data]);

  const availableModes = useMemo(() => {
    const codes = problemQ.data?.codes;
    if (!codes) return [];
    return MODES.filter((m) => codes[VARIANT_OF_MODE[m] as keyof typeof codes]);
  }, [problemQ.data]);

  useEffect(() => {
    if (availableModes.length && !availableModes.includes(mode)) setMode(availableModes[0]);
  }, [availableModes]);

  /* ------------------------- trace fetching ------------------------- */
  const traceQ = useQuery({
    queryKey: ["trace", slug, mode, JSON.stringify(input)],
    queryFn: () => api.trace(slug, input, mode),
    enabled: Boolean(input) && availableModes.includes(mode),
    staleTime: Infinity,
    retry: false,
  });

  const loadTrace = usePlayback((s) => s.loadTrace);
  const clear = usePlayback((s) => s.clear);
  useEffect(() => {
    if (traceQ.data) loadTrace(traceQ.data);
  }, [traceQ.data]);
  useEffect(() => clear, [clear]);

  const { steps, meta, index, playing, speed, play, pause, toggle, forward, back, reset, setIndex, setSpeed } =
    usePlayback();
  const currentStep = index >= 0 ? steps[index] ?? null : null;

  // playback ticker
  useEffect(() => {
    if (!playing) return;
    const msPerStep = 1000 / (5 * speed);
    const id = window.setInterval(() => usePlayback.getState().forward(), msPerStep);
    return () => window.clearInterval(id);
  }, [playing, speed]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.code === "ArrowRight") forward();
      else if (e.code === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, forward, back]);

  const replayState = useMemo(
    () => (traceQ.data ? replay(traceQ.data, index) : null),
    [traceQ.data, index],
  );

  /* ------------------------- input editors ------------------------- */
  const descriptors: InputFieldDescriptorDTO[] = problemQ.data?.inputDescriptor ?? [];
  function itemsInfo(): { label: string | null; value: number | null; max: number | null } {
    const first = descriptors[0];
    if (!first) return { label: null, value: null, max: null };
    if (first.kind === "number")
      return { label: first.label, value: Number(input?.[first.key]), max: first.max ?? 20 };
    const arrField = descriptors.find((d) => d.kind === "array");
    if (!arrField || !input) return { label: null, value: null, max: null };
    return {
      label: arrField.label,
      value: (input[arrField.key] as unknown[])?.length ?? null,
      max: arrField.max ?? 9,
    };
  }
  const items = itemsInfo();
  function onItemsChange(v: number) {
    if (!input) return;
    const next = { ...input };
    const numField = descriptors.find((d) => d.kind === "number");
    if (descriptors[0]?.kind === "number" && (!numField || descriptors.length === 1)) {
      next[descriptors[0].key] = v;
    } else {
      for (const d of descriptors.filter((x) => x.kind === "array")) {
        const arr = [...(next[d.key] as unknown[])];
        while (arr.length < v)
          arr.push(
            d.valueRange ? d.valueRange[0] : 1,
          );
        arr.length = Math.min(arr.length, v);
        next[d.key] = arr;
      }
    }
    setInput(next);
  }

  if (problemQ.isLoading) return <div className="p-10 text-sm text-slate-500">Loading problem…</div>;
  if (problemQ.isError || !problemQ.data)
    return <div className="p-10 text-sm text-rose-400">Problem not found.</div>;
  const problem = problemQ.data;

  if (!problem.implemented) return <ComingSoon title={problem.title} statement={problem.statement} />;

  return (
    <div className="flex h-full flex-col">
      <div className="grid flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* ------------------------------ left/main column ------------------------------ */}
        <main className="flex flex-col gap-4 overflow-y-auto p-5">
          <TopBar
            problem={problem}
            problems={problemsQ.data ?? []}
            onPickProblem={(s) => navigate(`/problem/${s}`)}
            itemsValue={items.value}
            itemsMax={items.max}
            itemsLabel={items.label}
            onItemsChange={onItemsChange}
            onReset={reset}
            onStep={forward}
            onPlay={toggle}
            playing={playing}
            speed={speed}
            onSpeedChange={setSpeed}
          />

          {/* derived-value line from the service */}
          {traceQ.data?.meta.derived && (
            <p className="rounded-md border border-known/25 bg-known/[0.07] px-3 py-2 font-mono text-xs text-known">
              {traceQ.data.meta.derived}
            </p>
          )}

          <LegendRow />

          {/* mode tabs + view toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-lg border border-line bg-raised p-0.5">
              {availableModes.map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-md px-3 py-1.5 font-mono text-xs transition-colors ${
                    m === mode ? "bg-accent/20 text-accent" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border border-line bg-raised p-0.5">
              <button
                onClick={() => setView3d(false)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs ${
                  !view3d ? "bg-accent/20 text-accent" : "text-slate-400 hover:text-white"
                }`}
              >
                <Table2 size={13} /> Table
              </button>
              <button
                onClick={() => setView3d(true)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs ${
                  view3d ? "bg-accent/20 text-accent" : "text-slate-400 hover:text-white"
                }`}
              >
                <Boxes size={13} /> 3D View
              </button>
            </div>
          </div>

          <ItemsRow descriptors={descriptors} input={input ?? {}} onChange={setInput} />

          {/* trace status banner */}
          {traceQ.isFetching && (
            <div className="rounded-md border border-line bg-raised px-3 py-2 font-mono text-xs text-slate-400">
              computing trace…
            </div>
          )}
          {traceQ.isError && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {(traceQ.error as Error).message}
            </div>
          )}

          {/* visualization surface */}
          <div className="min-h-[300px]">
            {!replayState || !traceQ.data ? (
              <Placeholder />
            ) : view3d ? (
              <div className="h-[58vh] min-h-[360px] animate-[fadeIn_.35s_ease]">
                <Suspense fallback={<Placeholder label="loading 3D engine…" />}>
                  <Scene3D trace={traceQ.data} replayState={replayState} currentStep={currentStep} />
                </Suspense>
              </div>
            ) : !traceQ.data.meta.tableShape || !traceQ.data.meta.axisLabels ? (
              /* Brute Force / tree modes have no tabular dp grid — show call-stack narration */
              <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-accent/30 bg-accent/[0.04] px-8 py-12 text-center">
                <svg className="h-10 w-10 text-accent/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                </svg>
                <p className="max-w-md text-sm leading-relaxed text-slate-400">
                  <span className="font-semibold text-white">{MODE_LABEL[mode]}</span> traces the
                  {" "}<span className="text-accent">recursion call stack</span> step by step.
                  There is no tabulation grid for this mode.
                </p>
                <p className="text-xs text-slate-500">
                  Watch the <span className="text-accent">CURRENT STEP</span> panel on the right and the{" "}
                  <span className="text-accent">COMPUTATION LOG</span> below it as the algorithm runs,
                  or switch to <button className="text-sky-400 underline underline-offset-2 hover:text-sky-300" onClick={() => { const next = availableModes.find((m) => m !== mode); if (next) setMode(next); }}>a table mode</button>.
                </p>
                {/* show mini call log inline */}
                {steps.length > 0 && (
                  <div className="mt-2 w-full max-w-lg overflow-y-auto rounded-md border border-line bg-panel p-3 text-left font-mono text-[11px] leading-relaxed text-slate-300"
                    style={{ maxHeight: "200px" }}
                  >
                    {steps.slice(Math.max(0, index - 5), index + 1).map((s, i, arr) => (
                      <div key={s.stepIndex} className={`${i === arr.length - 1 ? "text-accent font-semibold" : "text-slate-500"}`}>
                        <span className="mr-2 text-slate-600">{s.stepIndex + 1}</span>
                        {s.explanation}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <DPTable trace={traceQ.data} replayState={replayState} />
            )}
          </div>

          {/* scrubber timeline */}
          <div className="flex items-center gap-3 pb-2">
            <span className="panel-label shrink-0">Timeline</span>
            <input
              type="range"
              min={-1}
              max={Math.max(steps.length - 1, 0)}
              value={index}
              onChange={(e) => setIndex(Number(e.target.value))}
              disabled={!steps.length}
              aria-label="Scrub through computation"
            />
            <span className="w-24 shrink-0 text-right font-mono text-[11px] text-slate-400">
              {index + 1} / {steps.length}
            </span>
          </div>
        </main>

        {/* ------------------------------ right sidebar ------------------------------ */}
        <div className="hidden xl:block">
          <Sidebar problem={problem} mode={mode} trace={traceQ.data ?? null} replayState={replayState} currentStep={currentStep} />
        </div>
      </div>

      {/* mobile sidebar fallback */}
      <div className="border-t border-line bg-panel p-4 xl:hidden">
        <CurrentStepBox step={currentStep} />
        <StatsRow index={index} total={steps.length} />
        <div className="mt-4 h-72">
          <CodePanel codes={problem.codes} variant={VARIANT_OF_MODE[mode]} currentStep={currentStep} />
        </div>
      </div>

      {/* bottom status bar — full width */}
      <footer className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line bg-panel px-5 py-2 font-mono text-[11px] text-slate-400">
        <span>
          <span className="text-slate-600">Recurrence:</span> <span className="text-accent">{problem.recurrence}</span>
        </span>
        <span>
          <span className="text-slate-600">Base:</span> {problem.baseCase}
        </span>
        <span className="ml-auto hidden md:inline text-slate-600">
          space · play/pause · ← step
        </span>
      </footer>
    </div>
  );
}

function Placeholder({ label = "Choose an input and press Play to watch the algorithm run." }: { label?: string }) {
  return (
    <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-line text-xs text-slate-500">
      {label}
    </div>
  );
}

function ComingSoon({ title, statement }: { title: string; statement: string }) {
  return (
    <div className="mx-auto max-w-xl p-10">
      <h1 className="mb-2 text-xl font-semibold text-white">{title}</h1>
      <p className="mb-4 text-sm leading-relaxed">{statement}</p>
      <div className="rounded-lg border border-dashed border-line p-4 text-xs text-slate-500">
        3D walkthrough coming soon — this problem is seeded but its trace engine isn't wired yet.
        Try one of the implemented problems in the dropdown.
      </div>
    </div>
  );
}
