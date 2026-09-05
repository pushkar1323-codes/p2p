"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { AddressChip } from "@/components/ui/AddressChip";
import { PlusIcon, CancelActionIcon, CheckCircleIcon } from "@/components/ui/icons";
import { TransactionFeedback } from "@/components/transaction/TransactionFeedback";
import { contractWriteStatusToFeedbackStatus } from "@/components/transaction/contractWriteFeedback";
import { testnetExplorerUrl } from "@/lib/stellar/transaction";
import { useLoanRegistryWrite } from "@/hooks/useLoanRegistryWrite";
import { reportConfirmedLoanEvent } from "@/lib/backend/eventsApi";
import { stellarConfig } from "@/config/stellar";
import type { LoanRegistryEvent } from "@/lib/stellar/loanRegistryEvents";
import type { WalletStatus } from "@/lib/wallet/types";
import styles from "./LoanRequestActions.module.css";

type Mode = "create" | "cancel";

interface LoanRequestActionsProps {
  walletStatus: WalletStatus;
  address: string | null;
  /** Called after any successful create/cancel, so the caller can
   *  refresh the shared loan count. */
  onSuccess?: () => void;
  /**
   * Called once per successful write with the contract's own decoded
   * `created`/`cancelled` event (L2-P08), so a sibling component
   * (e.g. Loan Lookup) can synchronize if it happens to be showing
   * the affected loan. Not called if the event couldn't be decoded —
   * there is nothing real to report in that case.
   */
  onEvent?: (event: LoanRegistryEvent) => void;
}

/**
 * `useLoanRegistryWrite` intentionally shares one idle/pending/
 * success/failure state across both `createLoanRequest` and
 * `cancelLoanRequest` (see CURRENT_STATUS.md — L2-P06 decision). This
 * component reflects that honestly with a single segmented Create /
 * Cancel panel and one shared feedback area below, rather than two
 * independent-looking forms that would imply independent state.
 */
