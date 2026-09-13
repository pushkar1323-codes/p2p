"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { AddressChip } from "@/components/ui/AddressChip";
import { ErrorState } from "@/components/ui/ErrorState";
import { PlusIcon, CheckCircleIcon, UserIcon, RefreshIcon } from "@/components/ui/icons";
import { TransactionFeedback } from "@/components/transaction/TransactionFeedback";
import { contractWriteStatusToFeedbackStatus } from "@/components/transaction/contractWriteFeedback";
import { testnetExplorerUrl } from "@/lib/stellar/transaction";
import { useLoanRegistryWrite } from "@/hooks/useLoanRegistryWrite";
import { useIsBorrowerEligible, retryEligibilityRefreshOnce } from "@/hooks/useIsBorrowerEligible";
import { RegisterWalletAction } from "./RegisterWalletAction";
import { resolveLoanRequestView } from "./loanRequestView";
import { reportConfirmedLoanEvent } from "@/lib/backend/eventsApi";
import { stellarConfig } from "@/config/stellar";
import type { LoanRegistryEvent } from "@/lib/stellar/loanRegistryEvents";
import type { WalletStatus } from "@/lib/wallet/types";
import styles from "./LoanRequestActions.module.css";

interface LoanRequestActionsProps {
  walletStatus: WalletStatus;
  address: string | null;
  /** Called after a successful create, so the caller can refresh the
   *  shared loan count. */
  onSuccess?: () => void;
  /**
   * Called once per successful write with the contract's own decoded
   * `created` event, so a sibling component (e.g. Loan Lookup) can
   * synchronize if it happens to be showing the affected loan. Not
   * called if the event couldn't be decoded — there is nothing real
   * to report in that case.
   */
  onEvent?: (event: LoanRegistryEvent) => void;
}

/**
 * Create-only loan request form, gated on eligibility: a connected
 * wallet that isn't yet eligible sees `RegisterWalletAction` instead
 * of this form — a real, separate, wallet-signed transaction against
 * `eligibility_registry`, not a frontend-only bypass of the on-chain
 * check `create_loan_request` still performs.
 *
 * Cancelling a loan is only available from Loan Details, not from
 * here. A separate cancel-by-ID form here would duplicate that
 * state-aware cancel action without any of its safeguards — it would
 * accept any ID regardless of whether the loan is actually open or
 * owned by the connected wallet, relying purely on the contract to
 * reject it. One state-aware cancel path avoids the confusion of two
 * differently-behaved ways to cancel the same loan.
 */
export function LoanRequestActions({ walletStatus, address, onSuccess, onEvent }: LoanRequestActionsProps) {
  const [amount, setAmount] = useState("");

  const connected = walletStatus === "connected";
  const eligibility = useIsBorrowerEligible(connected ? address : null);
  const write = useLoanRegistryWrite(connected ? address : null);
  const { status, txHash, result, error, createLoanRequest, reset } = write;

  const pending = status === "pending";

  // Notifies the parent exactly once per successful write that
  // produced a decoded event — a ref (not state) tracks which txHash
  // was already reported, so this doesn't re-fire on unrelated
  // re-renders and doesn't require onEvent to be stable/memoized.
  // The same guard also reports the event to the backend's history
  // API exactly once — see reportConfirmedLoanEvent's doc comment for
  // why this is the only place either backend table gets written to,
  // and why a failure there is fire-and-forget (logged, never
  // surfaced here — the on-chain write already succeeded).
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

  /**
   * Passed to `RegisterWalletAction` as `onRegistered` — called right
   * after a registration attempt (success OR failure; see that
   * component's own comment on why it's unconditional). Delegates the
   * actual bounded-retry policy to `retryEligibilityRefreshOnce` (see
   * its doc comment in `eligibilityRetry.ts` for the full
   * reasoning and why it's deliberately bounded to one retry).
   */
  function handleRegistered() {
    void retryEligibilityRefreshOnce(eligibility.refresh);
  }

  const view = resolveLoanRequestView(connected, eligibility.status, eligibility.data);

  return (
    <Card>
      <CardHeader
        icon={
          view === "register" ? (
            <UserIcon width={18} height={18} />
          ) : (
            <PlusIcon width={18} height={18} />
          )
        }
        title={view === "register" ? "Register Wallet" : "Create Loan Request"}
        description={
          view === "register"
            ? "One-time self-registration required by the loan_registry contract's Eligibility Registry."
            : "Create a new loan request on the loan_registry contract."
        }
      />

      {view === "connect" ? (
        <p className={styles.disabledText}>Connect your wallet to create a loan request.</p>
      ) : view === "loading" ? (
        <p className={styles.disabledText}>Checking your wallet&apos;s eligibility…</p>
      ) : view === "error" ? (
        <ErrorState
          message={`Couldn't check this wallet's eligibility: ${eligibility.error?.message ?? ""}`}
          action={
            <button
              type="button"
              className={styles.retryButton}
              onClick={eligibility.refresh}
            >
              <RefreshIcon width={14} height={14} />
              Try again
            </button>
          }
        />
      ) : view === "register" && address ? (
        <RegisterWalletAction address={address} onRegistered={handleRegistered} />
      ) : (
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
      )}

      {connected && status !== "idle" && (
        <div className={styles.feedback}>
          <TransactionFeedback
            status={contractWriteStatusToFeedbackStatus(status, error)}
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
              submitted: "Creating your loan request…",
              confirmed:
                result?.loanId !== null && result?.loanId !== undefined
                  ? `Loan request created — ID ${result.loanId}.`
                  : "Loan request created.",
            }}
          />

          {status === "success" && result?.event && (
            <p className={styles.eventConfirmation}>
              <CheckCircleIcon width={14} height={14} />
              <span>
                Confirmed by the contract&apos;s own <code>{result.event.kind}</code> event — loan #
                {result.event.loanId}
                {result.event.kind === "created" && `, amount ${result.event.amount.toString()}`}
                {result.event.kind !== "funded" && (
                  <>
                    , borrower <AddressChip address={result.event.borrower} visibleChars={4} />
                  </>
                )}
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
                reset();
              }}
            >
              Create another
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
