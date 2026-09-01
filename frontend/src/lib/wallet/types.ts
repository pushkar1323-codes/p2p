/**
 * Wallet domain types.
 *
 * Kept deliberately generic (not Freighter-specific in naming) so this
 * layer can later be swapped out or extended by the Level 2
 * StellarWalletsKit multi-wallet abstraction without changing the
 * shape consumed by UI components.
 */

export type WalletStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "rejected"
  | "not_installed"
  | "wrong_network";

export type WalletErrorCode =
  | "NOT_INSTALLED"
  | "REJECTED"
  | "WRONG_NETWORK"
  | "UNKNOWN";

export interface WalletError {
  code: WalletErrorCode;
  message: string;
}

/**
 * A wallet option offered by the StellarWalletsKit abstraction (see
 * lib/wallet/kit.ts). Deliberately a small local shape rather than
 * re-exporting the kit's own `ISupportedWallet` type, so no
 * third-party wallet-library type leaks into UI/state code.
 */
export interface WalletOption {
  id: string;
  name: string;
  icon: string;
  isAvailable: boolean;
}

export interface WalletState {
  status: WalletStatus;
  address: string | null;
  network: string | null;
  error: WalletError | null;
  /** Wallet options offered by the abstraction (Freighter, Albedo, xBull). */
  wallets: WalletOption[];
  /** Currently selected wallet id, or null before any selection. */
  selectedWalletId: string | null;
}
