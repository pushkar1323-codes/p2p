"use client";

import { useState } from "react";
import type { UseWalletResult } from "@/hooks/useWallet";
import { LoanLookup } from "@/components/loans/LoanLookup";
import { LoanRequestActions } from "@/components/loans/LoanRequestActions";
import type { LoanRegistryEvent } from "@/lib/stellar/loanRegistryEvents";
import styles from "./LoanRegistrySection.module.css";

interface LoanRegistrySectionProps {
  wallet: UseWalletResult;
  onLoanCountChange: () => void;
}

export function LoanRegistrySection({ wallet, onLoanCountChange }: LoanRegistrySectionProps) {
  // The most recent decoded loan_registry event (L2-P08), passed down
  // to LoanLookup so it can re-read a loan it's currently showing if
  // that's the one just created/cancelled — real event-driven sync
  // between these two sibling panels, not a shared polling loop.
  const [lastEvent, setLastEvent] = useState<LoanRegistryEvent | null>(null);

  return (
    <div className={styles.grid}>
      <LoanRequestActions
        walletStatus={wallet.status}
        address={wallet.address}
        onSuccess={onLoanCountChange}
        onEvent={setLastEvent}
      />
      <LoanLookup syncSignal={lastEvent} />
    </div>
  );
}
