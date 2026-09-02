/**
 * A typed, safe-to-expose application error.
 *
 * Mirrors the frontend's `lib/errors` philosophy: errors that reach the
 * client should always be a small, deliberate `{ code, message }` shape —
 * never a raw stack trace or an internal exception's own `.message`.
 *
 * Route handlers and middleware should throw `AppError` for anything the
 * caller did wrong (bad input, not found, etc.). Anything else that
 * throws (a bug, a downstream failure) is treated as an unexpected 500
 * by the error-handling middleware in `middleware/errorHandler.ts`, which
 * logs the real error server-side but never forwards its details to the
 * client.
 */
export class AppError extends Error {
  /** HTTP status code to respond with. */
  public readonly statusCode: number;

  /** Stable, machine-readable error code (e.g. "VALIDATION_ERROR"). */
  public readonly code: string;

  /**
   * Optional extra detail safe to show the caller (e.g. per-field
   * validation issues). Must never contain internal/system information.
   */
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, "BAD_REQUEST", message, details);
  }

  static validationFailed(message: string, details?: unknown): AppError {
    return new AppError(422, "VALIDATION_ERROR", message, details);
  }

  static notFound(message: string): AppError {
    return new AppError(404, "NOT_FOUND", message);
  }

  /**
   * A downstream persistence/database failure — distinct from
   * `badRequest`/`validationFailed`, which mean the caller's input was
   * the problem. 503 signals the caller's input was fine and the
   * operation is safe to retry once the underlying failure clears,
   * rather than something to "fix" before resubmitting.
   */
  static persistenceFailed(
    message: string,
    details?: unknown,
    options?: { cause?: unknown },
  ): AppError {
    return new AppError(503, "PERSISTENCE_FAILED", message, details, options);
  }
}
