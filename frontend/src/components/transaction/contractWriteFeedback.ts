/**
 * Adapts `useLoanRegistryWrite`'s status shape
 * (`idle | pending | success | failure`, from `contractWriteState.ts`)
 * onto the existing `TransactionFeedback` component's `TransferStatus`
 * prop (`idle | preparing | awaiting_signature | submitted | confirmed
 * | failed | rejected`, from `lib/stellar/types.ts`).
 *
 * This lets the loan Create/Cancel UI reuse the same
 * `TransactionFeedback` component and styling the XLM transfer flow
 * already uses, rather than building a second transaction-feedback
 * component or changing `TransactionFeedback`'s public contract (it's
 * still used as-is by `TransferForm`).
 *
 * `pending` intentionally maps to `submitted` (not
 * `awaiting_signature`) because `useLoanRegistryWrite` does not
 * expose a finer-grained "awaiting wallet signature" vs. "submitted
 * to the network" distinction the way `useTransfer`/`sendXlm` does —
 * collapsing to one honest "in progress" message is more accurate
 * than inventing a stage the hook doesn't actually report.
 *
 * `failure` maps to `rejected` specifically when the underlying error
 * is a wallet rejection (`error.code === "REJECTED"`), and to `failed`
 * for every other failure. `useLoanRegistryWrite` represents a wallet
 * rejection as `status: "failure"` with `error.code: "REJECTED"`
 * rather than as its own status value, so this is where that
 * distinction is recovered for display — without it, a rejected
 * contract write would show the generic "The transaction could not be
 * completed." instead of the same clear "Transaction rejected…"
 * message the XLM transfer flow already shows for the identical user
 * action. `error` is intentionally a minimal structural type (just
 * `.code`), not the real `ContractWriteError`, so this module stays
 * dependency-light.
 */

import type { ContractWriteStatus } from "@/hooks/contractWriteState";
import type { TransferStatus } from "@/lib/stellar/types";

export function contractWriteStatusToFeedbackStatus(
  status: ContractWriteStatus,
  error?: { code: string } | null
): TransferStatus {
  switch (status) {
    case "idle":
      return "idle";
    case "pending":
      return "submitted";
    case "success":
      return "confirmed";
    case "failure":
      return error?.code === "REJECTED" ? "rejected" : "failed";
  }
}
