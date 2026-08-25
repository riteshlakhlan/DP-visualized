import { Router } from "express";
import { list as patternList } from "../controllers/pattern.controller";
import { list as problemList, getBySlug } from "../controllers/problem.controller";
import { generate as traceGenerate } from "../controllers/trace.controller";
import { validate } from "../middleware/validate";
import { asyncHandler } from "../middleware/error";
import { z } from "zod";

export const api = Router();

api.get("/health", (_req, res) => res.json({ ok: true }));

api.get("/patterns", asyncHandler(patternList));

const slugParam = z.object({ slug: z.string().min(1).regex(/^[a-z0-9-]+$/) });
api.get("/problems", asyncHandler(problemList));
api.get("/problems/:slug", validate(slugParam, "params"), asyncHandler(getBySlug));

const traceBody = z.object({
  input: z.record(z.unknown()),
  mode: z.enum(["bruteforce", "memo", "tabulation", "spaceOptimized"]),
});
api.post(
  "/problems/:slug/trace",
  validate(slugParam, "params"),
  validate(traceBody, "body"),
  asyncHandler(traceGenerate),
);
