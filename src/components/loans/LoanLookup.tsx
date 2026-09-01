"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { AddressChip } from "@/components/ui/AddressChip";
import { SearchIcon, AlertIcon, LoanIcon, RefreshIcon } from "@/components/ui/icons";
import { useLoanRequest } from "@/hooks/useLoanRequest";
import type { LoanRegistryEvent } from "@/lib/stellar/loanRegistryEvents";
import { LoanStatusBadge } from "./LoanStatusBadge";
import styles from "./LoanLookup.module.css";

/** A non-negative integer loan id, e.g. "0", "12". */
const LOAN_ID_PATTERN = /^\d+$/;

interface LoanLookupProps {
  /**
   * The most recent confirmed `create`/`cancel` event from
   * `LoanRequestActions` (L2-P08), if any. When it names the loan
   * currently shown here, this component re-reads that loan from the
   * contract automatically — genuine event-driven sync, not a
   * polling loop, and it does nothing when no loan is being viewed or
   * the event is about a different loan.
   */
  syncSignal?: LoanRegistryEvent | null;
}

export function LoanLookup({ syncSignal }: LoanLookupProps) {
  const [input, setInput] = useState("");
  const [loanId, setLoanId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [justSynced, setJustSynced] = useState(false);

  const { status, data, error, refresh } = useLoanRequest(loanId);

  // Re-reads the currently-viewed loan when a create/cancel event for
  // that exact loan id comes in from the sibling Loan Actions panel.
  // Guarded by object identity (via the ref) so this only fires once
  // per new event, not on every render.
  const handledSignalRef = useRef<LoanRegistryEvent | null>(null);
  useEffect(() => {
    if (!syncSignal || syncSignal === handledSignalRef.current) return;
    handledSignalRef.current = syncSignal;
    if (loanId === null || syncSignal.loanId !== loanId) return;
    refresh();
    // setState is deferred (rather than called synchronously in the
    // effect body) per the react-hooks/set-state-in-effect rule —
    // this still shows/hides within the same tick for the user, just
    // not as a same-render cascading update.
    const showTimer = setTimeout(() => setJustSynced(true), 0);
    const hideTimer = setTimeout(() => setJustSynced(false), 4000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [syncSignal, loanId, refresh]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!LOAN_ID_PATTERN.test(trimmed)) {
      setFormError("Enter a whole number loan ID (0 or greater).");
      return;
    }
    setFormError(null);
    const nextId = Number(trimmed);
    if (nextId === loanId) {
      refresh();
    } else {
      setLoanId(nextId);
    }
  }

  const notFound = status === "error" && error?.code === "LOAN_NOT_FOUND";

  return (
    <Card>
      <CardHeader
        icon={<SearchIcon width={18} height={18} />}
        title="Loan Lookup"
        description="Read a loan request directly from the deployed loan_registry contract."
        action={
          justSynced ? (
            <span className={styles.syncBadge}>
              <RefreshIcon width={12} height={12} />
              Updated from on-chain event
            </span>
          ) : undefined
        }
      />

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="loan-lookup-id">
            Loan ID
          </label>
          <input
            id="loan-lookup-id"
            className={styles.input}
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={status === "loading"}
            autoComplete="off"
          />
        </div>
        <button type="submit" className={styles.button} disabled={status === "loading"}>
          {status === "loading" ? "Reading…" : "Read Loan"}
        </button>
      </form>

      {formError && <p className={styles.formError}>{formError}</p>}

      <div className={styles.result}>
        {loanId === null && (
          <EmptyState
            icon={<LoanIcon width={20} height={20} />}
            title="No loan looked up yet"
            description="Enter a loan ID above to view its borrower, amount and status."
          />
        )}

        {loanId !== null && status === "loading" && (
          <div className={styles.loadingRow}>
            <Spinner label="Reading loan request…" />
          </div>
        )}

        {status === "loaded" && data && (
          <dl className={styles.details}>
            <div className={styles.detailRow}>
              <dt>Loan ID</dt>
              <dd>{data.loanId}</dd>
            </div>
            <div className={styles.detailRow}>
              <dt>Borrower</dt>
              <dd>
                <AddressChip address={data.borrower} />
              </dd>
            </div>
            <div className={styles.detailRow}>
              <dt>Amount</dt>
              <dd>
                {data.amount.toString()}
                <span className={styles.unitNote}>contract units</span>
              </dd>
            </div>
            <div className={styles.detailRow}>
              <dt>Status</dt>
              <dd>
                <LoanStatusBadge status={data.status} />
              </dd>
            </div>
          </dl>
        )}

        {notFound && (
          <EmptyState
            icon={<SearchIcon width={20} height={20} />}
            title={`No loan request found with ID ${loanId}`}
            description="Check the ID and try again."
          />
        )}

        {status === "error" && !notFound && error && (
          <div className={styles.errorBox}>
            <AlertIcon width={16} height={16} />
            <span>{error.message}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
