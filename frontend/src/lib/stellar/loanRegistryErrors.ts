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

export type LoanStatus = "Open" | "Cancelled" | "Funded";

export interface LoanRequest {
  loanId: number;
  borrower: string;
  amount: bigint;
  status: LoanStatus;
}

/**
 * A loan's funding record — `loan_registry`'s `get_funding(loan_id)`
 * (L3-P12). Mirrors `contracts/loan_registry/src/types.rs`'s
 * `Funding` struct exactly: loan id, the lender who funded it, the
 * token they funded it with, and the amount transferred (always
 * exactly the loan's own requested amount — partial funding isn't
 * supported by the contract).
 */
export interface Funding {
  loanId: number;
  lender: string;
  token: string;
  amount: bigint;
}

export type LoanRegistryErrorCode =
  | "LOAN_NOT_FOUND"
  | "FUNDING_NOT_FOUND"
  | "NETWORK_ERROR"
  | "STATE_EXPIRED"
  | "UNKNOWN";

export interface LoanRegistryError {
  code: LoanRegistryErrorCode;
  message: string;
  /**
   * Optional internal-only detail (the raw SDK/RPC error message),
   * retained only for logging/debugging — mirrors `AppError.internal`
   * in `lib/errors/appError.ts`. UI components must NEVER render
   * this field; only `.message` is safe to display.
   */
  internal?: string;
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
  if (raw === "Open" || raw === "Cancelled" || raw === "Funded") {
    return raw;
  }
  if (typeof raw === "object" && raw !== null && "tag" in raw) {
    const tag = (raw as { tag: unknown }).tag;
    if (tag === "Open" || tag === "Cancelled" || tag === "Funded") return tag;
  }
  if (
    Array.isArray(raw) &&
    (raw[0] === "Open" || raw[0] === "Cancelled" || raw[0] === "Funded")
  ) {
    return raw[0];
  }
  throw new Error(`Unrecognized LoanStatus value: ${JSON.stringify(raw)}`);
}

/**
 * Whether Loan Details should offer a Fund Loan action for the
 * currently connected wallet: the loan must be `Open`, and the
 * connected wallet must NOT be this loan's own borrower (L3-P12
 * correction — mirrors the contract's own `LenderIsBorrower`/
 * `LoanNotOpen` checks in `fund_loan`, so the UI never offers an
 * action the contract would reject; the contract itself remains the
 * actual security boundary regardless of what this returns).
 * Extracted as a pure function specifically so this condition is
 * directly unit-testable without rendering `LoanDetailSection`.
 */
export function canFundLoan(status: LoanStatus, isBorrowerOfThisLoan: boolean): boolean {
  return status === "Open" && !isBorrowerOfThisLoan;
}

/**
 * Network-failure text patterns, shared by `classifyReadError` and
 * `classifyWriteError`.
 *
 * BUGFIX (diagnosing the live "Something went wrong reading contract
 * data" failure): this previously only matched the Node-style
 * wording `"fetch failed"` (lowercase "f", "failed" second). Real
 * browsers throw a `TypeError` with different wording — Chrome/Edge:
 * `"Failed to fetch"` (capitalized, word order reversed — does NOT
 * match `/fetch failed/i`, since regex substring matching is
 * order-sensitive even case-insensitively); Firefox:
 * `"NetworkError when attempting to fetch resource"`; Safari:
 * `"Load failed"`. None of the browser variants matched the old
 * pattern, so any genuine network/CORS/DNS failure reaching this
 * code in a real browser fell through to the generic `UNKNOWN`
 * branch instead of the more accurate, more helpful `NETWORK_ERROR`
 * branch — which is exactly the mismatch between the generic message
 * seen live and what should have been shown.
 */
const NETWORK_ERROR_PATTERN =
  /network|fetch failed|failed to fetch|load failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout|abort/i;

/**
 * Maps a failure from the RPC/simulation layer to a safe,
 * generic-but-informative LoanRegistryError. Never exposes raw
 * RPC/SDK error text to the UI as `.message`, consistent with this
 * project's existing error-handling convention (appError.ts,
 * kitMapping.ts) — the raw text is only ever retained in `.internal`
 * for logging.
 */
export function classifyReadError(err: unknown): LoanRegistryError {
  const message = err instanceof Error ? err.message : String(err);

  if (NETWORK_ERROR_PATTERN.test(message)) {
    return {
      code: "NETWORK_ERROR",
      message: "Could not reach the Stellar network. Check your connection and try again.",
      internal: message,
    };
  }

  return {
    code: "UNKNOWN",
    message: "Something went wrong reading contract data. Please try again.",
    internal: message,
  };
}

/**
 * A Soroban-specific read failure: the contract's on-chain ledger
 * entries (e.g. its instance/code entries) have expired and need to
 * be restored before they can be read again. This is a real,
 * documented Soroban state-archival condition (see
 * `contract.AssembledTransaction.Errors.ExpiredState` /
 * `RestorationFailure` in the SDK) — distinct from a network problem
 * or an unexpected bug, so it gets its own code and a message that
 * doesn't imply the user did anything wrong or that retrying alone
 * will fix it. See `loanRegistry.ts`'s `toReadError`, which detects
 * this via `instanceof` against the real SDK error classes before
 * falling back to this module's text-based classification.
 */
export function contractStateExpiredError(internal?: string): LoanRegistryError {
  return {
    code: "STATE_EXPIRED",
    message:
      "This contract's on-chain data has expired on Testnet and needs to be restored. Please try again later, or contact the project maintainer.",
    internal,
  };
}

