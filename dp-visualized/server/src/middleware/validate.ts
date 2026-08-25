import type { Request, RequestHandler, Response } from "express";
import type { ZodTypeAny } from "zod";

type Source = "body" | "params" | "query";

/** Validate a request slice with Zod before any controller logic runs.
 *  ZodErrors are forwarded and mapped to 400 by the central error handler. */
export function validate(schema: ZodTypeAny, source: Source = "body"): RequestHandler {
  return (req: Request, _res: Response, next) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any)[source] = schema.parse(req[source]);
      next();
    } catch (err) {
      next(err);
    }
  };
}
