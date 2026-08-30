/**
 * Pure types and logic for `loan_registry` contract reads and writes
 * (L2-P05, L2-P06).
 *
 * Kept dependency-light — the one import (`mapWalletApiError`) is
 * safe because `appError.ts`'s only import is `@stellar/stellar-sdk`
 * (a real npm package, not a `@/` path alias), so this module —
 * unlike `loanRegistry.ts`, which also imports the live SDK's
 * `contract`/`rpc` client machinery and this project's
 * `@/config/stellar` alias — can still be loaded directly by Node's
 * test runner without a bundler. Same reasoning as `signError.ts`'s
 * split from `transaction.ts`.
 *
 * Re-exported from `loanRegistry.ts` for a single public import
 * surface for consumers.
 */

import { mapWalletApiError } from "../errors/appError.ts";

// --- Contract reads (L2-P05) -----------------------------------------------

export type LoanStatus = "Open" | "Cancelled";

export interface LoanRequest {
  loanId: number;
  borrower: string;
  amount: bigint;
  status: LoanStatus;
}

export type LoanRegistryErrorCode = "LOAN_NOT_FOUND" | "NETWORK_ERROR" | "UNKNOWN";

export interface LoanRegistryError {
  code: LoanRegistryErrorCode;
  message: string;
}

/**
 * `contracttype` unit-variant enums (like `LoanStatus`) are decoded
 * by the SDK based on the contract's real on-chain spec; the exact JS
 * shape it lands on has a couple of documented conventions depending
 * on SDK/binding version (a plain string, or a `{ tag, values }`
 * union used by `stellar contract bindings typescript`-generated
 * clients). Handled defensively here rather than assuming one shape,
 * since this could not be verified against the live deployed
 * contract from the environment this was written in (see the L2-P05
 * report's limitations section) — recommend a real smoke-test read
 * to confirm, and simplifying this function if only one shape ever
 * appears in practice.
 */
export function parseLoanStatus(raw: unknown): LoanStatus {
  if (raw === "Open" || raw === "Cancelled") {
    return raw;
  }
  if (typeof raw === "object" && raw !== null && "tag" in raw) {
    const tag = (raw as { tag: unknown }).tag;
    if (tag === "Open" || tag === "Cancelled") return tag;
  }
  if (Array.isArray(raw) && (raw[0] === "Open" || raw[0] === "Cancelled")) {
    return raw[0];
  }
  throw new Error(`Unrecognized LoanStatus value: ${JSON.stringify(raw)}`);
}

/**
 * Maps a failure from the RPC/simulation layer to a safe,
 * generic-but-informative LoanRegistryError. Never exposes raw
 * RPC/SDK error text to the UI, consistent with this project's
 * existing error-handling convention (appError.ts, kitMapping.ts).
 */
export function classifyReadError(err: unknown): LoanRegistryError {
  const message = err instanceof Error ? err.message : String(err);

  if (/network|fetch failed|ECONNREFUSED|ENOTFOUND|timeout|abort/i.test(message)) {
    return {
      code: "NETWORK_ERROR",
      message: "Could not reach the Stellar network. Check your connection and try again.",
    };
  }

  return {
    code: "UNKNOWN",
    message: "Something went wrong reading contract data. Please try again.",
  };
}

export function isLoanRegistryError(err: unknown): err is LoanRegistryError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "message" in err &&
    ["LOAN_NOT_FOUND", "NETWORK_ERROR", "UNKNOWN"].includes(
      (err as { code: unknown }).code as string
    )
  );
}

// --- Contract writes (L2-P06) -----------------------------------------------

export type ContractWriteStatus = "idle" | "pending" | "success" | "failure";

export type ContractWriteErrorCode =
  | "NOT_CONNECTED"
  | "INVALID_AMOUNT"
  | "REJECTED"
  | "SIMULATION_FAILED"
  | "SUBMISSION_FAILED"
  | "TRANSACTION_FAILED"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export interface ContractWriteError {
  code: ContractWriteErrorCode;
  message: string;
}

