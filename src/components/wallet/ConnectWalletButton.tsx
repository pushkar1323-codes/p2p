"use client";

/**
 * Minimal functional wallet UI for L1-P02.
 *
 * This intentionally uses plain markup/inline-ish styling rather than
 * the final P2P design system, per project scope: full visual design
 * is a later task (see 04_UI_UX.md, 00_MASTER_RULES.md #17).
 */

import { useWallet } from "@/hooks/useWallet";
import styles from "./ConnectWalletButton.module.css";

function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function ConnectWalletButton() {
  const { status, address, error, connect, disconnect } = useWallet();

  if (status === "connected" && address) {
    return (
      <div className={styles.container}>
        <span className={styles.address} title={address}>
          {truncateAddress(address)}
        </span>
        <button className={styles.buttonSecondary} onClick={disconnect}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <button
        className={styles.buttonPrimary}
        onClick={connect}
        disabled={status === "connecting"}
      >
        {status === "connecting" ? "Connecting..." : "Connect Wallet"}
      </button>

      {status === "not_installed" && (
        <p className={styles.errorText}>
          Freighter was not detected. Install the Freighter browser
          extension to connect.
        </p>
      )}

      {(status === "rejected" ||
        status === "wrong_network" ||
        status === "disconnected") &&
        error && <p className={styles.errorText}>{error.message}</p>}
    </div>
  );
}
