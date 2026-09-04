"use client";

import { useEffect, useRef } from "react";
import { LoanCollection } from "@/components/loans/LoanCollection";
import { RealtimeStatusBadge } from "@/components/realtime/RealtimeStatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { UserIcon, RefreshIcon, WalletIcon } from "@/components/ui/icons";
import { useLoanRegistryList } from "@/hooks/useLoanRegistryList";
import { useContractEventStream } from "@/hooks/useContractEventStream";
import { contractEventUpdateToLoanRegistryEvent } from "@/lib/realtime/loanRegistryRealtime";
import { filterLoansByBorrower } from "@/lib/stellar/loanRegistryList";
import { stellarConfig } from "@/config/stellar";
import type { ContractEventUpdate } from "@/lib/realtime/types";
import type { UseWalletResult } from "@/hooks/useWallet";
import type { DashboardSection } from "@/components/layout/navigation";
import styles from "./LoanListSection.module.css";

interface MyLoansSectionProps {
  wallet: UseWalletResult;
  onSelectLoan: (loanId: number) => void;
  onNavigate: (section: DashboardSection) => void;
}

/**
 * "My Loans" — loans created by the connected wallet, derived by
 * filtering the same full scan `BrowseLoansSection` uses
 * (`filterLoansByBorrower`), not a second/different data source.
 * There is no per-wallet backend query to call instead (see the FCP
 * audit) — filtering client-side is the honest option available
 * today.
 */
export function MyLoansSection({ wallet, onSelectLoan, onNavigate }: MyLoansSectionProps) {
  const connected = wallet.status === "connected";
  // Destructured (not accessed as `list.refresh`) — see the same note
  // in BrowseLoansSection.tsx.
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
    const timer = setTimeout(() => refresh(), 0);
    return () => clearTimeout(timer);
  }, [realtime.lastUpdate, refresh]);

  if (!connected) {
    return (
      <EmptyState
        icon={<WalletIcon width={20} height={20} />}
        title="Connect your wallet"
        description="Connect your wallet to see the loan requests you've created."
      />
    );
  }

  const myLoans = filterLoansByBorrower(data?.loans ?? [], wallet.address);
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
        loans={myLoans}
        failedIds={failedIds}
        error={error}
        onSelect={onSelectLoan}
        onRefresh={refresh}
        emptyIcon={<UserIcon width={20} height={20} />}
        emptyTitle="You haven't created any loan requests"
        emptyDescription="Loan requests you create with this wallet will show up here."
        emptyAction={
          <button type="button" className={styles.emptyActionButton} onClick={() => onNavigate("loans")}>
            Create a loan request
          </button>
        }
      />
    </div>
  );
}
