/**
 * Pure state -> display content mapping for TransactionFeedback.
 *
 * Deliberately has no React/JSX dependency so it can be unit tested
 * directly with Node's built-in test runner (see feedbackContent.test.mts)
 * without needing a DOM environment or a testing-library dependency.
 */

import type { TransferStatus } from "../../lib/stellar/types.ts";

export type TransactionFeedbackTone = "neutral" | "pending" | "success" | "error";

export interface TransactionFeedbackContent {
  /** Whether anything should render at all for this status. */
  visible: boolean;
  message: string;
  tone: TransactionFeedbackTone;
  /** Whether the hash/explorer link section should be shown. */
  showHash: boolean;
  /** Whether the error/detail message section should be shown. */
  showDetail: boolean;
}

const DEFAULT_MESSAGES: Record<Exclude<TransferStatus, "idle">, string> = {
  preparing: "Preparing your transaction…",
  awaiting_signature: "Approve or reject this transaction in your connected wallet.",
  submitted: "Transaction submitted. Waiting for network confirmation…",
  confirmed: "Transaction confirmed.",
  failed: "The transaction could not be completed.",
  rejected: "Transaction rejected. You rejected the transaction request in your connected wallet.",
};

const TONE_BY_STATUS: Record<Exclude<TransferStatus, "idle">, TransactionFeedbackTone> = {
  preparing: "pending",
  awaiting_signature: "pending",
  submitted: "pending",
  confirmed: "success",
  failed: "error",
  rejected: "error",
};

/**
 * Maps a transfer status (plus optional message override) to the
 * content TransactionFeedback should render. Kept pure/synchronous so
 * it is trivial to unit test independently of rendering.
 */
export function getFeedbackContent(
  status: TransferStatus,
  messages?: Partial<Record<TransferStatus, string>>
): TransactionFeedbackContent {
  if (status === "idle") {
    return {
      visible: false,
      message: "",
      tone: "neutral",
      showHash: false,
      showDetail: false,
    };
  }

  const message = messages?.[status] ?? DEFAULT_MESSAGES[status];
  const tone = TONE_BY_STATUS[status];

  return {
    visible: true,
    message,
    tone,
    showHash: status === "confirmed",
    // "rejected" already states the full outcome in its single
    // message (see DEFAULT_MESSAGES.rejected above); showing the
    // underlying error.message as well would just repeat the same
    // fact in different words. "failed" genuinely benefits from the
    // extra detail line, since its top-level message is generic.
    showDetail: status === "failed",
  };
}
