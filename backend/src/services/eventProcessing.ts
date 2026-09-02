import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { getDb } from "../db/client.ts";
import { contractEvents } from "../db/schema.ts";
import { AppError } from "../errors/AppError.ts";
import { getEventBroadcaster, type EventBroadcaster } from "../realtime/eventBroadcaster.ts";
import type { ContractEventUpdate } from "../realtime/types.ts";

/**
 * Raw, not-yet-trusted description of a single Stellar/Soroban contract
 * event a caller wants recorded. Every field is `unknown` on purpose —
 * this is the untrusted boundary of the service. Nothing here is
 * assumed to be well-formed; `validateAndNormalizeEvent` is what turns
 * it into something safe to persist.
 *
 * Deliberately generic across any contract's events (not just
 * `loan_registry`'s `created`/`cancelled`) — this service has no
 * knowledge of P2P domain meaning, per this task's scope.
 */
export interface RawContractEventInput {
  transactionHash?: unknown;
  contractId?: unknown;
  network?: unknown;
  eventType?: unknown;
  /** Optional — preserved when supplied, `null` when omitted. */
  ledgerSequence?: unknown;
  /** Optional — normalized into the JSONB `payload` column, `null` when omitted. */
  payload?: unknown;
}

/** A validated, normalized event — exactly what gets persisted. */
export interface NormalizedContractEvent {
  transactionHash: string;
  contractId: string;
  network: string;
  eventType: string;
  ledgerSequence: number | null;
  payload: unknown;
}

export type ProcessContractEventResult =
  | { outcome: "inserted"; event: NormalizedContractEvent }
  | { outcome: "duplicate"; event: NormalizedContractEvent };

interface FieldIssue {
  field: string;
  message: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates and normalizes a raw event input into a `NormalizedContractEvent`.
 * Never touches the database. Throws `AppError.validationFailed` (422)
 * listing every problem found, so a caller/UI can show all of them at
 * once rather than one at a time.
 *
 * Exported separately from `processContractEvent` so callers/tests can
 * validate input without a database connection at all.
 */
export function validateAndNormalizeEvent(
  input: RawContractEventInput,
): NormalizedContractEvent {
  const issues: FieldIssue[] = [];

  if (!isNonEmptyString(input.transactionHash)) {
    issues.push({
      field: "transactionHash",
      message: "is required and must be a non-empty string",
    });
  }
  if (!isNonEmptyString(input.contractId)) {
    issues.push({
      field: "contractId",
      message: "is required and must be a non-empty string",
    });
  }
  if (!isNonEmptyString(input.network)) {
    issues.push({
      field: "network",
      message: "is required and must be a non-empty string",
    });
  }
  if (!isNonEmptyString(input.eventType)) {
    issues.push({
      field: "eventType",
      message: "is required and must be a non-empty string",
    });
  }

  let ledgerSequence: number | null = null;
  if (input.ledgerSequence !== undefined && input.ledgerSequence !== null) {
    const raw = input.ledgerSequence;
    const numeric =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && raw.trim() !== ""
          ? Number(raw)
          : NaN;
    if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric < 0) {
      issues.push({
        field: "ledgerSequence",
        message: "must be a non-negative integer when provided",
      });
    } else {
      ledgerSequence = numeric;
    }
  }

  let payload: unknown = null;
  if (input.payload !== undefined && input.payload !== null) {
    try {
      // Round-trip through JSON to guarantee the value is valid, storable
      // JSON (rejects BigInt/functions/symbols/circular references) and
      // to normalize it to exactly what the jsonb column will actually
      // store (e.g. object properties whose value is `undefined` are
      // dropped, matching real JSON semantics).
      payload = JSON.parse(JSON.stringify(input.payload));
    } catch {
      issues.push({
        field: "payload",
        message: "must be JSON-serializable",
      });
    }
  }

  if (issues.length > 0) {
    throw AppError.validationFailed(
      "Contract event input failed validation.",
      issues,
    );
  }

  return {
    transactionHash: (input.transactionHash as string).trim(),
    contractId: (input.contractId as string).trim(),
    network: (input.network as string).trim(),
    eventType: (input.eventType as string).trim(),
    ledgerSequence,
    payload,
  };
}

