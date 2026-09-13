"use client";

import { useState } from "react";
import { AddressChip } from "@/components/ui/AddressChip";
import { TransactionFeedback } from "@/components/transaction/TransactionFeedback";
import { contractWriteStatusToFeedbackStatus } from "@/components/transaction/contractWriteFeedback";
import { testnetExplorerUrl } from "@/lib/stellar/transaction";
import type { UseLoanRegistryWriteResult } from "@/hooks/useLoanRegistryWrite";
import styles from "./FundLoanAction.module.css";

interface FundLoanActionProps {
  loanId: number;
  /** The loan's own requested amount — always sent as-is; there is no
   *  amount input anywhere in this component. The current
   *  loan_registry contract requires funding the exact requested
   *  amount: partial funding is not supported, and this UI must not
   *  present it as if it were. */
  amount: bigint;
  /** The one funding token this app currently supports — see
   *  `stellarConfig.nativeXlmSacContractId`'s doc comment for why. */
  token: string;
  /** The connected wallet's address — guaranteed non-null by the
   *  caller (only rendered once a wallet is connected and confirmed
   *  not to be this loan's own borrower). This, not any typed input,
   *  is the only source of the funding `lender` address. */
  lenderAddress: string;
  /** Shared with the parent's Cancel action — see
   *  `LoanDetailSection.tsx`: a connected wallet is either this
   *  loan's borrower (who can cancel) or isn't (who can fund an Open
   *  loan), never both, so one write state machine safely serves
   *  both actions. */
  write: UseLoanRegistryWriteResult;
  /** Called once, right after a successful funding transaction is
   *  confirmed, so the caller can re-fetch the loan (its status is
   *  now `Funded`) and its funding record. */
  onFunded: () => void;
}

/**
 * Real, wallet-signed Fund Loan flow: two steps, review (shows
 * exactly what will be signed, nothing editable) then confirm, which
 * triggers the actual wallet signature. Never shows "Funded" before
 * `write.status === "success"` — that only happens once the write
 * hook's underlying `fundLoan()` call has resolved, which itself only
 * resolves once the transaction is confirmed on Testnet (see
 * `lib/stellar/loanRegistry.ts`'s `fundLoan` doc comment).
 */
export function FundLoanAction({
  loanId,
  amount,
  token,
  lenderAddress,
  write,
  onFunded,
}: FundLoanActionProps) {
  const [reviewing, setReviewing] = useState(false);
  const pending = write.status === "pending";

  async function handleConfirmFund() {
    if (pending) return;
    await write.fundLoan(loanId, token, amount);
    onFunded();
  }

  if (write.status === "idle" && !reviewing) {
    return (
      <div className={styles.container}>
        <p className={styles.hint}>
          This loan is open and requesting {amount.toString()} contract units. You can fund it in
          full from this wallet.
        </p>
        <button type="button" className={styles.primaryButton} onClick={() => setReviewing(true)}>
          Fund Loan
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <dl className={styles.reviewList}>
        <div className={styles.reviewRow}>
          <dt>Requested amount</dt>
          <dd>{amount.toString()} contract units</dd>
        </div>
        <div className={styles.reviewRow}>
          <dt>Funding amount</dt>
          <dd>{amount.toString()} contract units</dd>
        </div>
        <div className={styles.reviewRow}>
          <dt>Token</dt>
          <dd>Testnet XLM</dd>
        </div>
        <div className={styles.reviewRow}>
          <dt>Lender</dt>
          <dd>
            <AddressChip address={lenderAddress} />
          </dd>
        </div>
      </dl>
      <p className={styles.hint}>
        Funding amount always equals the requested amount — this contract does not support
        partial funding. Confirming will ask your wallet to sign a real Testnet transaction.
      </p>

      {write.status === "idle" && (
        <div className={styles.reviewActions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleConfirmFund}
            disabled={pending}
          >
            Confirm &amp; Fund
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => setReviewing(false)}>
            Cancel
          </button>
        </div>
      )}

      {write.status !== "idle" && (
        <div className={styles.feedback}>
          <TransactionFeedback
            status={contractWriteStatusToFeedbackStatus(write.status, write.error)}
            hash={write.txHash}
            // See LoanRequestActions.tsx's identical comment on this
            // remapping — TransactionFeedback only ever reads
            // `.message`, never `.code`.
            error={write.error ? { code: "UNKNOWN", message: write.error.message } : null}
            explorerUrl={write.txHash ? testnetExplorerUrl(write.txHash) : null}
            messages={{
              submitted: "Funding this loan…",
              confirmed: "Loan funded — status is now Funded.",
            }}
          />

          {write.status === "failure" && (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                write.reset();
              }}
            >
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
