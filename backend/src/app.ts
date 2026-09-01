import express, { type Express } from "express";
import { healthRouter } from "./routes/health.ts";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.ts";

/**
 * Builds a fresh, unstarted Express app. Kept separate from
 * `server.ts` (which actually calls `.listen()`) so tests can exercise
 * the app in-process without binding a real port.
 *
 * No P2P domain/business routes are wired here yet — this is the
 * configuration/validation/health/error-handling foundation only, per
 * this task's scope. Future route modules should be mounted here,
 * before `notFoundHandler`/`errorHandler`.
 */
export function createApp(): Express {
  const app = express();

  app.use(express.json());

  app.use(healthRouter);

  // Must come after every real route, and errorHandler must come last.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
