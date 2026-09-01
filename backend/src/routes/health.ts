import { Router } from "express";
import { env } from "../config/env.ts";

export const healthRouter = Router();

/**
 * Liveness/readiness check. Intentionally has no dependency on a
 * database or any other external service yet — none exist in this
 * foundation. Once a database is added (a later task), this should be
 * extended to report its reachability without ever exposing connection
 * details.
 */
healthRouter.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
