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
 * Wired to `GET /events`'s query-string validation (FCP-03,
 * `routes/events.ts`) — see this function's own body for why replacing
 * `req.query` specifically needs `Object.defineProperty` rather than a
 * plain assignment under Express 5.
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
    // Express 5 defines `req.query` as a getter-only accessor (lazily
    // computed from the parsed URL, no setter), so a plain
    // `req.query = result.data` throws:
    // "TypeError: Cannot set property query of #<IncomingMessage> which
    // has only a getter". `req.body`/`req.params` are still ordinary
    // writable own properties in Express 5, but redefining all three via
    // `Object.defineProperty` keeps this middleware's behavior uniform
    // rather than depending on that per-property, per-Express-version
    // distinction holding forever. Express itself defines `query` as
    // `configurable: true` specifically so it can be overridden this way.
    Object.defineProperty(req, part, {
      value: result.data,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    next();
  };
}
