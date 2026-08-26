"use client";

/**
 * Minimal functional XLM balance display for L1-P03.
 *
 * Receives the connected wallet's address/status as props (shared
 * wallet session from the parent page — see ConnectWalletButton for
 * why) and manages its own fetch/loading/error state via
 * useXlmBalance. Plain, restrained styling consistent with
 * ConnectWalletButton; not the final P2P design system.
 */

import { useXlmBalance } from "@/hooks/useXlmBalance";
import type { WalletStatus } from "@/lib/wallet/types";
import styles from "./XlmBalance.module.css";

interface XlmBalanceProps {
  status: WalletStatus;
  address: string | null;
}

function formatBalance(balance: string): string {
  const value = Number(balance);
  if (Number.isNaN(value)) return balance;
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  })} XLM`;
}

export function XlmBalance({ status, address }: XlmBalanceProps) {
  const connectedAddress = status === "connected" ? address : null;
  const { status: balanceStatus, balance, error, refresh } =
    useXlmBalance(connectedAddress);

  if (status !== "connected") {
    return null;
  }

  return (
    <div className={styles.container}>
      <span className={styles.label}>Testnet Balance</span>

      {balanceStatus === "loading" && (
        <span className={styles.value}>Loading balance…</span>
      )}

      {balanceStatus === "loaded" && balance && (
        <span className={styles.value}>{formatBalance(balance)}</span>
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
