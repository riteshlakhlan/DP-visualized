import type { Request, Response } from "express";
import { AppError } from "../middleware/error";
import { allProblems } from "../services/catalog.service";
import { getService } from "../services/registry";
import { problemSummaryView, problemDetailView } from "../views/problem.view";

/** GET /api/problems?pattern=slug */
export async function list(req: Request, res: Response): Promise<void> {
  const pattern = typeof req.query.pattern === "string" ? req.query.pattern : undefined;
  const all = await allProblems();
  const filtered = pattern ? all.filter((p) => p.patternSlug === pattern) : all;
  res.json(filtered.map(problemSummaryView));
}

/** GET /api/problems/:slug — full doc + code snippets when implemented. */
export async function getBySlug(req: Request, res: Response): Promise<void> {
  const slug = req.params.slug as string;
  const all = await allProblems();
  const found = all.find((p) => p.slug === slug);
  if (!found) throw new AppError(`Unknown problem "${slug}"`, 404);
  const def = getService(slug);
  res.json(problemDetailView(found, def?.codes, def ? { inputDescriptor: def.inputDescriptor, defaultInput: def.defaultInput } : undefined));
}
