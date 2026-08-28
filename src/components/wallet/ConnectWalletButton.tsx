"use client";

/**
 * Wallet connection UI, extended in L2-P01 with a wallet picker.
 *
 * This intentionally uses plain markup/inline-ish styling rather than
 * the final P2P design system, per project scope: full visual design
 * is a later task (see 04_UI_UX.md, 00_MASTER_RULES.md #17).
 *
 * Accepts wallet state as props (rather than calling `useWallet()`
 * internally) so a single wallet session, created once in the parent
 * page, can be shared with sibling components (XlmBalance,
 * TransferForm) without creating a second, independent connection.
 *
 * L2-P01: renders the wallet options offered by the StellarWalletsKit
 * abstraction (`wallets`, from `useWallet`) instead of a single
 * Freighter-only button, so the user can pick which wallet to connect
 * with. Selecting a wallet both selects and connects it in one click.
 */

import styles from "./ConnectWalletButton.module.css";
import type { UseWalletResult } from "@/hooks/useWallet";

function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function ConnectWalletButton({
  status,
  address,
  error,
  wallets,
  connect,
  disconnect,
  selectWallet,
}: UseWalletResult) {
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

  const connecting = status === "connecting";

  return (
    <div className={styles.container}>
      {wallets.length > 0 ? (
        <div className={styles.walletList}>
          <span className={styles.walletListLabel}>Connect a wallet</span>
          {wallets.map((wallet) => (
            <button
              key={wallet.id}
              className={styles.buttonPrimary}
              onClick={() => selectWallet(wallet.id)}
              disabled={connecting}
            >
              {connecting
                ? "Connecting..."
                : wallet.isAvailable
                  ? wallet.name
                  : `${wallet.name} (not installed)`}
            </button>
          ))}
        </div>
      ) : (
        <button
          className={styles.buttonPrimary}
          onClick={connect}
          disabled={connecting}
        >
          {connecting ? "Connecting..." : "Connect Wallet"}
        </button>
      )}

      {(status === "not_installed" ||
        status === "rejected" ||
        status === "wrong_network" ||
        status === "disconnected") &&
        error && <p className={styles.errorText}>{error.message}</p>}
    </div>
  );
}