/**
 * Validates, normalizes, and persists a single contract event into
 * `contract_events`, idempotently.
 *
 * **Idempotency**: relies entirely on the table's own
 * `(transaction_hash, event_type)` unique constraint via
 * `ON CONFLICT DO NOTHING` — there is deliberately no in-memory
 * duplicate tracker (that wouldn't survive a process restart or work
 * across multiple backend instances; the database constraint does).
 * Calling this twice with the same event returns `{ outcome: "inserted" }`
 * once and `{ outcome: "duplicate" }` every time after, and never
 * creates a second row.
 *
 * **Retry-safety**: because the database constraint (not any in-process
 * state) is the sole source of truth for "have we seen this event
 * before", this function has no internal state that could get out of
 * sync with reality. A caller (e.g. a future ingestion/indexing job)
 * can safely call this again after a failure — including after a
 * `PERSISTENCE_FAILED` error from a previous attempt — with no special
 * retry bookkeeping required.
 *
 * **Not wired to any HTTP route** — a future Stellar event
 * ingestion/indexing task calls this directly with already-decoded
 * event data, exactly as this task's scope requires.
 *
 * **Real-time delivery (L3-P05)**: once — and only once — an event is
 * *freshly* persisted (`outcome: "inserted"`), the normalized event is
 * broadcast to connected SSE clients via `broadcaster` (defaulting to
 * the process-wide `getEventBroadcaster()` singleton, same optional/
 * injectable convention as `db`). A `duplicate` outcome is never
 * broadcast again — it was already broadcast the first time it was
 * inserted, and every field of a duplicate is identical to that
 * original broadcast by definition. Broadcasting only happens after
 * the database write has actually succeeded: persistence and
 * real-time delivery stay logically separate steps, and a broadcaster
 * failure (e.g. a client write erroring) is caught and logged, never
 * allowed to turn an already-successful persistence into a thrown
 * error.
 */
export async function processContractEvent(
  input: RawContractEventInput,
  db?: Database,
  broadcaster?: EventBroadcaster,
): Promise<ProcessContractEventResult> {
  // Validate before resolving or touching the database (or the
  // broadcaster) at all — so invalid input is rejected, and nothing is
  // ever broadcast, even if no database is configured yet.
  const normalized = validateAndNormalizeEvent(input);
  const database = db ?? getDb().db;

  let insertedRows: (typeof contractEvents.$inferSelect)[];
  try {
    insertedRows = await database
      .insert(contractEvents)
      .values(normalized)
      .onConflictDoNothing({
        target: [contractEvents.transactionHash, contractEvents.eventType],
      })
      .returning();
  } catch (err) {
    // Anything reaching here is a genuine, unexpected persistence
    // failure (connection lost, table missing, etc.) — NOT the
    // anticipated duplicate case, which `onConflictDoNothing` already
    // handles without the database ever raising an error for it. Never
    // silently treated as success.
    console.error("Contract event persistence failed:", err);
    throw AppError.persistenceFailed(
      "Failed to persist contract event.",
      { transactionHash: normalized.transactionHash, eventType: normalized.eventType },
      { cause: err },
    );
  }

  if (insertedRows.length > 0) {
    broadcastInsertedEvent(normalized, broadcaster ?? getEventBroadcaster());
    return { outcome: "inserted", event: normalized };
  }

  // Conflict: this (transactionHash, eventType) pair was already
  // persisted by an earlier call. Look the existing row up so the
  // caller gets a complete, predictable result either way, not just a
  // bare "duplicate" flag.
  let existingRows: (typeof contractEvents.$inferSelect)[];
  try {
    existingRows = await database
      .select()
      .from(contractEvents)
      .where(
        and(
          eq(contractEvents.transactionHash, normalized.transactionHash),
          eq(contractEvents.eventType, normalized.eventType),
        ),
      )
      .limit(1);
  } catch (err) {
    console.error("Failed to look up existing contract event after conflict:", err);
    throw AppError.persistenceFailed(
      "Failed to read back the already-persisted contract event.",
      { transactionHash: normalized.transactionHash, eventType: normalized.eventType },
      { cause: err },
    );
  }

  const existing = existingRows[0];
  return {
    outcome: "duplicate",
    event: existing
      ? {
          transactionHash: existing.transactionHash,
          contractId: existing.contractId,
          network: existing.network,
          eventType: existing.eventType,
          ledgerSequence: existing.ledgerSequence,
          payload: existing.payload,
        }
      : normalized,
  };
}

/**
 * Broadcasts a freshly-persisted event to connected SSE clients.
 * Deliberately fire-and-forget from the caller's perspective: a
 * broadcast failure (e.g. one client's connection erroring mid-write)
 * is logged and swallowed here, never re-thrown, so it can never turn
 * an already-successful database write into a failed
 * `processContractEvent` call.
 */
function broadcastInsertedEvent(
  event: NormalizedContractEvent,
  broadcaster: EventBroadcaster,
): void {
  const update: ContractEventUpdate = {
    type: "contract-event",
    transactionHash: event.transactionHash,
    contractId: event.contractId,
    network: event.network,
    eventType: event.eventType,
    ledgerSequence: event.ledgerSequence,
    payload: event.payload,
    occurredAt: new Date().toISOString(),
  };
  try {
    broadcaster.broadcast(update);
  } catch (err) {
    console.error("Failed to broadcast a persisted contract event:", err);
  }
}