const CONTRACT_WRITE_ERROR_CODES: ContractWriteErrorCode[] = [
  "NOT_CONNECTED",
  "INVALID_AMOUNT",
  "REJECTED",
  "SIMULATION_FAILED",
  "SUBMISSION_FAILED",
  "TRANSACTION_FAILED",
  "NETWORK_ERROR",
  "UNKNOWN",
];

export function isContractWriteError(err: unknown): err is ContractWriteError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "message" in err &&
    CONTRACT_WRITE_ERROR_CODES.includes((err as { code: unknown }).code as ContractWriteErrorCode)
  );
}

/**
 * Generic fallback classifier for contract-write failures: detects
 * wallet rejection via `mapWalletApiError` — the same centralized
 * rejection detector already used for wallet-connect and XLM-transfer
 * sign rejections (`kitMapping.ts`, `signError.ts`) — and a generic
 * network-failure text pattern.
 *
 * The Soroban-specific SDK error classes
 * (`SimulationFailedError`, `SendFailedError`, etc., exposed as
 * `contract.AssembledTransaction.Errors`/`contract.SentTransaction.Errors`)
 * are distinguished via `instanceof` in `loanRegistry.ts`'s write
 * functions *before* falling back to this function — not here, since
 * matching them by class/constructor name in this dependency-free
 * module would be fragile under production minification, which can
 * rename classes unless explicitly configured not to.
 */
export function classifyWriteError(err: unknown): ContractWriteError {
  const message = err instanceof Error ? err.message : undefined;
  const mapped = mapWalletApiError({ message });
  if (mapped.code === "REJECTED") {
    return { code: "REJECTED", message: "The request was rejected in your wallet." };
  }

  const text = message ?? String(err);
  if (/network|fetch failed|ECONNREFUSED|ENOTFOUND|timeout|abort/i.test(text)) {
    return {
      code: "NETWORK_ERROR",
      message: "Could not reach the Stellar network. Check your connection and try again.",
    };
  }

  return {
    code: "UNKNOWN",
    message: "Something went wrong submitting the transaction. Please try again.",
  };
}

/**
 * Decides whether a submitted transaction can be treated as a real,
 * confirmed success — and extracts its real hash if so. Two
 * conditions must both hold: the network actually returned a hash
 * (submission truly happened), and the final polled status is
 * SUCCESS (not merely "signed" or "submitted" — L2-P06 §8/§18:
 * do not report success merely because signing or submission
 * succeeded). Takes plain, structural inputs (not the real SDK's
 * `SentTransaction` class) so this decision is directly testable
 * without needing a live SDK/network — see `loanRegistry.ts`'s
 * `requireConfirmedTxHash`, which adapts the real SDK object into
 * this shape.
 */
export function resolveConfirmedTxHash(sent: {
  hash: string | undefined;
  confirmed: boolean;
}): string {
  if (!sent.hash) {
    const error: ContractWriteError = {
      code: "SUBMISSION_FAILED",
      message: "The transaction could not be submitted to Stellar Testnet.",
    };
    throw error;
  }
  if (!sent.confirmed) {
    const error: ContractWriteError = {
      code: "TRANSACTION_FAILED",
      message: "The transaction was not confirmed successfully on Stellar Testnet.",
    };
    throw error;
  }
  return sent.hash;
}

interface RustResultLike<T> {
  isErr(): boolean;
  unwrap(): T;
}

/**
 * `loan_registry`'s write functions return `Result<T, Error>`; a
 * contract-level `Err` is a *value* returned by an otherwise-
 * successfully-confirmed transaction, not a thrown exception, so it
 * must be checked explicitly rather than relying on a catch block.
 * Takes a minimal structural `{isErr, unwrap}` shape (matching both
 * the real SDK's `contract.Result<T>` and a plain test double) so
 * this is directly testable.
 */
export function resolveOkResult<T>(
  result: RustResultLike<T>,
  contractErrorMessage: string
): T {
  if (result.isErr()) {
    const error: ContractWriteError = {
      code: "TRANSACTION_FAILED",
      message: contractErrorMessage,
    };
    throw error;
  }
  return result.unwrap();
}
