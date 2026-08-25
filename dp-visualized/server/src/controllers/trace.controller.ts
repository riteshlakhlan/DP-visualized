import { createHash } from "crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../middleware/error";
import { getService, supportsMode } from "../services/registry";
import { MODE_TO_VARIANT } from "../services/types";
import type { DPMode } from "../services/types";
import { isDbConnected } from "../config/db";
import { TraceCache } from "../models/TraceCache";
import { traceView } from "../views/trace.view";

const BodySchema = z.object({
  input: z.record(z.unknown()),
  mode: z.enum(["bruteforce", "memo", "tabulation", "spaceOptimized"]),
});

function inputHash(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32);
}

/** POST /api/problems/:slug/trace — the single endpoint both renderers consume. */
export async function generate(req: Request, res: Response): Promise<void> {
  const { slug } = req.params as { slug: string };
  // safeParse (not parse) — a thrown ZodError inside an async handler would
  // bypass Express 4's error pipeline entirely.
  const bodyParsed = BodySchema.safeParse(req.body);
  if (!bodyParsed.success) {
    throw new AppError(`Malformed trace request: ${bodyParsed.error.issues[0]?.message ?? "invalid body"}`, 400);
  }
  const body = bodyParsed.data;
  const mode = body.mode as DPMode;

  const def = getService(slug);
  if (!def) throw new AppError(`No trace engine implemented for "${slug}" yet`, 404);
  if (!supportsMode(slug, mode))
    throw new AppError(`"${slug}" has no ${mode} variant (try another mode tab).`, 400);

  // Per-problem schema + per-mode size caps.
  const inputParsed = def.schema.safeParse(body.input);
  if (!inputParsed.success) {
    const issue = inputParsed.error.issues[0];
    const path = issue?.path?.length ? issue.path.join(".") : "input";
    throw new AppError(`${path}: ${issue?.message ?? "Invalid input"}`, 422);
  }
  const input = inputParsed.data;
  const limitError = def.limitsPerMode[mode](mode, input);
  if (limitError) throw new AppError(limitError, 422);

  // Cache only when a DB is available; traces are pure functions of (slug, input, mode).
  const hash = inputHash({ input, mode });
  if (isDbConnected()) {
    const cached = await TraceCache.findOne({ slug, hash }).lean();
    if (cached) {
      res.json(cached.payload);
      return;
    }
  }

  const generated = def.buildTrace(input, mode);
  const payload = traceView(slug, generated, def.codes[MODE_TO_VARIANT[mode]] ?? undefined);

  if (isDbConnected()) {
    try {
      await TraceCache.create({ slug, hash, payload });
    } catch {
      /* cache write failures are non-fatal */
    }
  }

  res.json(payload);
}
