import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../errors/AppError.ts";

/**
 * Which part of the request a schema validates.
 */
export type RequestPart = "body" | "query" | "params";

/**
 * Builds an Express middleware that validates `req[part]` against `schema`.
 * On success, `req[part]` is replaced with the parsed (and
 * type-coerced/defaulted) value. On failure, throws an `AppError` with a
 * 422 status and per-field details, which `errorHandler` turns into a
 * safe JSON response — the raw Zod error never reaches the client.
 *
 * Not wired to any route yet in this foundation task (no business
 * endpoints exist to validate). Covered by its own unit test instead
 * against a throwaway schema, so the mechanism is proven before a real
 * route depends on it.
 */
export function validate(part: RequestPart, schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      next(
        AppError.validationFailed(
          `Request ${part} failed validation.`,
          details,
        ),
      );
      return;
    }
    req[part] = result.data;
    next();
  };
}
