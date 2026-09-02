import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.ts";

/**
 * Minimal CORS handling — no `cors` package dependency, since a single
 * configured origin and a couple of headers don't need one.
 *
 * Added as of L3-P05: the frontend's browser-based SSE client
 * (`EventSource`) connects to `/events/stream` from a different origin
 * (the Next.js dev/prod server) than this API. A browser refuses to
 * let JavaScript read a cross-origin response — including the SSE
 * stream's data — unless the response carries
 * `Access-Control-Allow-Origin`, even though the underlying HTTP
 * request itself succeeds. `EventSource` sends a plain, credential-less
 * GET with no custom headers, which browsers treat as a CORS "simple
 * request" (no preflight `OPTIONS` needed) — but the header below is
 * still required for the browser to expose the response to the page.
 *
 * The `OPTIONS` handling exists for future non-simple requests (a
 * write endpoint sending JSON with a custom header, say) so this
 * middleware doesn't need revisiting the next time one is added.
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Access-Control-Allow-Origin", env.CORS_ORIGIN);
  // Response varies by request origin (a single fixed origin is
  // reflected back), so caches/CDNs must key on it.
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
    return;
  }

  next();
}
