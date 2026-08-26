"use client";

/**
 * Minimal functional XLM transfer form for L1-P04.
 *
 * Receives the connected wallet's address/status and the existing
 * balance state as props (shared session from the parent page — same
 * pattern as ConnectWalletButton/XlmBalance) rather than creating any
 * new wallet or balance mechanism. Plain, restrained styling
 * consistent with the rest of the wallet UI.
 */

import { useState } from "react";
import { useTransfer } from "@/hooks/useTransfer";
import { testnetExplorerUrl } from "@/lib/stellar/transaction";
import type { WalletStatus } from "@/lib/wallet/types";
import styles from "./TransferForm.module.css";

interface TransferFormProps {
  status: WalletStatus;
  address: string | null;
  availableBalance: string | null;
  onSent: () => void;
}

export function TransferForm({
  status,
  address,
  availableBalance,
  onSent,
}: TransferFormProps) {
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");

  const connected = status === "connected";
  const { status: transferStatus, hash, error, submit, reset } = useTransfer({
    sourceAddress: connected ? address : null,
    availableBalance,
    onSuccess: onSent,
  });

  const submitting = transferStatus === "submitting";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    await submit({ destination, amount });
  }

  function handleRetry() {
    reset();
  }

  if (!connected) {
    return (
      <div className={styles.container}>
        <p className={styles.disabledText}>
          Connect your wallet to send XLM on Stellar Testnet.
        </p>
      </div>
    );
  }

  if (transferStatus === "success" && hash) {
    return (
      <div className={styles.container}>
        <p className={styles.successText}>Transfer submitted successfully.</p>
        <p className={styles.hashLabel}>Transaction hash</p>
        <p className={styles.hashValue}>{hash}</p>
        <a
          className={styles.explorerLink}
          href={testnetExplorerUrl(hash)}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on Stellar Testnet Explorer
        </a>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => {
            setDestination("");
            setAmount("");
            reset();
          }}
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form className={styles.container} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="destination">
          Destination address
        </label>
        <input
          id="destination"
          className={styles.input}
          type="text"
          placeholder="G..."
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          disabled={submitting}
          autoComplete="off"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="amount">
          Amount (XLM)
        </label>
        <input
          id="amount"
          className={styles.input}
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={submitting}
          autoComplete="off"
        />
      </div>

      {transferStatus === "failed" && error && (
        <p className={styles.errorText}>{error.message}</p>
      )}

      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={submitting}
        >
          {submitting ? "Sending…" : "Send XLM"}
        </button>
        {transferStatus === "failed" && (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleRetry}
          >
            Try again
          </button>
        )}
      </div>
    </form>
  );
}
