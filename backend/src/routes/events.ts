import { Router } from "express";
import type { EventBroadcaster } from "../realtime/eventBroadcaster.ts";

/**
 * How often a heartbeat comment is sent to each connected client.
 * Keeps intermediary proxies/load balancers from timing out an
 * apparently-idle connection, and lets a client's `onerror` fire
 * promptly if the underlying socket has actually died. A comment line
 * (`:`-prefixed) is invisible to `EventSource.onmessage` — it carries
 * no data of its own.
 */
const HEARTBEAT_INTERVAL_MS = 20_000;

/**
 * Builds the `/events/stream` router for a specific `EventBroadcaster`
 * instance (dependency-injected, same convention `createApp` uses)
 * rather than always reaching for the process-wide singleton — so
 * tests can mount this against an isolated broadcaster with no shared
 * state between test files.
 *
 * Generic contract-event streaming only: no P2P domain meaning, no
 * filtering by contract/event type. A frontend decides what a given
 * update means to it (see `frontend/src/lib/realtime`).
 */
export function createEventsRouter(broadcaster: EventBroadcaster): Router {
  const router = Router();

  router.get("/events/stream", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disables response buffering on nginx-style reverse proxies,
      // which would otherwise hold updates back instead of streaming
      // them immediately.
      "X-Accel-Buffering": "no",
    });
    // Opens the stream with a comment (not a real update) immediately,
    // so a connecting client/test can observe the connection is live
    // without waiting for the first broadcast.
    res.write(": connected\n\n");

    broadcaster.subscribe(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        // A dead socket here is handled by the "close" listener below;
        // nothing further to do from inside the interval callback.
      }
    }, HEARTBEAT_INTERVAL_MS);
    heartbeat.unref();

    const cleanup = () => {
      clearInterval(heartbeat);
      broadcaster.unsubscribe(res);
    };
    req.on("close", cleanup);
  });

  return router;
}
