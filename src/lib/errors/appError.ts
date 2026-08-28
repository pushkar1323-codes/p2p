/**
 * Centralized Level 1 error handling (L1-P06).
 *
 * Single authoritative place for turning RAW/TECHNICAL errors from
 * Freighter, Horizon, and the Stellar SDK into safe, predictable,
 * user-facing errors. Existing domain error types (WalletError,
 * TransferError, BalanceError — see src/lib/wallet/types.ts and
 * src/lib/stellar/types.ts) are NOT replaced here: they remain the
 * types consumed by the UI/state hooks, exactly as before. This
 * module is instead the one place their *messages* come from
 * whenever the underlying error is a raw technical failure, so the
 * classification/sanitization logic that used to be duplicated
 * (with drift risk) between lib/wallet/kit.ts and
 * stellar/transaction.ts now has a single implementation.
 *
 * Domain-specific error codes/messages that were already safe and
 * specific (e.g. WalletErrorCode "WRONG_NETWORK", TransferErrorCode
 * "SOURCE_ACCOUNT_NOT_FOUND" / "INVALID_DESTINATION" /
 * "INVALID_AMOUNT" / "NOT_CONNECTED", BalanceErrorCode
 * "ACCOUNT_NOT_FOUND") are deliberately left untouched — they aren't
 * raw technical errors that need sanitizing, and forcing them into
 * this smaller generic taxonomy would lose useful, already-safe
 * specificity for no safety benefit. This module's job is to catch
 * genuinely raw/technical/unclassified errors before they can leak
 * into the UI, not to replace every existing safe error path.
 *
 * This module owns NO transaction/wallet state — useWallet.ts /
 * useTransfer.ts / useXlmBalance.ts remain the single source of truth
 * for all UI state, exactly as in L1-P02 through L1-P05.
 */

import { TransactionFailedError } from "@stellar/stellar-sdk";

export type AppErrorCode =
  | "WALLET_NOT_FOUND"
  | "REJECTED"
  | "INSUFFICIENT_BALANCE"
  | "NETWORK_ERROR"
  | "TRANSACTION_FAILED"
  | "UNKNOWN_ERROR";

export interface AppError {
  code: AppErrorCode;
  /** Always safe to render directly to the user. */
  message: string;
  /**
   * Optional internal-only detail (e.g. raw Stellar result codes, or
   * the original technical exception message), retained only for
   * potential future logging/debugging. UI components must NEVER
   * render this field.
   */
  internal?: string;
}

/**
 * The required minimum safe message for each category. Exact wording
 * matches the L1-P06 specification.
 */
export const SAFE_MESSAGES: Record<AppErrorCode, string> = {
  WALLET_NOT_FOUND:
    "Freighter wallet was not found. Install Freighter and try again.",
  REJECTED: "The request was rejected in Freighter.",
  INSUFFICIENT_BALANCE: "Insufficient XLM balance for this transaction.",
  NETWORK_ERROR:
    "Unable to communicate with the Stellar network. Please try again.",
  TRANSACTION_FAILED: "Transaction failed. Please try again.",
  UNKNOWN_ERROR: "Something went wrong. Please try again.",
};

export function createAppError(code: AppErrorCode, internal?: string): AppError {
  return { code, message: SAFE_MESSAGES[code], internal };
}

/**
 * Detects Freighter/wallet rejection wording from a raw error
 * message. Single authoritative implementation — previously
 * duplicated (with drift risk) as `isUserRejection` in both
 * lib/wallet/kit.ts and stellar/transaction.ts.
 */
export function isRejectionMessage(message: string | undefined): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("declin") ||
    normalized.includes("reject") ||
    normalized.includes("denied") ||
    normalized.includes("not allowed") ||
    normalized.includes("not granted") ||
    normalized.includes("user cancelled") ||
    normalized.includes("user canceled")
  );
}

/**
 * Maps a raw wallet API error object to a safe AppError. Used for
 * both wallet-connection rejection and transaction-signing
 * rejection, across any wallet module (Freighter, Albedo, xBull, ...)
 * offered through the StellarWalletsKit abstraction — they all report
 * failures the same shape: `{ message?: string }`.
 *
 * (Named generically since L2-P01's multi-wallet abstraction: this
 * was previously `mapFreighterApiError`, used only for Freighter.
 * The logic is unchanged — only the name now reflects that it's
 * wallet-agnostic.)
 *
 * The raw wallet message is NEVER surfaced as the safe `.message` —
 * it is only ever retained in `.internal`.
 */
export function mapWalletApiError(
  walletError: { message?: string } | undefined
): AppError {
  if (isRejectionMessage(walletError?.message)) {
    return createAppError("REJECTED", walletError?.message);
  }
  return createAppError("UNKNOWN_ERROR", walletError?.message);
}

/**
 * Detects a Horizon "resource missing" (404) response from the
 * axios-style error shape the Stellar SDK throws for
 * `server.loadAccount()`.
 */
export function isHorizonNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "response" in err &&
    typeof (err as { response?: { status?: number } }).response === "object" &&
    (err as { response?: { status?: number } }).response?.status === 404
  );
}

/**
 * Classifies a Stellar SDK TransactionFailedError's result codes into
 * a safe AppError, without ever exposing raw Stellar result codes in
 * the user-facing message. Raw codes are retained only in
 * `.internal`.
 */
export function classifyTransactionFailure(
  err: TransactionFailedError
): AppError {
  const { operations } = err.getResultCodes();
  const internal = operations.length > 0 ? operations.join(", ") : undefined;
  if (operations.includes("op_underfunded")) {
    return createAppError("INSUFFICIENT_BALANCE", internal);
  }
  return createAppError("TRANSACTION_FAILED", internal);
}

function errorMessageOf(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message?: unknown }).message;
    return typeof message === "string" ? message : undefined;
  }
  return undefined;
}

/**
 * Fallback classifier for any error not already handled by a more
 * specific mapper above (e.g. a truly unexpected exception). Never
 * surfaces the raw message as the safe `.message` — only ever
 * retained in `.internal`.
 */
export function mapUnknownError(
  err: unknown,
  fallback: AppErrorCode = "UNKNOWN_ERROR"
): AppError {
  return createAppError(fallback, errorMessageOf(err));
}
