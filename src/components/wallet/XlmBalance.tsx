"use client";

/**
 * Minimal functional XLM balance display for L1-P03.
 *
 * Receives balance state as props (lifted to the parent page in
 * L1-P04 so TransferForm can reuse the same balance data/refresh
 * function — see page.tsx) rather than calling useXlmBalance
 * internally. Plain, restrained styling consistent with
 * ConnectWalletButton; not the final P2P design system.
 */

import type { WalletStatus } from "@/lib/wallet/types";
import type { UseXlmBalanceResult } from "@/hooks/useXlmBalance";
import styles from "./XlmBalance.module.css";

interface XlmBalanceProps {
  walletStatus: WalletStatus;
  balance: UseXlmBalanceResult;
}

function formatBalance(balance: string): string {
  const value = Number(balance);
  if (Number.isNaN(value)) return balance;
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  })} XLM`;
}

export function XlmBalance({ walletStatus, balance }: XlmBalanceProps) {
  if (walletStatus !== "connected") {
    return null;
  }

  const { status: balanceStatus, balance: balanceValue, error, refresh } = balance;

  return (
    <div className={styles.container}>
      <span className={styles.label}>Testnet Balance</span>

      {balanceStatus === "loading" && (
        <span className={styles.value}>Loading balance…</span>
      )}

      {balanceStatus === "loaded" && balanceValue && (
        <span className={styles.value}>{formatBalance(balanceValue)}</span>
      )}

      {balanceStatus === "error" && error && (
        <span className={styles.errorText}>{error.message}</span>
      )}

      {balanceStatus !== "loading" && (
        <button className={styles.refreshButton} onClick={refresh}>
          Refresh
        </button>
      )}
    </div>
  );
}
