/**
 * Decodes `loan_registry`'s `created`/`cancelled` contract events
 * (L2-P08) directly from a confirmed transaction's `resultMetaXdr`.
 *
 * # Why this needs no extra RPC call, indexer, or polling
 *
 * `useLoanRegistryWrite` (via `loanRegistry.ts`'s `createLoanRequest`/
 * `cancelLoanRequest`) already calls `assembled.signAndSend()`, which
 * internally submits the transaction and polls `getTransaction` until
 * it confirms — see `sent_transaction.js` in the installed SDK. The
 * confirmed result (`SentTransaction.getTransactionResponse`) already
 * carries a fully-parsed `resultMetaXdr: xdr.TransactionMeta`, which
 * is exactly where Soroban puts the contract's emitted events. This
 * module only *decodes* data the app already has in hand after a
 * successful write — it adds no new network round-trip.
 *
 * # Why two shapes are handled
 *
 * Soroban's `TransactionMeta` XDR format has changed where contract
 * events live across protocol versions:
 * - `v3`: `meta.v3.sorobanMeta.events` (one flat list for the tx).
 * - `v4`: `meta.v4.operations[i].events` (per-operation).
 * This was verified directly against the installed
 * `@stellar/stellar-sdk`'s generated XDR types (`transaction-meta-v3
 * .d.ts`, `transaction-meta-v4.d.ts`, `operation-meta-v2.d.ts`), not
 * assumed — both are handled so this works regardless of which
 * protocol version Testnet is currently running.
 */

import { xdr, scValToNative, StrKey } from "@stellar/stellar-sdk";

export type LoanRegistryEvent =
  | { kind: "created"; loanId: number; borrower: string; amount: bigint }
  | { kind: "cancelled"; loanId: number; borrower: string };

/** Pulls the flat list of contract-level `ContractEvent`s out of
 *  either `TransactionMeta` shape. Unknown/older variants (v0–v2,
 *  which predate Soroban and can't carry contract events) yield an
 *  empty list rather than throwing. */
function collectContractEvents(meta: xdr.TransactionMeta): xdr.ContractEvent[] {
  if (meta.type === "v3") {
    return meta.v3.sorobanMeta?.events ?? [];
  }
  if (meta.type === "v4") {
    return meta.v4.operations.flatMap((op) => op.events);
  }
  return [];
}

/** True if `event` was published by the given (StrKey) contract id. */
function isFromContract(event: xdr.ContractEvent, contractId: string): boolean {
  if (!event.contractId) return false;
  return StrKey.encodeContract(event.contractId.toXdrObject()) === contractId;
}

/**
 * Parses one `ContractEvent` into a `LoanRegistryEvent`, matching the
 * exact topic/data shape `contracts/loan_registry/src/lib.rs`
 * publishes (see its module-level doc comment):
 * - `created`: topics `(Symbol("created"), borrower)`, data
 *   `(loan_id: u64, amount: i128)`.
 * - `cancelled`: topics `(Symbol("cancelled"), borrower)`, data
 *   `loan_id: u64`.
 *
 * Returns `null` for anything that doesn't match this exact shape
 * (a different event name, wrong topic/data arity or types) rather
 * than throwing — an unrecognized event is not this app's concern to
 * fail on, since the contract could one day add more event types.
 */
function parseLoanRegistryEvent(event: xdr.ContractEvent): LoanRegistryEvent | null {
  if (event.body.type !== "v0") return null;
  const { topics, data } = event.body.v0;
  if (topics.length !== 2) return null;

  const eventName = scValToNative(topics[0]);
  const borrower = scValToNative(topics[1]);
  if (typeof eventName !== "string" || typeof borrower !== "string") return null;

  if (eventName === "created") {
    const decoded = scValToNative(data);
    if (!Array.isArray(decoded) || decoded.length !== 2) return null;
    const [loanId, amount] = decoded;
    if (typeof loanId !== "bigint" || typeof amount !== "bigint") return null;
    return { kind: "created", loanId: Number(loanId), borrower, amount };
  }

  if (eventName === "cancelled") {
    const loanId = scValToNative(data);
    if (typeof loanId !== "bigint") return null;
    return { kind: "cancelled", loanId: Number(loanId), borrower };
  }

  return null;
}

/**
 * Extracts every `loan_registry` event published by `contractId`
 * within a confirmed transaction's result metadata, in order. In
 * practice a single create/cancel call publishes exactly one, but
 * this returns a list rather than assuming that so callers decide
 * what "no event found" (empty list) should mean for their UI.
 */
export function extractLoanRegistryEvents(
  meta: xdr.TransactionMeta,
  contractId: string
): LoanRegistryEvent[] {
  return collectContractEvents(meta)
    .filter((event) => isFromContract(event, contractId))
    .map(parseLoanRegistryEvent)
    .filter((event): event is LoanRegistryEvent => event !== null);
}
