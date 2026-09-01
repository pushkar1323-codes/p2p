import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.ts";

/**
 * Express 404 handler for routes that don't match anything. Mounted
 * after all real routes, before `errorHandler`.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(AppError.notFound(`No route matches ${req.method} ${req.path}.`));
}

/**
 * Centralized error-handling middleware (Express identifies this as an
 * error handler by its four-argument signature).
 *
 * - `AppError`s are trusted: their `statusCode`, `code`, `message`, and
 *   `details` are exactly what should reach the client.
 * - Anything else (a bug, an unexpected exception from a library) is
 *   treated as an unexpected failure: logged in full server-side, but
 *   the client only ever sees a generic 500 message. Raw error text,
 *   stack traces, or internal details are never sent in a response —
 *   the same rule the frontend follows for wallet/network errors.
 *
 * Must be the last middleware registered on the app.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Unexpected error: log the real thing for operators, expose nothing
  // to the caller beyond a safe, generic message.
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
    },
  });
}
