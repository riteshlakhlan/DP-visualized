import type { CodeSnippetDTO, Lang } from "../../types";

/**
 * Minimal syntax highlighter for C++/Java/Python/JS snippets.
 * Deliberately dependency-free: prismjs language components assume a shared
 * global `Prism` which breaks under bundler/vitest module isolation.
 * Handles exactly what our short snippets need: comments, strings,
 * numbers, keywords, class-ish identifiers and calls.
 */

const KEYWORDS: Record<Lang, Set<string>> = {
  cpp: new Set(["int", "bool", "void", "char", "long", "double", "float", "return", "if", "else", "for", "while", "true", "false", "const", "auto", "vector", "string", "max", "min", "INT_MAX", "INT_MIN", "std", "include", "using", "namespace", "class", "struct", "public", "static", "NULL", "nullptr", "swap", "move"]),
  java: new Set(["int", "boolean", "void", "char", "long", "double", "float", "return", "if", "else", "for", "while", "true", "false", "final", "static", "class", "new", "String", "Math", "Arrays", "Integer", "public", "private", "import", "package", "null", "this", "extends"]),
  python: new Set(["def", "return", "if", "elif", "else", "for", "in", "range", "while", "True", "False", "None", "and", "or", "not", "len", "min", "max", "sum", "abs", "float", "int", "str", "list", "math", "inf", "class", "import", "from", "lambda", "sorted", "enumerate"]),
  js: new Set(["function", "return", "if", "else", "for", "of", "in", "while", "let", "const", "var", "new", "true", "false", "null", "undefined", "Infinity", "typeof", "Array", "Math", "Number", "String", "=>"]),
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlight(code: string, lang: Lang): string {
  const kw = KEYWORDS[lang];
  const pattern =
    /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;

  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(code)) !== null) {
    out += esc(code.slice(last, m.index));
    last = m.index + m[0].length;
    const [full, comment, str, num, ident] = m;
    if (comment) out += `<span class="token comment">${esc(full)}</span>`;
    else if (str) out += `<span class="token string">${esc(full)}</span>`;
    else if (num) out += `<span class="token number">${esc(full)}</span>`;
    else if (ident) {
      const nextChar = code.slice(last).match(/^\s*([\s\S])/)?.[1];
      if (kw.has(ident)) out += `<span class="token keyword">${esc(full)}</span>`;
      else if (nextChar === "(") out += `<span class="token function">${esc(full)}</span>`;
      else if (/^[A-Z]/.test(ident)) out += `<span class="token class-name">${esc(full)}</span>`;
      else out += esc(full);
    } else out += esc(full);
  }
  out += esc(code.slice(last));
  return out;
}

/** Highlight + split into lines; resolve the step's semantic anchor -> line number. */
export function highlightLines(
  snippet: CodeSnippetDTO | undefined,
  lang: Lang,
  activeAnchor: string | undefined,
): { lines: string[]; activeLine: number | null } {
  if (!snippet) return { lines: [], activeLine: null };
  const lines = highlight(snippet.code, lang).split("\n");
  const anchorLine = activeAnchor ? snippet.anchors[activeAnchor] : undefined;
  return { lines, activeLine: anchorLine ?? null };
}

export const LANG_LABEL: Record<Lang, string> = {
  cpp: "C++",
  java: "Java",
  python: "Python",
  js: "JS",
};
