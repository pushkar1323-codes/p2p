"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddressChip } from "@/components/ui/AddressChip";
import { RealtimeStatusBadge } from "@/components/realtime/RealtimeStatusBadge";
import { ActivityIcon, PlusIcon, CancelActionIcon } from "@/components/ui/icons";
import { useContractEventStream } from "@/hooks/useContractEventStream";
import { contractEventUpdateToLoanRegistryEvent } from "@/lib/realtime/loanRegistryRealtime";
import { stellarConfig } from "@/config/stellar";
import type { ContractEventUpdate } from "@/lib/realtime/types";
import styles from "./ActivitySection.module.css";

const MAX_ACTIVITY_ITEMS = 50;

/**
 * Activity — a live feed of real `loan_registry` events, sourced
 * directly from the SSE stream (`useContractEventStream`), for the
 * lifetime of this page being open. Deliberately session-scoped, not
 * backed by the backend's persisted history — that's what
 * `TransactionsSection` is for. Showing the same data twice with two
 * different "is this really working" stories would be more confusing
 * than one honest live feed plus one honest historical query.
 */
export function ActivitySection() {
  const realtime = useContractEventStream();
  const [items, setItems] = useState<ContractEventUpdate[]>([]);
  const lastHandledRef = useRef<ContractEventUpdate | null>(null);

  useEffect(() => {
    if (!realtime.lastUpdate || realtime.lastUpdate === lastHandledRef.current) return;
    lastHandledRef.current = realtime.lastUpdate;
    const update = realtime.lastUpdate;
    const timer = setTimeout(() => {
      setItems((prev) => [update, ...prev].slice(0, MAX_ACTIVITY_ITEMS));
    }, 0);
    return () => clearTimeout(timer);
  }, [realtime.lastUpdate]);

  return (
    <Card>
      <CardHeader
        icon={<ActivityIcon width={18} height={18} />}
        title="Live Activity"
        description="Real loan_registry events, as they happen, for as long as this page stays open."
        action={<RealtimeStatusBadge status={realtime.status} />}
      />

      {items.length === 0 && (realtime.status === "connecting" || realtime.status === "reconnecting") && (
        <p className={styles.connectingHint}>Connecting to the live event stream…</p>
      )}

      {items.length === 0 && realtime.status === "open" && (
        <EmptyState
          icon={<ActivityIcon width={20} height={20} />}
          title="No activity yet"
          description="Real events (loan created, loan cancelled) will appear here the moment they happen."
        />
      )}

      {items.length === 0 && realtime.status === "closed" && (
        <EmptyState
          icon={<ActivityIcon width={20} height={20} />}
          title="Live connection unavailable"
          description="The real-time event stream couldn't be reached. Reload the page to try again — this doesn't affect wallet or loan actions."
        />
      )}

      {items.length > 0 && (
        <ul className={styles.list}>
          {items.map((item, index) => (
            <ActivityRow key={`${item.transactionHash}-${item.eventType}-${index}`} update={item} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ActivityRow({ update }: { update: ContractEventUpdate }) {
  const decoded = contractEventUpdateToLoanRegistryEvent(update, stellarConfig.loanRegistryContractId);
  const time = new Date(update.occurredAt);
  const timeLabel = Number.isNaN(time.getTime()) ? null : time.toLocaleTimeString();

  return (
    <li className={styles.row}>
      <span className={`${styles.iconBadge} ${update.eventType === "cancelled" ? styles.iconBadgeMuted : ""}`}>
        {update.eventType === "cancelled" ? (
          <CancelActionIcon width={14} height={14} />
        ) : (
          <PlusIcon width={14} height={14} />
        )}
      </span>
      <div className={styles.rowBody}>
        {decoded ? (
          <p className={styles.rowText}>
            Loan #{decoded.loanId} {decoded.kind === "created" ? "created" : "cancelled"} by{" "}
            <AddressChip address={decoded.borrower} visibleChars={4} />
            {decoded.kind === "created" && <> for {decoded.amount.toString()} units</>}
          </p>
        ) : (
          <p className={styles.rowText}>
            <code className={styles.eventTypeCode}>{update.eventType}</code> event on contract{" "}
            <AddressChip address={update.contractId} visibleChars={4} />
          </p>
        )}
      </div>
      {timeLabel && <span className={styles.rowTime}>{timeLabel}</span>}
    </li>
  );
}
