/**
 * The single typed update shape broadcast to connected SSE clients
 * (L3-P05).
 *
 * Deliberately shaped after `NormalizedContractEvent`
 * (`services/eventProcessing.ts`) rather than the raw database row —
 * it carries exactly the normalized information a frontend needs, not
 * internal columns (no `id`/`createdAt`). Generic across any
 * contract's events, same as the event-processing service itself; this
 * module has no knowledge of P2P domain meaning (loans, borrowers,
 * etc.) — that translation is a frontend concern.
 */
export interface ContractEventUpdate {
  /** Discriminant, so the frontend can support other update kinds later without a breaking change. */
  type: "contract-event";
  transactionHash: string;
  contractId: string;
  network: string;
  eventType: string;
  ledgerSequence: number | null;
  payload: unknown;
  /** ISO timestamp of when this update was broadcast (not necessarily when the underlying chain event occurred). */
  occurredAt: string;
}
