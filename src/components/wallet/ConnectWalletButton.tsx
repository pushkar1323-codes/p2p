"use client";

/**
 * Wallet connection UI (L2-P01 UI refinement).
 *
 * This intentionally uses plain markup/inline-ish styling rather than
 * the final P2P design system, per project scope: full visual design
 * is a later task (see 04_UI_UX.md, 00_MASTER_RULES.md #17). It does
 * follow the existing restrained/no-neon palette already established
 * by this and sibling wallet components (XlmBalance, TransferForm).
 *
 * Accepts wallet state as props (rather than calling `useWallet()`
 * internally) so a single wallet session, created once in the parent
 * page, can be shared with sibling components (XlmBalance,
 * TransferForm) without creating a second, independent connection.
 *
 * A single "Connect Wallet" button opens the StellarWalletsKit's own
 * `authModal()` (see `lib/wallet/kit.ts`), which lets the user pick
 * Freighter, Albedo, or xBull itself — replacing the previous L2-P01
 * implementation's three separate per-wallet buttons. `wallets` and
 * `selectWallet` are still exposed by `useWallet()` for a possible
 * future custom-styled picker, but this component no longer renders
 * them directly.
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
  connect,
  disconnect,
}: UseWalletResult) {
  if (status === "connected" && address) {
    return (
      <div className={styles.container}>
        <div className={styles.connectedBadge}>
          <span className={styles.statusDot} aria-hidden="true" />
          <span className={styles.address} title={address}>
            {truncateAddress(address)}
          </span>
        </div>
        <button className={styles.buttonSecondary} onClick={disconnect}>
          Disconnect
        </button>
      </div>
    );
  }

  const connecting = status === "connecting";

  return (
    <div className={styles.container}>
      <button
        className={styles.buttonPrimary}
        onClick={connect}
        disabled={connecting}
      >
        {connecting ? "Connecting..." : "Connect Wallet"}
      </button>

      {(status === "not_installed" ||
        status === "rejected" ||
        status === "wrong_network" ||
        status === "disconnected") &&
        error && <p className={styles.errorText}>{error.message}</p>}
    </div>
  );
}
