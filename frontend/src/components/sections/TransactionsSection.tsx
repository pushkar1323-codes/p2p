"use client";

import { useEffect, useRef } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { ClockIcon, RefreshIcon } from "@/components/ui/icons";
import { useLoanEventHistory } from "@/hooks/useLoanEventHistory";
import { useContractEventStream } from "@/hooks/useContractEventStream";
import { testnetExplorerUrl } from "@/lib/stellar/transaction";
import { stellarConfig } from "@/config/stellar";
import type { ContractEventUpdate } from "@/lib/realtime/types";
import styles from "./TransactionsSection.module.css";

function loanIdFromPayload(payload: unknown): number | null {
  if (typeof payload !== "object" || payload === null) return null;
  const loanId = (payload as Record<string, unknown>).loanId;
  return typeof loanId === "number" ? loanId : null;
}

/**
 * Transactions / History — the persisted counterpart to
 * `ActivitySection`'s live feed. Reads `GET /events` (FCP-03's
 * "minimal real backend history API"), the query side of the same
 * `contract_events` table `reportConfirmedLoanEvent` writes to after
 * every real create/cancel. Refreshes automatically on a new SSE
 * event too, so a page left open stays current without a manual
 * click, while still working from a plain page load with no SSE
 * connection at all.
 */
export function TransactionsSection() {
  const { status, data, error, refresh } = useLoanEventHistory(stellarConfig.loanRegistryContractId);
  const realtime = useContractEventStream();
  const lastHandledRef = useRef<ContractEventUpdate | null>(null);

  useEffect(() => {
    if (!realtime.lastUpdate || realtime.lastUpdate === lastHandledRef.current) return;
    lastHandledRef.current = realtime.lastUpdate;
    const timer = setTimeout(() => refresh(), 0);
    return () => clearTimeout(timer);
  }, [realtime.lastUpdate, refresh]);

  return (
    <Card>
      <CardHeader
        icon={<ClockIcon width={18} height={18} />}
        title="Transaction History"
        description="Real loan_registry events recorded by the backend — persisted, not just live."
        action={
          <button type="button" className={styles.refreshButton} onClick={refresh}>
            <RefreshIcon width={14} height={14} />
            Refresh
          </button>
        }
      />

      {status === "loading" && (
        <div className={styles.loadingRow}>
          <Spinner label="Loading transaction history…" />
        </div>
      )}

      {status === "error" && (
        <ErrorState
          message={error?.message ?? "Something went wrong loading transaction history."}
          action={
            <button type="button" className={styles.retryButton} onClick={refresh}>
              <RefreshIcon width={14} height={14} />
              Try again
            </button>
          }
        />
      )}

      {status === "loaded" && data && data.length === 0 && (
        <EmptyState
          icon={<ClockIcon width={20} height={20} />}
          title="No transactions recorded yet"
          description="Loan requests created or cancelled on this contract will appear here once recorded by the backend."
        />
      )}

      {status === "loaded" && data && data.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Event</th>
                <th>Loan</th>
                <th>Transaction</th>
                <th>Recorded</th>
              </tr>
            </thead>
            <tbody>
              {data.map((event) => (
                <tr key={event.id}>
                  <td>
                    <span
                      className={`${styles.eventBadge} ${
                        event.eventType === "cancelled" ? styles.eventBadgeMuted : ""
                      }`}
                    >
                      {event.eventType}
                    </span>
                  </td>
                  <td className={styles.mono}>{loanIdFromPayload(event.payload) ?? "—"}</td>
                  <td>
                    <a
                      className={styles.txLink}
                      href={testnetExplorerUrl(event.transactionHash)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {event.transactionHash.slice(0, 10)}…
                    </a>
                  </td>
                  <td className={styles.timeCell}>{new Date(event.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
