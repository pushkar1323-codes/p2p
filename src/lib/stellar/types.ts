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
