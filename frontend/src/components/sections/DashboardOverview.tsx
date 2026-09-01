"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import type { UseWalletResult } from "@/hooks/useWallet";
import type { UseXlmBalanceResult } from "@/hooks/useXlmBalance";
import type { UseLoanCountResult } from "@/hooks/useLoanCount";
import type { DashboardSection } from "@/components/layout/navigation";
import { WalletBalanceCard } from "@/components/dashboard/WalletBalanceCard";
import { LoanCountCard } from "@/components/dashboard/LoanCountCard";
import { NetworkStatusCard } from "@/components/dashboard/NetworkStatusCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import styles from "./DashboardOverview.module.css";

interface DashboardOverviewProps {
  wallet: UseWalletResult;
  balance: UseXlmBalanceResult;
  loanCount: UseLoanCountResult;
  onNavigate: (section: DashboardSection) => void;
}

export function DashboardOverview({ wallet, balance, loanCount, onNavigate }: DashboardOverviewProps) {
  return (
    <div className={styles.stack}>
      <div className={styles.cardsGrid}>
        <WalletBalanceCard walletStatus={wallet.status} balance={balance} onConnect={wallet.connect} />
        <LoanCountCard loanCount={loanCount} />
        <NetworkStatusCard />
      </div>

      <Card>
        <CardHeader title="Quick Actions" description="Jump straight to what you need." />
        <QuickActions
          walletStatus={wallet.status}
          onNavigate={onNavigate}
          onConnect={wallet.connect}
          onRefreshBalance={balance.refresh}
        />
      </Card>
    </div>
  );
}
