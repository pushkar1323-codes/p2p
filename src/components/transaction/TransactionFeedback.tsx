"use client";

/**
 * TransactionFeedback
 *
 * Reusable component for displaying blockchain transaction lifecycle
 * state: idle -> preparing -> awaiting_signature -> submitted ->
 * confirmed, or -> rejected / failed. Not hardcoded to the XLM
 * transfer form specifically — it only depends on TransferStatus
 * (a plain string union) and a small set of props, so it can be
 * reused by any future transaction flow that produces the same
 * status shape (e.g. a later contract-call feature).
 *
 * The actual transaction lifecycle logic (building, signing,
 * submitting) lives in useTransfer/transaction.ts; this component is
 * purely presentational and receives its state through props.
 *
 * Plain, restrained styling consistent with the rest of the wallet
 * UI; not the final P2P design system.
 */

import { getFeedbackContent } from "./feedbackContent";
import type { TransferError, TransferStatus } from "@/lib/stellar/types";
import styles from "./TransactionFeedback.module.css";

export interface TransactionFeedbackProps {
  status: TransferStatus;
  hash?: string | null;
  error?: TransferError | null;
  /** Precomputed explorer link for the hash, if available. */
  explorerUrl?: string | null;
  /**
   * Optional per-status message overrides, so the same component can
   * be reused by other transaction flows with different copy.
   */
  messages?: Partial<Record<TransferStatus, string>>;
}

export function TransactionFeedback({
  status,
  hash,
  error,
  explorerUrl,
  messages,
}: TransactionFeedbackProps) {
  const content = getFeedbackContent(status, messages);

  if (!content.visible) {
    // idle: render nothing
    return null;
  }

  return (
    <div
      className={`${styles.container} ${styles[content.tone]}`}
      role="status"
      aria-live="polite"
    >
      <p className={styles.message}>{content.message}</p>

      {content.showHash && hash && (
        <div className={styles.hashBlock}>
          <span className={styles.hashLabel}>Transaction hash</span>
          <span className={styles.hashValue}>{hash}</span>
          {explorerUrl && (
            <a
              className={styles.explorerLink}
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on Stellar Testnet Explorer
            </a>
          )}
        </div>
      )}

      {content.showDetail && error?.message && (
        <p className={styles.detail}>{error.message}</p>
      )}
    </div>
  );
}
