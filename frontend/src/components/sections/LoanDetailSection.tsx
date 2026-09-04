"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { AddressChip } from "@/components/ui/AddressChip";
import { RealtimeStatusBadge } from "@/components/realtime/RealtimeStatusBadge";
import { LoanStatusBadge } from "@/components/loans/LoanStatusBadge";
import { ArrowLeftIcon, SearchIcon, RefreshIcon, CheckCircleIcon } from "@/components/ui/icons";
import { TransactionFeedback } from "@/components/transaction/TransactionFeedback";
import { contractWriteStatusToFeedbackStatus } from "@/components/transaction/contractWriteFeedback";
import { testnetExplorerUrl } from "@/lib/stellar/transaction";
import { useLoanRequest } from "@/hooks/useLoanRequest";
import { useLoanRegistryWrite } from "@/hooks/useLoanRegistryWrite";
import { useContractEventStream } from "@/hooks/useContractEventStream";
import { contractEventUpdateToLoanRegistryEvent } from "@/lib/realtime/loanRegistryRealtime";
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
 * Funding is deliberately absent here, not shown-and-disabled — see
 * the note rendered for that exact case below. The currently
 * deployed Testnet `loan_registry` contract predates `fund_loan`
 * (L3-P12) — the local contract has it, the live one doesn't (see
 * `docs/CURRENT_STATUS.md`) — so there's nothing to real to call, and
 * FCP-02 explicitly says not to fake it.
 */
export function LoanDetailSection({ loanId, wallet, onBack }: LoanDetailSectionProps) {
  const { status, data, error, refresh } = useLoanRequest(loanId);
  const [justSynced, setJustSynced] = useState(false);

  const connected = wallet.status === "connected";
  const write = useLoanRegistryWrite(connected ? wallet.address : null);

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

  const notFound = status === "error" && error?.code === "LOAN_NOT_FOUND";
  const isBorrower = connected && data?.borrower === wallet.address;
  const canCancel = isBorrower && data?.status === "Open";
  const isOtherPartyOpenLoan = data?.status === "Open" && !isBorrower;

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

              {isOtherPartyOpenLoan && (
                <p className={styles.hint}>
                  Funding isn&apos;t available on this loan yet — the currently deployed Testnet contract
                  doesn&apos;t include lender funding. This will become available once an updated contract
                  is deployed.
                </p>
              )}

              {data.status === "Cancelled" && <p className={styles.hint}>This loan request was cancelled — it&apos;s in its final state.</p>}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
