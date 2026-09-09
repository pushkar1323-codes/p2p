"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { AddressChip } from "@/components/ui/AddressChip";
import { RealtimeStatusBadge } from "@/components/realtime/RealtimeStatusBadge";
import { LoanStatusBadge } from "@/components/loans/LoanStatusBadge";
import { FundLoanAction } from "@/components/loans/FundLoanAction";
import { ArrowLeftIcon, SearchIcon, RefreshIcon, CheckCircleIcon } from "@/components/ui/icons";
import { TransactionFeedback } from "@/components/transaction/TransactionFeedback";
import { contractWriteStatusToFeedbackStatus } from "@/components/transaction/contractWriteFeedback";
import { testnetExplorerUrl } from "@/lib/stellar/transaction";
import { useLoanRequest } from "@/hooks/useLoanRequest";
import { useLoanRegistryWrite } from "@/hooks/useLoanRegistryWrite";
import { useFunding } from "@/hooks/useFunding";
import { useContractEventStream } from "@/hooks/useContractEventStream";
import { contractEventUpdateToLoanRegistryEvent } from "@/lib/realtime/loanRegistryRealtime";
import { reportConfirmedLoanEvent } from "@/lib/backend/eventsApi";
import { canFundLoan } from "@/lib/stellar/loanRegistryErrors";
import { stellarConfig } from "@/config/stellar";
import type { UseWalletResult } from "@/hooks/useWallet";
import type { ContractEventUpdate } from "@/lib/realtime/types";
import styles from "./LoanDetailSection.module.css";

interface LoanDetailSectionProps {
  loanId: number;
  wallet: UseWalletResult;
  onBack: () => void;
}

/**
 * Loan Details — a real, single-loan view reached by clicking a card
 * in Browse Loans/My Loans (or, indirectly, the Loan Registry
 * section's own raw ID lookup stays untouched as a separate,
 * lighter-weight tool). Unlike Loan Lookup, this page's actions are
 * state-aware: it only ever offers an action the contract would
 * actually accept, rather than a generic "cancel by ID" form.
 *
 * Funding (L3-P12 correction): a connected wallet that is NOT this
 * loan's borrower sees a real Fund Loan action once the loan is
 * `Open` — `FundLoanAction`, a genuine wallet-signed
 * `fund_loan(lender, loan_id, token, amount)` transaction, exact-full
 * funding only, never editable, never shown as succeeded before the
 * transaction actually confirms. Once `Funded`, this page reads and
 * displays the real funding record via `get_funding` (`useFunding`
 * below) rather than inferring it from local state.
 */
