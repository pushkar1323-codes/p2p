/**
 * XLM balance domain types.
 */

export type BalanceStatus = "idle" | "loading" | "loaded" | "error";

export type BalanceErrorCode =
  | "ACCOUNT_NOT_FOUND"
  | "HORIZON_ERROR"
  | "INVALID_RESPONSE";

export interface BalanceError {
  code: BalanceErrorCode;
  message: string;
}

export interface BalanceState {
  status: BalanceStatus;
  balance: string | null;
  error: BalanceError | null;
}

/**
 * XLM transfer domain types.
 */

export type TransferStatus =
  | "idle"
  | "preparing"
  | "awaiting_signature"
  | "submitted"
  | "confirmed"
  | "failed"
  | "rejected";

export type TransferErrorCode =
  | "INVALID_DESTINATION"
  | "INVALID_AMOUNT"
  | "INSUFFICIENT_BALANCE"
  | "REJECTED"
  | "SOURCE_ACCOUNT_NOT_FOUND"
  | "TRANSACTION_FAILED"
  | "NETWORK_ERROR"
  | "NOT_CONNECTED"
  | "UNKNOWN";

export interface TransferError {
  code: TransferErrorCode;
  message: string;
}

export interface TransferState {
  status: TransferStatus;
  hash: string | null;
  error: TransferError | null;
}
