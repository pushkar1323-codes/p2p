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
 * `failure` maps to `failed` rather than `rejected`: wallet rejection
 * is represented by `useLoanRegistryWrite` as
 * `status: "failure"` + `error.code: "REJECTED"` (a deliberate L2-P06
 * decision — see CURRENT_STATUS.md), not a separate status value, so
 * there is no `pending`/`success`/`failure` state that maps to
 * `rejected` here.
 */

import type { ContractWriteStatus } from "@/hooks/contractWriteState";
import type { TransferStatus } from "@/lib/stellar/types";

export function contractWriteStatusToFeedbackStatus(
  status: ContractWriteStatus
): TransferStatus {
  switch (status) {
    case "idle":
      return "idle";
    case "pending":
      return "submitted";
    case "success":
      return "confirmed";
    case "failure":
      return "failed";
  }
}
