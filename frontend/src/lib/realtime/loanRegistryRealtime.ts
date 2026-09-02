/**
 * Bridges the generic, backend-defined `ContractEventUpdate` (received
 * over `/events/stream`) into the app's existing `LoanRegistryEvent`
 * shape (`lib/stellar/loanRegistryEvents.ts`), so a live update from
 * another session can feed the exact same sync mechanism
 * `LoanLookup`/`LoanRegistrySection` already use for a local wallet
 * write's decoded event (L2-P08) — same consumer, an additional
 * source.
 *
 * Deliberately lives outside `loanRegistryEvents.ts` (which stays
 * focused on decoding the contract's real XDR event data) and outside
 * `lib/realtime` staying domain-agnostic — this is the one place that
 * knows about both.
 *
 * The backend's `contract_events.payload` column is untyped JSON (see
 * `backend/src/services/eventProcessing.ts`); this function is
 * deliberately defensive about its shape rather than assuming a
 * producer got it right, returning `null` for anything that doesn't
 * match instead of throwing.
 */

import type { LoanRegistryEvent } from "../stellar/loanRegistryEvents.ts";
import type { ContractEventUpdate } from "./types.ts";

/**
 * Converts one real-time `ContractEventUpdate` into a
 * `LoanRegistryEvent`, or `null` if it isn't a recognizable
 * `loan_registry` `created`/`cancelled` event for `loanRegistryContractId`.
 */
export function contractEventUpdateToLoanRegistryEvent(
  update: ContractEventUpdate,
  loanRegistryContractId: string,
): LoanRegistryEvent | null {
  if (update.contractId !== loanRegistryContractId) return null;
  if (update.eventType !== "created" && update.eventType !== "cancelled") return null;

  const payload = update.payload;
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as Record<string, unknown>;

  const loanId = record.loanId;
  const borrower = record.borrower;
  if (typeof loanId !== "number" || !Number.isInteger(loanId) || loanId < 0) return null;
  if (typeof borrower !== "string" || borrower.trim().length === 0) return null;

  if (update.eventType === "cancelled") {
    return { kind: "cancelled", loanId, borrower };
  }

  // "created" additionally carries an amount. JSON can't carry a
  // BigInt directly, so a producer is expected to send it as a
  // string or a safe-integer number; either is converted back here.
  const amountRaw = record.amount;
  if (typeof amountRaw !== "string" && typeof amountRaw !== "number") return null;
  try {
    const amount = BigInt(amountRaw);
    if (amount < BigInt(0)) return null;
    return { kind: "created", loanId, borrower, amount };
  } catch {
    return null; // amountRaw wasn't a valid integer representation
  }
}
