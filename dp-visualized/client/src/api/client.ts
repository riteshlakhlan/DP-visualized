import type { ProblemSummary, TraceResponse, DPMode } from "../types";

const BASE = import.meta.env.VITE_API_URL ?? "";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE}${url}`);
  if (!res.ok) throw new Error((await safeError(res)) || `Request failed (${res.status})`);
  return res.json();
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await safeError(res)) || `Request failed (${res.status})`);
  return res.json();
}

async function safeError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j?.error ?? "";
  } catch {
    return "";
  }
}

/* ---------------- queries ---------------- */

export const api = {
  patterns: () => get<import("../types").PatternInfo[]>("/api/patterns"),
  problems: (pattern?: string) =>
    get<ProblemSummary[]>(`/api/problems${pattern ? `?pattern=${encodeURIComponent(pattern)}` : ""}`),
  problem: (slug: string) => get<import("../types").ProblemDetail>(`/api/problems/${slug}`),
  trace: (slug: string, input: unknown, mode: DPMode) =>
    post<TraceResponse>(`/api/problems/${slug}/trace`, { input, mode }),
};