export function LoanDetailSection({ loanId, wallet, onBack }: LoanDetailSectionProps) {
  const { status, data, error, refresh } = useLoanRequest(loanId);
  const [justSynced, setJustSynced] = useState(false);

  const connected = wallet.status === "connected";
  const write = useLoanRegistryWrite(connected ? wallet.address : null);
  const funding = useFunding(data?.status === "Funded" ? loanId : null);

  // Own SSE subscription (this section isn't nested inside
  // LoanRegistrySection) — same event-driven re-read pattern as
  // LoanLookup's `syncSignal`, just self-contained instead of fed via
  // a prop, since Loan Details is reached from a different parent
  // each time (Browse Loans vs My Loans).
  const realtime = useContractEventStream();
  const lastHandledUpdateRef = useRef<ContractEventUpdate | null>(null);
  useEffect(() => {
    if (!realtime.lastUpdate || realtime.lastUpdate === lastHandledUpdateRef.current) return;
    lastHandledUpdateRef.current = realtime.lastUpdate;
    const event = contractEventUpdateToLoanRegistryEvent(
      realtime.lastUpdate,
      stellarConfig.loanRegistryContractId,
    );
    if (!event || event.loanId !== loanId) return;
    const showTimer = setTimeout(() => {
      refresh();
      setJustSynced(true);
    }, 0);
    const hideTimer = setTimeout(() => setJustSynced(false), 4000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [realtime.lastUpdate, loanId, refresh]);

  async function handleCancel() {
    if (write.status === "pending") return;
    await write.cancelLoanRequest(loanId);
    refresh();
  }

  // FCP-03: reports a successful cancel to the backend's history API
  // exactly once per confirmed transaction — same guarded-by-txHash
  // pattern as LoanRequestActions.tsx's own reporting effect (and the
  // same reasoning: fire-and-forget, since the on-chain cancellation
  // already succeeded by the time this runs).
  const reportedTxHashRef = useRef<string | null>(null);
  useEffect(() => {
    if (write.status !== "success" || !write.txHash || !write.result?.event) return;
    if (reportedTxHashRef.current === write.txHash) return;
    reportedTxHashRef.current = write.txHash;
    void reportConfirmedLoanEvent({
      txHash: write.txHash,
      event: write.result.event,
      network: stellarConfig.network,
      contractId: stellarConfig.loanRegistryContractId,
    });
  }, [write.status, write.txHash, write.result]);

  const notFound = status === "error" && error?.code === "LOAN_NOT_FOUND";
  const isBorrower = connected && data?.borrower === wallet.address;
  const canCancel = isBorrower && data?.status === "Open";
  const isOtherPartyOpenLoan = data ? canFundLoan(data.status, isBorrower) : false;

  return (
    <div>
      <button type="button" className={styles.backButton} onClick={onBack}>
        <ArrowLeftIcon width={16} height={16} />
        Back
      </button>

      <Card>
        <CardHeader
          icon={<SearchIcon width={18} height={18} />}
          title={`Loan #${loanId}`}
          description="Real-time details for this loan request on the loan_registry contract."
          action={
            <div className={styles.headerActions}>
              {justSynced && (
                <span className={styles.syncBadge}>
                  <RefreshIcon width={12} height={12} />
                  Updated from on-chain event
                </span>
              )}
              <RealtimeStatusBadge status={realtime.status} />
            </div>
          }
        />

        {status === "loading" && (
          <div className={styles.loadingRow}>
            <Spinner label="Reading loan request…" />
          </div>
        )}

        {notFound && (
          <EmptyState
            icon={<SearchIcon width={20} height={20} />}
            title={`No loan request found with ID ${loanId}`}
            description="This loan may not exist, or the ID was mistyped."
          />
        )}

        {status === "error" && !notFound && error && (
          <ErrorState
            message={error.message}
            action={
              <button type="button" className={styles.retryButton} onClick={refresh}>
                <RefreshIcon width={14} height={14} />
                Try again
              </button>
            }
          />
        )}

        {status === "loaded" && data && (
          <>
            <dl className={styles.details}>
              <div className={styles.detailRow}>
                <dt>Loan ID</dt>
                <dd>{data.loanId}</dd>
              </div>
              <div className={styles.detailRow}>
                <dt>Borrower</dt>
                <dd>
                  <AddressChip address={data.borrower} />
                  {isBorrower && <span className={styles.youTag}>You</span>}
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
              {data.status === "Funded" && funding.status === "loaded" && funding.data && (
                <>
                  <div className={styles.detailRow}>
                    <dt>Lender</dt>
                    <dd>
                      <AddressChip address={funding.data.lender} />
                    </dd>
                  </div>
                  <div className={styles.detailRow}>
                    <dt>Funded amount</dt>
                    <dd>
                      {funding.data.amount.toString()}
                      <span className={styles.unitNote}>contract units</span>
                    </dd>
                  </div>
                </>
              )}
              {data.status === "Funded" && funding.status === "loading" && (
                <div className={styles.detailRow}>
                  <dt>Funding record</dt>
                  <dd>
                    <Spinner label="Loading…" />
                  </dd>
                </div>
              )}
              {data.status === "Funded" && funding.status === "error" && funding.error && (
                <div className={styles.detailRow}>
                  <dt>Funding record</dt>
                  <dd className={styles.fundingErrorText}>
                    {funding.error.message}{" "}
                    <button type="button" className={styles.retryButton} onClick={funding.refresh}>
                      <RefreshIcon width={12} height={12} />
                      Retry
                    </button>
                  </dd>
                </div>
              )}
            </dl>

            <div className={styles.actions}>
              {canCancel && (
                <>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={handleCancel}
                    disabled={write.status === "pending"}
                  >
                    {write.status === "pending" ? "Cancelling…" : "Cancel This Loan"}
                  </button>

                  {write.status !== "idle" && (
                    <div className={styles.feedback}>
                      <TransactionFeedback
                        status={contractWriteStatusToFeedbackStatus(write.status)}
                        hash={write.txHash}
                        error={write.error ? { code: "UNKNOWN", message: write.error.message } : null}
                        explorerUrl={write.txHash ? testnetExplorerUrl(write.txHash) : null}
                        messages={{
                          submitted: "Cancelling this loan request…",
                          confirmed: "Loan request cancelled.",
                        }}
                      />
                      {write.status === "success" && (
                        <p className={styles.eventConfirmation}>
                          <CheckCircleIcon width={14} height={14} />
                          Confirmed by the contract&apos;s own event.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {data.status === "Open" && !connected && (
                <p className={styles.hint}>Connect your wallet to see available actions for this loan.</p>
              )}

              {isOtherPartyOpenLoan && wallet.address && (
                <FundLoanAction
                  loanId={loanId}
                  amount={data.amount}
                  token={stellarConfig.nativeXlmSacContractId}
                  lenderAddress={wallet.address}
                  write={write}
                  onFunded={refresh}
                />
              )}

              {data.status === "Cancelled" && <p className={styles.hint}>This loan request was cancelled — it&apos;s in its final state.</p>}
              {data.status === "Funded" && <p className={styles.hint}>This loan has already been funded — it&apos;s in its final state.</p>}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
