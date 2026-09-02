import express, { type Express } from "express";
import { healthRouter } from "./routes/health.ts";
import { createEventsRouter } from "./routes/events.ts";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.ts";
import { corsMiddleware } from "./middleware/cors.ts";
import { getEventBroadcaster, type EventBroadcaster } from "./realtime/eventBroadcaster.ts";

export interface CreateAppOptions {
  /**
   * The `EventBroadcaster` the `/events/stream` route (and, by
   * default, `processContractEvent`) uses. Defaults to the
   * process-wide singleton. Tests inject an isolated instance here so
   * they don't share connected-client state with each other or with
   * the running app.
   */
  eventBroadcaster?: EventBroadcaster;
}

/**
 * Builds a fresh, unstarted Express app. Kept separate from
 * `server.ts` (which actually calls `.listen()`) so tests can exercise
 * the app in-process without binding a real port.
 *
 * No P2P domain/business routes are wired here yet — this is the
 * configuration/validation/health/error-handling/real-time foundation
 * only, per this task's scope. Future route modules should be mounted
 * here, before `notFoundHandler`/`errorHandler`.
 */
export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();

  app.use(corsMiddleware);
  app.use(express.json());

  const eventBroadcaster = options.eventBroadcaster ?? getEventBroadcaster();

  app.use(healthRouter);
  app.use(createEventsRouter(eventBroadcaster));

  // Must come after every real route, and errorHandler must come last.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
