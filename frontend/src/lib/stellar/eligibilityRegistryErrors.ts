/**
 * Pure types and logic specific to `eligibility_registry` (L3-P07,
 * self-registration model added in the L3-P07/L3-P14 correction).
 *
 * Deliberately a SEPARATE file from `loanRegistryErrors.ts`, even
 * though both contracts' writes are classified the same general way
 * (build/simulate/sign/submit/confirm, `ContractWriteError`). Raw
 * Soroban simulation failures surface only a bare numeric contract
 * error code (`Error(Contract, #N)`), and that number is only
 * meaningful *within one specific contract's own `Error` enum*. This
 * project's two contracts happen to both define error code #4 for
 * completely unrelated things — `loan_registry`'s is `LoanNotOpen`
 * (see `contracts/loan_registry/src/error.rs`), `eligibility_registry`'s
 * is `BorrowerBlocked` (see `contracts/eligibility_registry/src/lib.rs`).
 * Keeping detection logic in one file per contract, rather than one
 * shared file, makes it structurally harder to ever apply
 * `isBlockedRejection` (below) to a `loan_registry` error, or
 * `isEligibilityRejection` (in `loanRegistryErrors.ts`) to an
 * `eligibility_registry` one.
 *
 * Genuinely contract-agnostic pieces (`ContractWriteError`,
 * `isContractWriteError`, `resolveConfirmedTxHash`, `resolveOkResult`,
 * `classifyWriteError`, and the read-side `LoanRegistryError`/
 * `classifyReadError`/`contractStateExpiredError`) are re-exported
 * from `loanRegistryErrors.ts` here rather than duplicated — despite
 * their names, none of their actual logic is loan_registry-specific;
 * they operate on generic Soroban write/read result shapes.
 */

export type {
  ContractWriteError,
  ContractWriteErrorCode,
  LoanRegistryError,
  LoanRegistryErrorCode,
} from "./loanRegistryErrors.ts";
export {
  classifyReadError,
  classifyWriteError,
  contractStateExpiredError,
  isContractWriteError,
  resolveConfirmedTxHash,
  resolveOkResult,
} from "./loanRegistryErrors.ts";

/**
 * Detects eligibility_registry's own `BorrowerBlocked` contract error
 * (error code 4 — see `contracts/eligibility_registry/src/lib.rs`)
 * inside a raw Soroban simulation-failure message from a `register()`
 * call. Must only ever be applied to an error from a call to
 * eligibility_registry — see this file's module doc comment for why
 * the bare number #4 is ambiguous across this project's two
 * contracts.
 */
export function isBlockedRejection(simulationMessage: string): boolean {
  return /Error\(\s*Contract\s*,\s*#4\s*\)/.test(simulationMessage);
}

export const BLOCKED_MESSAGE =
  "This wallet has been blocked from creating loan requests by an " +
  "administrator. Registering again will not lift a block — contact " +
  "the project administrator if you believe this is a mistake.";

export const NOT_REGISTERED_MESSAGE =
  "This wallet isn't registered yet. Register your wallet — a one-time, " +
  "self-service transaction — to be able to create loan requests.";
