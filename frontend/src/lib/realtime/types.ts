/**
 * Mirrors the backend's `ContractEventUpdate`
 * (`backend/src/realtime/types.ts`) — the exact JSON shape broadcast
 * over `/events/stream`. Kept as a plain, independent type here (no
 * shared package between frontend/backend in this repository) rather
 * than importing across the frontend/backend boundary.
 *
 * Deliberately generic/domain-agnostic, same as the backend type it
 * mirrors — `loanRegistryRealtime.ts` is where this gets translated
 * into P2P-domain meaning (a `LoanRegistryEvent`), not here.
 */
export interface ContractEventUpdate {
  type: "contract-event";
  transactionHash: string;
  contractId: string;
  network: string;
  eventType: string;
  ledgerSequence: number | null;
  payload: unknown;
  occurredAt: string;
}
