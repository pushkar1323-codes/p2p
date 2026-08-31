"use client";

import { LoanIcon, RefreshIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import type { UseLoanCountResult } from "@/hooks/useLoanCount";
import { SummaryCard } from "./SummaryCard";
import styles from "./ActionFooter.module.css";

interface LoanCountCardProps {
  loanCount: UseLoanCountResult;
}

export function LoanCountCard({ loanCount }: LoanCountCardProps) {
  const { status, data, error, refresh } = loanCount;

  return (
    <SummaryCard
      label="Loan Requests"
      icon={<LoanIcon width={18} height={18} />}
      tone="green"
      footer={
        status !== "loading" && (
          <button type="button" className={styles.footerLink} onClick={refresh}>
            <RefreshIcon width={13} height={13} />
            Refresh
          </button>
        )
      }
    >
      {status === "loading" && <Spinner size="sm" label="Loading…" />}
      {status === "loaded" && data !== null && (
        <>{data.toLocaleString()}</>
      )}
      {status === "error" && (
        <span className={styles.errorValue}>{error?.message ?? "Unable to load loan count."}</span>
      )}
      {status === "idle" && <span className={styles.mutedValue}>—</span>}
    </SummaryCard>
  );
}
