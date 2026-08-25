import { useEffect, useRef, useState } from "react";
import { highlightLines, LANG_LABEL } from "./highlight";
import type { CodeSnippetDTO, DPStep, Lang } from "../../types";

const LANGS: Lang[] = ["cpp", "java", "python", "js"];

export function CodePanel({
  codes,
  variant,
  currentStep,
}: {
  codes: Partial<Record<string, Partial<Record<Lang, CodeSnippetDTO>>>> | null;
  variant: string;
  currentStep: DPStep | null;
}) {
  const variantCodes = codes?.[variant];
  const available = LANGS.filter((l) => variantCodes?.[l]);
  const [lang, setLang] = useState<Lang>(available[0] ?? "cpp");

  useEffect(() => {
    if (available.length && !available.includes(lang)) setLang(available[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  const snippet = variantCodes?.[lang];
  const { lines, activeLine } = highlightLines(snippet, lang, currentStep?.codeAnchor);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeLine && scroller.current) {
      const el = scroller.current.querySelector<HTMLElement>(`[data-line="${activeLine}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [activeLine]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center gap-1">
        {LANGS.map((l) => {
          const has = Boolean(variantCodes?.[l]);
          return (
            <button
              key={l}
              disabled={!has}
              onClick={() => setLang(l)}
              className={`rounded px-2 py-1 font-mono text-[10px] transition-colors ${
                l === lang ? "bg-accent/20 text-accent" : has ? "text-slate-400 hover:text-white" : "text-slate-600"
              }`}
            >
              {LANG_LABEL[l]}
            </button>
          );
        })}
        <span className="ml-auto panel-label">{labelFor(variant)}</span>
      </div>
      <div ref={scroller} className="min-h-[140px] flex-1 overflow-auto rounded-md border border-line bg-[#0a0c11] p-2">
        {!snippet ? (
          <p className="p-3 text-xs text-slate-500">No {variant} code for this problem.</p>
        ) : (
          <pre className="m-0 font-mono text-xs leading-relaxed">
            {lines.map((html, i) => {
              const n = i + 1;
              return (
                <div
                  key={i}
                  data-line={n}
                  className={`flex gap-3 rounded-sm px-1 ${n === activeLine ? "code-line-active" : ""}`}
                >
                  <span className="w-4 shrink-0 select-none text-right text-[10px] leading-relaxed text-slate-600">{n}</span>
                  <code
                    className={lang === "python" ? "language-python" : ""}
                    dangerouslySetInnerHTML={{ __html: html || " " }}
                  />
                </div>
              );
            })}
          </pre>
        )}
      </div>
    </div>
  );
}

function labelFor(variant: string): string {
  return (
    { bruteforce: "BRUTE", memoization: "MEMO", tabulation: "TABULATION", spaceOptimized: "SPACE OPT." }[variant] ??
    variant.toUpperCase()
  );
}
