"use client";

import type { UseWalletResult } from "@/hooks/useWallet";
import { LoanLookup } from "@/components/loans/LoanLookup";
import { LoanRequestActions } from "@/components/loans/LoanRequestActions";
import styles from "./LoanRegistrySection.module.css";

interface LoanRegistrySectionProps {
  wallet: UseWalletResult;
  onLoanCountChange: () => void;
}

export function LoanRegistrySection({ wallet, onLoanCountChange }: LoanRegistrySectionProps) {
  return (
    <div className={styles.grid}>
      <LoanRequestActions
        walletStatus={wallet.status}
        address={wallet.address}
        onSuccess={onLoanCountChange}
      />
      <LoanLookup />
    </div>
  );
}
