/**
 * Frontend client for the backend's `/events` history API (FCP-03).
 *
 * Two responsibilities:
 *
 * 1. `reportConfirmedLoanEvent` — after a real, already-confirmed
 *    create/cancel transaction (see `loanRegistryEvents.ts`'s
 *    `LoanRegistryEvent`, already decoded from the transaction's own
 *    result — nothing here is guessed or synthesized), tells the
 *    backend about it so it's persisted into `blockchain_transactions`/
 *    `contract_events` and broadcast to any other connected clients.
 *    This is the *only* place either table gets written to — there is
 *    no separate blockchain-watching indexer (see
 *    `docs/CURRENT_STATUS.md`'s FCP-03 note on why). Fire-and-forget
 *    safe: a failure here must never surface as a failure of the
 *    wallet transaction that already succeeded on-chain — same
 *    philosophy as the backend's own broadcaster-failure handling in
 *    `eventProcessing.ts`.
 *
 * 2. `fetchLoanEventHistory` — queries persisted history for the
 *    Transactions/History page. Unlike (1), a failure here throws a
 *    typed error, since that page's whole point is honestly showing
 *    whether the fetch succeeded.
 *
 * Pure request/response shaping (`buildEventsHistoryQuery`,
 * `parseHistoryEvent`) is split out so it's unit-testable without
 * mocking `fetch` at all — same separation used throughout this
 * project (`contractReadState.ts`, `loanRegistryList.ts`, etc.).
 */

import { eventsHistoryUrl } from "../../config/backend.ts";
import type { LoanRegistryEvent } from "../stellar/loanRegistryEvents.ts";

export interface LoanEventHistoryFilters {
  contractId?: string;
  eventType?: string;
  limit?: number;
}

/** Builds the `GET /events` query string from filters. Pure — no network access. */
export function buildEventsHistoryQuery(filters: LoanEventHistoryFilters): string {
  const params = new URLSearchParams();
  if (filters.contractId) params.set("contractId", filters.contractId);
  if (filters.eventType) params.set("eventType", filters.eventType);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export interface LoanHistoryEvent {
  id: number;
  transactionHash: string;
  contractId: string;
  network: string;
  eventType: string;
  ledgerSequence: number | null;
  payload: unknown;
  createdAt: string;
}

/**
 * Narrows an arbitrary parsed-JSON value into a `LoanHistoryEvent`, or
 * `null` if it doesn't match the expected shape. Pure. A row that
 * fails to parse is dropped by the caller rather than failing the
 * whole fetch — one malformed row shouldn't hide every other real one
 * (same partial-tolerance philosophy as `loanRegistryList.ts`'s
 * `failedIds`).
 */
export function parseHistoryEvent(value: unknown): LoanHistoryEvent | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== "number" ||
    typeof v.transactionHash !== "string" ||
    typeof v.contractId !== "string" ||
    typeof v.network !== "string" ||
    typeof v.eventType !== "string" ||
    typeof v.createdAt !== "string"
  ) {
    return null;
  }
  return {
    id: v.id,
    transactionHash: v.transactionHash,
    contractId: v.contractId,
    network: v.network,
    eventType: v.eventType,
    ledgerSequence: typeof v.ledgerSequence === "number" ? v.ledgerSequence : null,
    payload: v.payload ?? null,
    createdAt: v.createdAt,
  };
}

export class LoanEventHistoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoanEventHistoryError";
  }
}

/**
 * Fetches persisted `loan_registry` event history from the backend.
 * Throws `LoanEventHistoryError` on any failure (network, non-2xx,
 * malformed body).
 */
export async function fetchLoanEventHistory(
  filters: LoanEventHistoryFilters = {},
): Promise<LoanHistoryEvent[]> {
  let response: Response;
  try {
    response = await fetch(`${eventsHistoryUrl()}${buildEventsHistoryQuery(filters)}`);
  } catch {
    throw new LoanEventHistoryError("Could not reach the backend. Check your connection and try again.");
  }

  if (!response.ok) {
    throw new LoanEventHistoryError("The backend could not return transaction history right now.");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new LoanEventHistoryError("The backend returned an unexpected response.");
  }

  const events = (body as { events?: unknown[] } | null)?.events;
  if (!Array.isArray(events)) {
    throw new LoanEventHistoryError("The backend returned an unexpected response.");
  }

  return events.map(parseHistoryEvent).filter((event): event is LoanHistoryEvent => event !== null);
}

export interface ReportConfirmedLoanEventInput {
  txHash: string;
  event: LoanRegistryEvent;
  network: string;
  contractId: string;
}

/**
 * Reports a real, already-confirmed `loan_registry` event to the
 * backend for persistence. Never throws — a failure is logged and
 * swallowed, exactly like `eventProcessing.ts`'s own
 * broadcaster-failure handling: the on-chain transaction this is
 * reporting already succeeded by the time this is called, so a
 * history-recording failure must never look like the loan action
 * itself failed.
 */
export async function reportConfirmedLoanEvent(input: ReportConfirmedLoanEventInput): Promise<void> {
  const { txHash, event, network, contractId } = input;
  const payload =
    event.kind === "created"
      ? { loanId: event.loanId, borrower: event.borrower, amount: event.amount.toString() }
      : { loanId: event.loanId, borrower: event.borrower };

  try {
    const response = await fetch(eventsHistoryUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transaction: {
          transactionHash: txHash,
          network,
          status: "confirmed",
          contractId,
          actionType: `loan_${event.kind}`,
        },
        event: { transactionHash: txHash, contractId, network, eventType: event.kind, payload },
      }),
    });
    if (!response.ok) {
      console.error("Failed to record a confirmed loan event in backend history:", response.status);
    }
  } catch (err) {
    console.error("Failed to reach the backend to record a confirmed loan event:", err);
  }
}
