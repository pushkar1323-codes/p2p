import { Router } from "express";
import { z } from "zod";
import type { EventBroadcaster } from "../realtime/eventBroadcaster.ts";
import type { Database } from "../db/client.ts";
import { queryContractEvents } from "../services/eventQuery.ts";
import { processContractEvent, type RawContractEventInput } from "../services/eventProcessing.ts";
import {
  recordBlockchainTransaction,
  type RawBlockchainTransactionInput,
} from "../services/transactionRecording.ts";
import { validate } from "../middleware/validate.ts";

/**
 * How often a heartbeat comment is sent to each connected client.
 * Keeps intermediary proxies/load balancers from timing out an
 * apparently-idle connection, and lets a client's `onerror` fire
 * promptly if the underlying socket has actually died. A comment line
 * (`:`-prefixed) is invisible to `EventSource.onmessage` — it carries
 * no data of its own.
 */
const HEARTBEAT_INTERVAL_MS = 20_000;

/** Query params accepted by `GET /events`. All optional — an empty query returns the most recent events across every contract/network. */
const getEventsQuerySchema = z.object({
  contractId: z.string().min(1).optional(),
  eventType: z.string().min(1).optional(),
  network: z.string().min(1).optional(),
  limit: z.coerce.number().optional(),
  beforeId: z.coerce.number().optional(),
});

/**
 * Body accepted by `POST /events`. `event` is required — this
 * endpoint's whole purpose is recording a contract event.
 * `transaction` is optional: a caller reporting a plain XLM transfer
 * (no contract event) would omit `event` entirely and use a
 * transaction-only shape instead, but for FCP-03's scope (loan
 * created/cancelled) the two are always reported together, since a
 * frontend calling this already has both from the same confirmed
 * transaction result.
 *
 * Deliberately only shape-validated here (an object each) — the
 * *field-level* validation (required strings, enum status, etc.)
 * already lives in `processContractEvent`/`recordBlockchainTransaction`
 * and is exercised by their own test suites; duplicating those rules
 * here would just be two places that could drift out of sync.
 */
const postEventsBodySchema = z.object({
  transaction: z.record(z.string(), z.unknown()).optional(),
  event: z.record(z.string(), z.unknown()),
});

/**
 * Builds the `/events` router — real-time streaming
 * (`GET /events/stream`, unchanged from L3-P05), plus FCP-03's history
 * API: `GET /events` (query persisted events) and `POST /events`
 * (record a confirmed transaction/event). `broadcaster` and `db` are
 * both dependency-injected (same convention `createApp` already used
 * for `broadcaster`) so tests can mount this against isolated
 * instances with no shared state between test files and no live
 * Postgres required for the non-DB-semantic tests.
 */
export function createEventsRouter(broadcaster: EventBroadcaster, db?: Database): Router {
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

  router.get("/events", validate("query", getEventsQuerySchema), async (req, res) => {
    const query = req.query as unknown as z.infer<typeof getEventsQuerySchema>;
    const events = await queryContractEvents(
      {
        contractId: query.contractId,
        eventType: query.eventType,
        network: query.network,
        limit: query.limit,
        beforeId: query.beforeId,
      },
      db,
    );
    res.json({ events });
  });

  router.post("/events", validate("body", postEventsBodySchema), async (req, res) => {
    const body = req.body as z.infer<typeof postEventsBodySchema>;

    // Transaction recorded first (if present) — if it fails
    // validation/persistence, nothing is broadcast and the event
    // below is never processed, matching processContractEvent's own
    // "nothing happens until every check passes" ordering.
    const transaction = body.transaction
      ? await recordBlockchainTransaction(body.transaction as RawBlockchainTransactionInput, db)
      : null;

    const event = await processContractEvent(body.event as RawContractEventInput, db, broadcaster);

    res.status(200).json({ transaction, event });
  });

  return router;
}
