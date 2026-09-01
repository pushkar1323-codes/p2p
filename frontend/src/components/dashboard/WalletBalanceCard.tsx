"use client";

import { WalletIcon, RefreshIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import type { UseXlmBalanceResult } from "@/hooks/useXlmBalance";
import type { WalletStatus } from "@/lib/wallet/types";
import { SummaryCard } from "./SummaryCard";
import styles from "./ActionFooter.module.css";

interface WalletBalanceCardProps {
  walletStatus: WalletStatus;
  balance: UseXlmBalanceResult;
  onConnect: () => void;
}

function formatBalance(balance: string): string {
  const value = Number(balance);
  if (Number.isNaN(value)) return balance;
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} XLM`;
}

export function WalletBalanceCard({ walletStatus, balance, onConnect }: WalletBalanceCardProps) {
  if (walletStatus !== "connected") {
    return (
      <SummaryCard
        label="Wallet Balance"
        icon={<WalletIcon width={18} height={18} />}
        tone="purple"
        footer={
          <button type="button" className={styles.footerLink} onClick={onConnect}>
            Connect wallet
          </button>
        }
      >
        <span className={styles.mutedValue}>—</span>
      </SummaryCard>
    );
  }

  const { status, balance: value, error, refresh } = balance;

  return (
    <SummaryCard
      label="Wallet Balance"
      icon={<WalletIcon width={18} height={18} />}
      tone="purple"
      footer={
        status !== "loading" && (
          <button type="button" className={styles.footerLink} onClick={refresh}>
            <RefreshIcon width={13} height={13} />
            Refresh
          </button>
        )
      }
    >
      {status === "loading" && <Spinner size="sm" label="Loading…" />}
      {status === "loaded" && value && formatBalance(value)}
      {status === "error" && (
        <span className={styles.errorValue}>{error?.message ?? "Unable to load balance."}</span>
      )}
      {status === "idle" && <span className={styles.mutedValue}>—</span>}
    </SummaryCard>
  );
}
