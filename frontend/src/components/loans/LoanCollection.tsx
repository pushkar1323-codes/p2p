"use client";

import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { AlertIcon, RefreshIcon } from "@/components/ui/icons";
import { LoanCard } from "./LoanCard";
import type { ContractReadStatus } from "@/hooks/contractReadState";
import type { LoanRegistryError } from "@/lib/stellar/loanRegistry";
import type { LoanRequest } from "@/lib/stellar/loanRegistry";
import styles from "./LoanCollection.module.css";

interface LoanCollectionProps {
  status: ContractReadStatus;
  /** Already filtered/derived by the caller (e.g. My Loans' borrower filter) — this component only renders. */
  loans: LoanRequest[];
  /** Ids that failed to load individually on the underlying full scan (a soft partial failure). */
  failedIds: number[];
  error: LoanRegistryError | null;
  onSelect: (loanId: number) => void;
  onRefresh: () => void;
  emptyIcon: ReactNode;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
}

/**
 * Loading/empty/error/grid states for a loan list — shared by
 * `BrowseLoansSection` and `MyLoansSection` so both render
 * identically and neither duplicates this wiring (FCP-01's "shared
 * UI states" direction, extended here to loan lists specifically).
 */
export function LoanCollection({
  status,
  loans,
  failedIds,
  error,
  onSelect,
  onRefresh,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: LoanCollectionProps) {
  if (status === "loading" || status === "idle") {
    return (
      <div className={styles.loadingRow}>
        <Spinner label="Loading loan requests…" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <ErrorState
        message={error?.message ?? "Something went wrong loading loan requests."}
        action={
          <button type="button" className={styles.retryButton} onClick={onRefresh}>
            <RefreshIcon width={14} height={14} />
            Try again
          </button>
        }
      />
    );
  }

  if (status === "loaded" && loans.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div>
      {failedIds.length > 0 && (
        <div className={styles.partialFailureNotice}>
          <AlertIcon width={14} height={14} />
          <span>
            {failedIds.length === 1
              ? `Loan #${failedIds[0]} could not be loaded and is not shown below.`
              : `${failedIds.length} loans could not be loaded and are not shown below.`}
          </span>
        </div>
      )}
      <div className={styles.grid}>
        {loans.map((loan) => (
          <LoanCard key={loan.loanId} loan={loan} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
