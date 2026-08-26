"use client";

/**
 * Minimal functional XLM transfer form for L1-P04, updated in L1-P05
 * to delegate all transaction lifecycle messaging to the reusable
 * TransactionFeedback component instead of duplicating it inline.
 *
 * Receives the connected wallet's address/status and the existing
 * balance state as props (shared session from the parent page — same
 * pattern as ConnectWalletButton/XlmBalance) rather than creating any
 * new wallet or balance mechanism. useTransfer remains the single
 * source of truth for transaction state; this component only reads
 * it and forwards it to TransactionFeedback for display.
 */

import { useState } from "react";
import { useTransfer } from "@/hooks/useTransfer";
import { testnetExplorerUrl } from "@/lib/stellar/transaction";
import { TransactionFeedback } from "@/components/transaction/TransactionFeedback";
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

  const pending =
    transferStatus === "preparing" ||
    transferStatus === "awaiting_signature" ||
    transferStatus === "submitted";
  const confirmed = transferStatus === "confirmed";
  const canRetry = transferStatus === "failed" || transferStatus === "rejected";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    await submit({ destination, amount });
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

  if (confirmed && hash) {
    return (
      <div className={styles.container}>
        <TransactionFeedback
          status={transferStatus}
          hash={hash}
          explorerUrl={testnetExplorerUrl(hash)}
        />
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
          disabled={pending}
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
          disabled={pending}
          autoComplete="off"
        />
      </div>

      <TransactionFeedback status={transferStatus} error={error} />

      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={pending}
        >
          {pending ? "Sending…" : "Send XLM"}
        </button>
        {canRetry && (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={reset}
          >
            Try again
          </button>
        )}
      </div>
    </form>
  );
}
