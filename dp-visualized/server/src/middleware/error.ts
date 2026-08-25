import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";
import { env } from "../config/env";

export class AppError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

/**
 * Express 4 does not catch rejected promises from async handlers — one bad
 * request would otherwise take the whole process down. Forward to next().
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "Route not found" });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const path = issue?.path?.join(".") ?? "";
    res.status(400).json({ error: `${path ? path + ": " : ""}${issue?.message ?? "Invalid input"}` });
    return;
  }
  console.error("[error]", err);
  if (!env.mongoUri) {
    res.status(500).json({ error: (err as Error)?.message ?? "Internal error" });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
}
