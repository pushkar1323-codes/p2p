"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddressChip } from "@/components/ui/AddressChip";
import { WalletIcon, SendIcon, UserIcon } from "@/components/ui/icons";
import { XlmBalance } from "@/components/wallet/XlmBalance";
import { TransferForm } from "@/components/wallet/TransferForm";
import { stellarConfig } from "@/config/stellar";
import type { UseWalletResult } from "@/hooks/useWallet";
import type { UseXlmBalanceResult } from "@/hooks/useXlmBalance";
import styles from "./WalletSection.module.css";

interface WalletSectionProps {
  wallet: UseWalletResult;
  balance: UseXlmBalanceResult;
}

export function WalletSection({ wallet, balance }: WalletSectionProps) {
  const connected = wallet.status === "connected";

  return (
    <div className={styles.stack}>
      {connected && wallet.address && (
        <Card>
          <CardHeader icon={<UserIcon width={18} height={18} />} title="Account" />
          <div className={styles.accountRow}>
            <span className={styles.accountLabel}>Address</span>
            <AddressChip address={wallet.address} />
          </div>
          <div className={styles.accountRow}>
            <span className={styles.accountLabel}>Network</span>
            <span className={styles.accountValue}>
              {wallet.network ?? `Stellar ${stellarConfig.network === "TESTNET" ? "Testnet" : stellarConfig.network}`}
            </span>
          </div>
        </Card>
      )}

      <div className={styles.grid}>
        <Card>
          <CardHeader icon={<WalletIcon width={18} height={18} />} title="Balance" />
          {connected ? (
            <XlmBalance walletStatus={wallet.status} balance={balance} />
          ) : (
            <EmptyState
              icon={<WalletIcon width={20} height={20} />}
              title="No wallet connected"
              description="Connect your wallet from the top of the page to view your Testnet XLM balance."
            />
          )}
        </Card>

        <Card>
          <CardHeader
            icon={<SendIcon width={18} height={18} />}
            title="Send XLM"
            description="Testnet XLM transfer."
          />
          <TransferForm
            status={wallet.status}
            address={wallet.address}
            availableBalance={balance.balance}
            onSent={balance.refresh}
          />
        </Card>
      </div>
    </div>
  );
}