export function LoanRequestActions({ walletStatus, address, onSuccess, onEvent }: LoanRequestActionsProps) {
  const [mode, setMode] = useState<Mode>("create");
  const [amount, setAmount] = useState("");
  const [cancelLoanId, setCancelLoanId] = useState("");

  const connected = walletStatus === "connected";
  const write = useLoanRegistryWrite(connected ? address : null);
  const { status, txHash, result, error, createLoanRequest, cancelLoanRequest, reset } = write;

  const pending = status === "pending";

  // Notifies the parent exactly once per successful write that
  // produced a decoded event — a ref (not state) tracks which txHash
  // was already reported, so this doesn't re-fire on unrelated
  // re-renders and doesn't require onEvent to be stable/memoized.
  // FCP-03: the same guard also reports the event to the backend's
  // history API exactly once — see reportConfirmedLoanEvent's doc
  // comment for why this is the only place either backend table gets
  // written to, and why a failure there is fire-and-forget (logged,
  // never surfaced here — the on-chain write already succeeded).
  const reportedTxHashRef = useRef<string | null>(null);
  useEffect(() => {
    if (status !== "success" || !txHash || !result?.event) return;
    if (reportedTxHashRef.current === txHash) return;
    reportedTxHashRef.current = txHash;
    onEvent?.(result.event);
    void reportConfirmedLoanEvent({
      txHash,
      event: result.event,
      network: stellarConfig.network,
      contractId: stellarConfig.loanRegistryContractId,
    });
  }, [status, txHash, result, onEvent]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    await createLoanRequest(amount.trim());
    onSuccess?.();
  }

  async function handleCancel(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const id = Number(cancelLoanId.trim());
    await cancelLoanRequest(id);
    onSuccess?.();
  }

  function switchMode(next: Mode) {
    if (pending) return;
    setMode(next);
    reset();
  }

  return (
    <Card>
      <CardHeader
        icon={mode === "create" ? <PlusIcon width={18} height={18} /> : <CancelActionIcon width={18} height={18} />}
        title="Loan Actions"
        description="Create or cancel a loan request on the loan_registry contract."
      />

      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "create"}
          className={`${styles.tab} ${mode === "create" ? styles.tabActive : ""}`}
          onClick={() => switchMode("create")}
        >
          Create Loan Request
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "cancel"}
          className={`${styles.tab} ${mode === "cancel" ? styles.tabActive : ""}`}
          onClick={() => switchMode("cancel")}
        >
          Cancel Loan Request
        </button>
      </div>

      {!connected ? (
        <p className={styles.disabledText}>
          Connect your wallet to create or cancel loan requests.
        </p>
      ) : mode === "create" ? (
        <form className={styles.form} onSubmit={handleCreate}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="loan-amount">
              Amount
            </label>
            <input
              id="loan-amount"
              className={styles.input}
              type="text"
              inputMode="numeric"
              placeholder="500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={pending}
              autoComplete="off"
            />
            <span className={styles.hint}>
              Whole number, in the loan_registry contract&apos;s own units (not yet scaled to
              XLM/stroops — see the contract&apos;s asset-agnostic design).
            </span>
          </div>
          <button type="submit" className={styles.primaryButton} disabled={pending}>
            {pending ? "Submitting…" : "Create Loan Request"}
          </button>
        </form>
      ) : (
        <form className={styles.form} onSubmit={handleCancel}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="cancel-loan-id">
              Loan ID
            </label>
            <input
              id="cancel-loan-id"
              className={styles.input}
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={cancelLoanId}
              onChange={(e) => setCancelLoanId(e.target.value)}
              disabled={pending}
              autoComplete="off"
            />
            <span className={styles.hint}>
              Only the wallet that created this loan request can cancel it — the contract
              enforces this, this form does not.
            </span>
          </div>
          <button type="submit" className={styles.dangerButton} disabled={pending}>
            {pending ? "Submitting…" : "Cancel Loan Request"}
          </button>
        </form>
      )}

      {connected && status !== "idle" && (
        <div className={styles.feedback}>
          <TransactionFeedback
            status={contractWriteStatusToFeedbackStatus(status)}
            hash={txHash}
            // TransactionFeedback's `error` prop is typed as
            // TransferError (its `code` union is transfer-specific);
            // it only ever reads `.message`, never `.code`, so the
            // code here is remapped to a valid TransferErrorCode
            // purely to satisfy that type — the real
            // ContractWriteErrorCode (e.g. "SIMULATION_FAILED") isn't
            // lost anywhere else, since this component never inspects
            // `error.code` itself either.
            error={error ? { code: "UNKNOWN", message: error.message } : null}
            explorerUrl={txHash ? testnetExplorerUrl(txHash) : null}
            messages={{
              submitted: mode === "create" ? "Creating your loan request…" : "Cancelling your loan request…",
              confirmed:
                mode === "create" && result?.loanId !== null && result?.loanId !== undefined
                  ? `Loan request created — ID ${result.loanId}.`
                  : "Loan request cancelled.",
            }}
          />

          {status === "success" && result?.event && (
            <p className={styles.eventConfirmation}>
              <CheckCircleIcon width={14} height={14} />
              <span>
                Confirmed by the contract&apos;s own <code>{result.event.kind}</code> event — loan #
                {result.event.loanId}
                {result.event.kind === "created" ? `, amount ${result.event.amount.toString()}` : ""}, borrower{" "}
                <AddressChip address={result.event.borrower} visibleChars={4} />
              </span>
            </p>
          )}
          {status === "success" && !result?.event && (
            <p className={styles.eventMissingNotice}>
              The transaction was confirmed, but its on-chain event could not be decoded for
              display here — this doesn&apos;t affect whether the loan request itself succeeded.
            </p>
          )}

          {status === "success" && (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                setAmount("");
                setCancelLoanId("");
                reset();
              }}
            >
              {mode === "create" ? "Create another" : "Done"}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
