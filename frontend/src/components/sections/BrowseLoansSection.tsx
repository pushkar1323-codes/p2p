"use client";

import { useEffect, useRef } from "react";
import { LoanCollection } from "@/components/loans/LoanCollection";
import { RealtimeStatusBadge } from "@/components/realtime/RealtimeStatusBadge";
import { LoanIcon, RefreshIcon } from "@/components/ui/icons";
import { useLoanRegistryList } from "@/hooks/useLoanRegistryList";
import { useContractEventStream } from "@/hooks/useContractEventStream";
import { contractEventUpdateToLoanRegistryEvent } from "@/lib/realtime/loanRegistryRealtime";
import { stellarConfig } from "@/config/stellar";
import type { ContractEventUpdate } from "@/lib/realtime/types";
import type { DashboardSection } from "@/components/layout/navigation";
import styles from "./LoanListSection.module.css";

interface BrowseLoansSectionProps {
  onSelectLoan: (loanId: number) => void;
  onNavigate: (section: DashboardSection) => void;
}

/**
 * "Browse Loans" — every real loan request currently on
 * `loan_registry`, via `useLoanRegistryList`'s client-side scan (see
 * that hook and `lib/stellar/loanRegistryList.ts` for why there's no
 * backend/indexed alternative yet). Auto-refreshes the whole list
 * when a real `created`/`cancelled` contract event arrives over SSE
 * — simplest correct approach for a scan-based list (patching one
 * card in place would still need a full re-read to know whether the
 * event changed sort order/visibility, so a full refresh isn't doing
 * meaningfully less work).
 */
export function BrowseLoansSection({ onSelectLoan, onNavigate }: BrowseLoansSectionProps) {
  // Destructured (not accessed as `list.refresh`) so `refresh`'s
  // identity is what the effect below actually depends on — same
  // convention as LoanLookup's `useLoanRequest()` destructuring.
  // (Accessing it as a property instead trips
  // react-hooks/exhaustive-deps into asking for the whole object.)
  const { status, data, error, refresh } = useLoanRegistryList();
  const realtime = useContractEventStream();

  const lastHandledUpdateRef = useRef<ContractEventUpdate | null>(null);
  useEffect(() => {
    if (!realtime.lastUpdate || realtime.lastUpdate === lastHandledUpdateRef.current) return;
    lastHandledUpdateRef.current = realtime.lastUpdate;
    const event = contractEventUpdateToLoanRegistryEvent(
      realtime.lastUpdate,
      stellarConfig.loanRegistryContractId,
    );
    if (!event) return;
    // Deferred per the react-hooks/set-state-in-effect rule — same
    // convention as LoanRegistrySection/LoanLookup's own event-driven
    // refreshes.
    const timer = setTimeout(() => refresh(), 0);
    return () => clearTimeout(timer);
  }, [realtime.lastUpdate, refresh]);

  const loans = data?.loans ?? [];
  const failedIds = data?.failedIds ?? [];

  return (
    <div>
      <div className={styles.headerRow}>
        <RealtimeStatusBadge status={realtime.status} />
        <button type="button" className={styles.refreshButton} onClick={refresh}>
          <RefreshIcon width={14} height={14} />
          Refresh
        </button>
      </div>

      <LoanCollection
        status={status}
        loans={loans}
        failedIds={failedIds}
        error={error}
        onSelect={onSelectLoan}
        onRefresh={refresh}
        emptyIcon={<LoanIcon width={20} height={20} />}
        emptyTitle="No loan requests yet"
        emptyDescription="Nobody has created a loan request on this contract yet."
        emptyAction={
          <button type="button" className={styles.emptyActionButton} onClick={() => onNavigate("loans")}>
            Create the first loan request
          </button>
        }
      />
    </div>
  );
}
