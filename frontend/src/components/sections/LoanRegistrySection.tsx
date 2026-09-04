"use client";

import { useEffect, useState } from "react";
import type { UseWalletResult } from "@/hooks/useWallet";
import { LoanLookup } from "@/components/loans/LoanLookup";
import { LoanRequestActions } from "@/components/loans/LoanRequestActions";
import { RealtimeStatusBadge } from "@/components/realtime/RealtimeStatusBadge";
import type { LoanRegistryEvent } from "@/lib/stellar/loanRegistryEvents";
import { useContractEventStream } from "@/hooks/useContractEventStream";
import { contractEventUpdateToLoanRegistryEvent } from "@/lib/realtime/loanRegistryRealtime";
import { stellarConfig } from "@/config/stellar";
import styles from "./LoanRegistrySection.module.css";

interface LoanRegistrySectionProps {
  wallet: UseWalletResult;
  onLoanCountChange: () => void;
}

export function LoanRegistrySection({ wallet, onLoanCountChange }: LoanRegistrySectionProps) {
  // The most recent loan_registry create/cancel event from either
  // source below, passed down to LoanLookup so it can re-read a loan
  // it's currently showing if that's the one just changed — real
  // event-driven sync, not a shared polling loop.
  const [lastEvent, setLastEvent] = useState<LoanRegistryEvent | null>(null);

  // L3-P05: a live update broadcast over SSE (e.g. from another
  // session/device acting on the same contract) feeds the exact same
  // sync signal a local wallet write already does (L2-P08) — same
  // consumer, an additional source.
  const realtime = useContractEventStream();
  useEffect(() => {
    if (!realtime.lastUpdate) return;
    const event = contractEventUpdateToLoanRegistryEvent(
      realtime.lastUpdate,
      stellarConfig.loanRegistryContractId,
    );
    if (!event) return;
    // Deferred (not called synchronously in the effect body) per the
    // react-hooks/set-state-in-effect rule — same convention
    // LoanLookup.tsx already uses for its own event-driven setState.
    const timer = setTimeout(() => setLastEvent(event), 0);
    return () => clearTimeout(timer);
  }, [realtime.lastUpdate]);

  return (
    <div>
      <div className={styles.statusRow}>
        <RealtimeStatusBadge status={realtime.status} />
      </div>
      <div className={styles.grid}>
        <LoanRequestActions
          walletStatus={wallet.status}
          address={wallet.address}
          onSuccess={onLoanCountChange}
          onEvent={setLastEvent}
        />
        <LoanLookup syncSignal={lastEvent} />
      </div>
    </div>
  );
}
