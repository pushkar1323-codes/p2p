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

export interface WalletState {
  status: WalletStatus;
  address: string | null;
  network: string | null;
  error: WalletError | null;
}