export function isLoanRegistryError(err: unknown): err is LoanRegistryError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "message" in err &&
    ["LOAN_NOT_FOUND", "FUNDING_NOT_FOUND", "NETWORK_ERROR", "STATE_EXPIRED", "UNKNOWN"].includes(
      (err as { code: unknown }).code as string
    )
  );
}

// --- Contract writes (L2-P06) -----------------------------------------------

export type ContractWriteStatus = "idle" | "pending" | "success" | "failure";

export type ContractWriteErrorCode =
  | "NOT_CONNECTED"
  | "INVALID_AMOUNT"
  | "INVALID_LOAN_ID"
  | "REJECTED"
  | "NOT_ELIGIBLE"
  | "BLOCKED"
  | "LENDER_IS_BORROWER"
  | "LOAN_NOT_OPEN_FOR_FUNDING"
  | "FUNDING_AMOUNT_MISMATCH"
  | "SIMULATION_FAILED"
  | "SUBMISSION_FAILED"
  | "TRANSACTION_FAILED"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export interface ContractWriteError {
  code: ContractWriteErrorCode;
  message: string;
  /** Same purpose as `LoanRegistryError.internal` — see above. */
  internal?: string;
}

const CONTRACT_WRITE_ERROR_CODES: ContractWriteErrorCode[] = [
  "NOT_CONNECTED",
  "INVALID_AMOUNT",
  "INVALID_LOAN_ID",
  "REJECTED",
  "NOT_ELIGIBLE",
  "BLOCKED",
  "LENDER_IS_BORROWER",
  "LOAN_NOT_OPEN_FOR_FUNDING",
  "FUNDING_AMOUNT_MISMATCH",
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
 * Detects the specific `BorrowerNotEligible` contract error (error
 * code 9 — see `contracts/loan_registry/src/error.rs`) inside a raw
 * Soroban simulation-failure message, so a `create_loan_request`
 * eligibility rejection can be shown with a specific, honest message
 * instead of the generic "could not be simulated" fallback.
 *
 * Soroban simulation errors surface as a host-error string in the
 * form `Error(Contract, #9)` (confirmed against this project's own
 * L3-P14 live Testnet verification — see docs/CURRENT_STATUS.md).
 * Matches on that exact code only — this is deliberately narrow: it
 * must not also match `EligibilityContractNotConfigured` (#8) or any
 * other contract error, since those need their own honest messages,
 * not this one. Returns `false` (never a guess) for anything else,
 * including a message that merely mentions eligibility in passing.
 */
export function isEligibilityRejection(simulationMessage: string): boolean {
  return /Error\(\s*Contract\s*,\s*#9\s*\)/.test(simulationMessage);
}

export const NOT_ELIGIBLE_MESSAGE =
  "This wallet isn't registered to create loan requests yet. " +
  "loan_registry requires borrowers to register with the Eligibility " +
  "Registry first (a one-time, self-service transaction — no " +
  "administrator involved) before it will accept a loan request.";

/**
 * Detects `fund_loan`'s `LenderIsBorrower` contract error (error code
 * 12 — see `contracts/loan_registry/src/error.rs`) inside a raw
 * Soroban simulation-failure message. Only ever applied within this
 * file's own `fundLoan`/`loanRegistry.ts` write-error mapping — it
 * uses `loan_registry`'s own error numbering, so (unlike
 * `eligibilityRegistryErrors.ts`'s detectors) there is no
 * cross-contract ambiguity risk here.
 */
export function isLenderIsBorrowerRejection(simulationMessage: string): boolean {
  return /Error\(\s*Contract\s*,\s*#12\s*\)/.test(simulationMessage);
}

export const LENDER_IS_BORROWER_MESSAGE =
  "You can't fund your own loan request. Funding is only available " +
  "from a different wallet than the one that created this loan.";

/**
 * Detects `LoanNotOpen` (error code 4) specifically as it can be
 * returned by `fund_loan` — the loan has already been funded or
 * cancelled (by someone else, in a race between this wallet opening
 * the loan and submitting a funding transaction) since it was last
 * read. The UI only ever offers Fund Loan on a loan already known to
 * be `Open`, so reaching this is a genuine race, not a UI bug — the
 * message reflects that rather than implying something is broken.
 */
export function isLoanNotOpenForFundingRejection(simulationMessage: string): boolean {
  return /Error\(\s*Contract\s*,\s*#4\s*\)/.test(simulationMessage);
}

export const LOAN_NOT_OPEN_FOR_FUNDING_MESSAGE =
  "This loan is no longer open for funding — it may have just been " +
  "funded or cancelled by someone else. Refresh to see its current status.";

/**
 * Detects `FundingAmountMismatch` (error code 13). The frontend never
 * lets a lender enter or edit the funding amount — it always sends
 * exactly the loan's own requested amount — so this should not be
 * reachable in normal use; handled anyway for an honest message
 * rather than a generic fallback if it ever is (e.g. stale read data).
 */
export function isFundingAmountMismatchRejection(simulationMessage: string): boolean {
  return /Error\(\s*Contract\s*,\s*#13\s*\)/.test(simulationMessage);
}

export const FUNDING_AMOUNT_MISMATCH_MESSAGE =
  "The funding amount didn't exactly match this loan's requested " +
  "amount. Refresh the page and try again.";

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
    return { code: "REJECTED", message: "The request was rejected in your wallet.", internal: message };
  }

  const text = message ?? String(err);
  if (NETWORK_ERROR_PATTERN.test(text)) {
    return {
      code: "NETWORK_ERROR",
      message: "Could not reach the Stellar network. Check your connection and try again.",
      internal: text,
    };
  }

  return {
    code: "UNKNOWN",
    message: "Something went wrong submitting the transaction. Please try again.",
    internal: text,
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
