"use client";

import { truncateStellarAddress } from "@/components/ui/AddressChip";
import { LoanStatusBadge } from "./LoanStatusBadge";
import type { LoanRequest } from "@/lib/stellar/loanRegistry";
import styles from "./LoanCard.module.css";

interface LoanCardProps {
  loan: LoanRequest;
  onSelect: (loanId: number) => void;
}

/**
 * Rendered as a `div[role="button"]`, not a native `<button>` —
 * `AddressChip`'s own copy button would otherwise nest one
 * interactive element inside another (invalid HTML, and a click on
 * "copy" would also trigger navigation). This card shows the
 * borrower address as plain truncated text instead; the full
 * copy-enabled `AddressChip` is used on the (non-nested) Loan Details
 * view.
 */
export function LoanCard({ loan, onSelect }: LoanCardProps) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(loan.loanId);
    }
  }

  return (
    <div
      className={styles.card}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(loan.loanId)}
      onKeyDown={handleKeyDown}
      aria-label={`View loan ${loan.loanId}`}
    >
      <div className={styles.top}>
        <span className={styles.loanId}>Loan #{loan.loanId}</span>
        <LoanStatusBadge status={loan.status} />
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Borrower</span>
        <span className={styles.value} title={loan.borrower}>
          {truncateStellarAddress(loan.borrower)}
        </span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Amount</span>
        <span className={styles.amount}>
          {loan.amount.toString()}
          <span className={styles.unit}>units</span>
        </span>
      </div>
    </div>
  );
}
