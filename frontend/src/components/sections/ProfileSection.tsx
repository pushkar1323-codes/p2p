"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddressChip } from "@/components/ui/AddressChip";
import { UserIcon, WalletIcon } from "@/components/ui/icons";
import { useLoanRegistryList } from "@/hooks/useLoanRegistryList";
import { filterLoansByBorrower } from "@/lib/stellar/loanRegistryList";
import type { UseWalletResult } from "@/hooks/useWallet";
import styles from "./ProfileSection.module.css";

interface ProfileSectionProps {
  wallet: UseWalletResult;
}

/**
 * Profile — the connected wallet's identity plus real participation
 * stats, derived from the same `useLoanRegistryList` scan Browse
 * Loans/My Loans already use (not a second, different data source).
 * No reputation/rating/portfolio numbers — there's no real source for
 * any of those on the currently deployed contract (see Loan Details'
 * own note on the same gap).
 */
export function ProfileSection({ wallet }: ProfileSectionProps) {
  const connected = wallet.status === "connected";
  const list = useLoanRegistryList();

  if (!connected) {
    return (
      <EmptyState
        icon={<WalletIcon width={20} height={20} />}
        title="Connect your wallet"
        description="Connect your wallet to see your profile and real participation on this contract."
      />
    );
  }

  const myLoans = filterLoansByBorrower(list.data?.loans ?? [], wallet.address);
  const openCount = myLoans.filter((loan) => loan.status === "Open").length;
  const cancelledCount = myLoans.filter((loan) => loan.status === "Cancelled").length;
  const loaded = list.status === "loaded";

  return (
    <Card>
      <CardHeader
        icon={<UserIcon width={18} height={18} />}
        title="Profile"
        description="Your connected wallet and real participation on the loan_registry contract."
      />

      <div className={styles.identityRow}>
        <span className={styles.label}>Wallet address</span>
        {wallet.address && <AddressChip address={wallet.address} />}
      </div>
      <div className={styles.identityRow}>
        <span className={styles.label}>Network</span>
        <span className={styles.value}>{wallet.network ?? "Unknown"}</span>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{loaded ? myLoans.length : "—"}</span>
          <span className={styles.statLabel}>Loan requests created</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{loaded ? openCount : "—"}</span>
          <span className={styles.statLabel}>Currently open</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{loaded ? cancelledCount : "—"}</span>
          <span className={styles.statLabel}>Cancelled</span>
        </div>
      </div>

      {list.status === "error" && (
        <p className={styles.hint}>
          Loan participation stats couldn&apos;t be loaded right now — the identity above is still accurate.
        </p>
      )}

      <p className={styles.hint}>
        Reputation, lending history, and funding stats aren&apos;t shown here yet — this Testnet
        deployment doesn&apos;t include lender funding or reputation scoring (see Loan Details for why).
      </p>
    </Card>
  );
}
