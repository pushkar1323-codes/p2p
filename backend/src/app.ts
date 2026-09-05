import express, { type Express } from "express";
import { healthRouter } from "./routes/health.ts";
import { createEventsRouter } from "./routes/events.ts";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.ts";
import { corsMiddleware } from "./middleware/cors.ts";
import { getEventBroadcaster, type EventBroadcaster } from "./realtime/eventBroadcaster.ts";
import type { Database } from "./db/client.ts";

export interface CreateAppOptions {
  /**
   * The `EventBroadcaster` the `/events/stream` route (and, by
   * default, `processContractEvent`) uses. Defaults to the
   * process-wide singleton. Tests inject an isolated instance here so
   * they don't share connected-client state with each other or with
   * the running app.
   */
  eventBroadcaster?: EventBroadcaster;
  /**
   * The `Database` the `/events` history routes (FCP-03) use.
   * Defaults to the process-wide singleton (`getDb()`, lazily created
   * from `DATABASE_URL`) when omitted. Tests inject an isolated
   * connection (typically a rolled-back transaction) so they never
   * touch real data or require a live database for the routes that
   * don't need one.
   */
  db?: Database;
}

/**
 * Builds a fresh, unstarted Express app. Kept separate from
 * `server.ts` (which actually calls `.listen()`) so tests can exercise
 * the app in-process without binding a real port.
 *
 * Route modules mounted here, before `notFoundHandler`/`errorHandler`:
 * health, and `/events` (real-time stream + FCP-03's history API).
 */
export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();

  app.use(corsMiddleware);
  app.use(express.json());

  const eventBroadcaster = options.eventBroadcaster ?? getEventBroadcaster();

  app.use(healthRouter);
  app.use(createEventsRouter(eventBroadcaster, options.db));

  // Must come after every real route, and errorHandler must come last.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
