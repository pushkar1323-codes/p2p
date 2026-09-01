/**
 * Frontend service for the deployed `loan_registry` Soroban contract:
 * reads (L2-P05) and writes (L2-P06).
 *
 * Reads (`getLoanCount`, `getLoanRequest`) are Soroban RPC
 * *simulations* only — no wallet connection needed. Writes
 * (`createLoanRequest`, `cancelLoanRequest`) build, simulate, sign
 * (via the existing wallet abstraction), submit, and confirm a real
 * transaction, and require a connected wallet address.
 *
 * Uses `contract.Client.from()` throughout, which fetches the
 * contract's actual on-chain spec and gives typed, spec-driven method
 * calls — this module does not hand-roll ScVal encoding/decoding or
 * Soroban transaction submission/polling, and reuses the existing
 * centralized `stellarConfig` (network passphrase, Soroban RPC URL,
 * deployed contract ID — see `config/stellar.ts`) and the existing
 * wallet-signing abstraction (`signWithSelectedWallet`, from
 * `lib/wallet/kit.ts` — the exact same function `transaction.ts` uses
 * for XLM transfers) rather than duplicating either.
 *
 * Following this project's established pattern (`transaction.ts`,
 * `kit.ts`): the actual network I/O here is not directly unit tested
 * — it depends on a live Soroban RPC endpoint and (for writes) a real
 * wallet. The pure classification/parsing logic it uses
 * (`classifyReadError`, `classifyWriteError`, `parseLoanStatus`) lives
 * in `loanRegistryErrors.ts` and is directly tested there.
 */

import { contract, rpc } from "@stellar/stellar-sdk";
import { signWithSelectedWallet } from "@/lib/wallet/kit";
import { stellarConfig } from "@/config/stellar";
import { extractLoanRegistryEvents } from "./loanRegistryEvents";
import type { LoanRegistryEvent } from "./loanRegistryEvents";
import {
  classifyReadError,
  classifyWriteError,
  contractStateExpiredError,
  isContractWriteError,
  isLoanRegistryError,
  parseLoanStatus,
  resolveConfirmedTxHash,
  resolveOkResult,
} from "./loanRegistryErrors";
import type { ContractWriteError, LoanRegistryError, LoanRequest } from "./loanRegistryErrors";

export type {
  LoanStatus,
  LoanRequest,
  LoanRegistryErrorCode,
  LoanRegistryError,
  ContractWriteStatus,
  ContractWriteErrorCode,
  ContractWriteError,
} from "./loanRegistryErrors";
export type { LoanRegistryEvent } from "./loanRegistryEvents";
export { classifyReadError, classifyWriteError, parseLoanStatus } from "./loanRegistryErrors";

/**
 * Shape of the generated contract client this service expects,
 * matching `contracts/loan_registry/src/lib.rs`'s public interface
 * exactly (see CONTRACT_STATUS_L2-P03.md). Used only as a TypeScript
 * type parameter for `contract.Client.from<T>()` — the actual
 * ScVal<->native decoding is done by the SDK itself from the
 * contract's real on-chain spec, not by this interface.
 */
interface LoanRegistryContractApi {
  get_loan_count(): Promise<{ result: bigint }>;
  get_loan_request(args: { loan_id: bigint }): Promise<{
    result: RustResult<RawLoanRequest, { message: string }>;
  }>;
  create_loan_request(
    args: { borrower: string; amount: bigint },
    options?: contract.MethodOptions
  ): Promise<contract.AssembledTransaction<contract.Result<bigint>>>;
  cancel_loan_request(
    args: { borrower: string; loan_id: bigint },
    options?: contract.MethodOptions
  ): Promise<contract.AssembledTransaction<contract.Result<null>>>;
}

interface RustResult<T, E> {
  isOk(): boolean;
  isErr(): boolean;
  unwrap(): T;
  unwrapErr(): E;
}

interface RawLoanRequest {
  borrower: string;
  amount: bigint;
  status: unknown;
}

let clientPromise: Promise<contract.Client & LoanRegistryContractApi> | null = null;

function getClient(): Promise<contract.Client & LoanRegistryContractApi> {
  if (!clientPromise) {
    clientPromise = contract.Client.from<LoanRegistryContractApi>({
      contractId: stellarConfig.loanRegistryContractId,
      networkPassphrase: stellarConfig.networkPassphrase,
      rpcUrl: stellarConfig.sorobanRpcUrl,
    }).catch((err: unknown) => {
      clientPromise = null; // allow a retry on the next call
      throw err;
    });
  }
  return clientPromise;
}

/**
 * Maps a read failure (from `getLoanCount`/`getLoanRequest`) to a
 * safe LoanRegistryError. Checks the SDK's own Soroban-specific error
 * classes via `instanceof` first — the same approach
 * `toContractWriteError` below already uses for writes — before
 * falling back to `classifyReadError`'s text-based network detection.
 *
 * `ExpiredState`/`RestorationFailure` specifically cover a real
 * Soroban condition worth surfacing distinctly: the contract's
 * on-chain ledger entries have aged out and need restoring. Read-only
 * simulations (no wallet, no `publicKey`) cannot perform that restore
 * themselves — it needs a funded, signed transaction — so this
 * mapping exists to give an honest, specific message rather than the
 * generic "something went wrong" fallback when this is the cause.
 */
function toReadError(err: unknown): LoanRegistryError {
  const { ExpiredState, RestorationFailure, SimulationFailed, ExternalServiceError } =
    contract.AssembledTransaction.Errors;

  if (err instanceof ExpiredState || err instanceof RestorationFailure) {
    const message = err instanceof Error ? err.message : undefined;
    return contractStateExpiredError(message);
  }
  if (err instanceof SimulationFailed) {
    return {
      code: "UNKNOWN",
      message: "Something went wrong reading contract data. Please try again.",
      internal: err.message,
    };
  }
  if (err instanceof ExternalServiceError) {
    return {
      code: "NETWORK_ERROR",
      message: "Could not reach the Stellar network. Check your connection and try again.",
      internal: err.message,
    };
  }

  return classifyReadError(err);
}

/**
 * Total number of loan requests ever created (including cancelled
 * ones) — `loan_registry`'s `get_loan_count()`.
 */
export async function getLoanCount(): Promise<number> {
  try {
    const client = await getClient();
    const { result } = await client.get_loan_count();
    return Number(result);
  } catch (err) {
    // Deliberate: the only way to see the real underlying SDK/RPC
    // error in the browser console, since the UI only ever shows
    // the safe, generic message below. See toReadError()'s doc
    // comment. (no-console is not an active lint rule here.)
    console.error("[loan_registry] get_loan_count() failed:", err);
    throw toReadError(err);
  }
}

/**
 * Reads a single loan request by id — `loan_registry`'s
 * `get_loan_request(loan_id)`. Throws a `LoanRegistryError` with code
 * `LOAN_NOT_FOUND` if the contract returns `Err(Error::LoanNotFound)`.
 */
export async function getLoanRequest(loanId: number): Promise<LoanRequest> {
  try {
    const client = await getClient();
    const { result } = await client.get_loan_request({ loan_id: BigInt(loanId) });

    if (result.isErr()) {
      throw {
        code: "LOAN_NOT_FOUND",
        message: `No loan request found with id ${loanId}.`,
      } satisfies LoanRegistryError;
    }

    const raw = result.unwrap();
    return {
      loanId,
      borrower: raw.borrower,
      amount: raw.amount,
      status: parseLoanStatus(raw.status),
    };
  } catch (err) {
    if (isLoanRegistryError(err)) throw err;
    // See getLoanCount()'s comment above.
    console.error("[loan_registry] get_loan_request() failed:", err);
    throw toReadError(err);
  }
}

// --- Writes (L2-P06) ---------------------------------------------

export interface CreateLoanRequestParams {
  /** The connected wallet's address — both the fee-paying source
   *  account and the loan's `borrower` (only this address can later
   *  cancel this loan request). */
  sourceAddress: string;
  /** Requested amount, as a whole non-negative integer in the
   *  smallest unit of whatever asset a future funding contract will
   *  use (see `contracts/loan_registry/src/state.rs` — deliberately
   *  asset-agnostic; no decimal/stroop scaling is applied here). */
  amount: bigint;
}

export interface CreateLoanRequestResult {
  txHash: string;
  loanId: number;
  /**
   * The contract's own `created` event for this transaction, decoded
   * from the transaction result the write flow already fetched to
   * confirm success (L2-P08 — see `loanRegistryEvents.ts`). `null`
   * only if the event genuinely could not be found/decoded (should
   * not normally happen for a confirmed success) — callers must treat
   * that as an honest "no event data" case, not synthesize one from
   * `loanId`/the request params instead.
   */
  event: LoanRegistryEvent | null;
}

/**
 * Creates a new loan request — `loan_registry`'s
 * `create_loan_request(borrower, amount)`. Builds, simulates, signs
 * (via the connected wallet), submits, and confirms the transaction;
 * resolves only once the transaction is actually confirmed successful
 * on Testnet (not merely once it's been signed or submitted — see
 * `requireConfirmedTxHash`).
 */
export async function createLoanRequest(
  params: CreateLoanRequestParams
): Promise<CreateLoanRequestResult> {
  const { sourceAddress, amount } = params;
  try {
    const client = await getClient();
    const assembled = await client.create_loan_request(
      { borrower: sourceAddress, amount },
      { publicKey: sourceAddress, signTransaction: signWithSelectedWallet }
    );
    const sent = await assembled.signAndSend();
    const txHash = requireConfirmedTxHash(sent);
    const loanId = requireOkResult(
      sent.result,
      "Enter an amount greater than zero."
    );
    return { txHash, loanId: Number(loanId), event: extractConfirmedEvent(sent, "created") };
  } catch (err) {
    // See getLoanCount()'s comment above.
    console.error("[loan_registry] create_loan_request() failed:", err);
    throw toContractWriteError(err);
  }
}

export interface CancelLoanRequestParams {
  /** The connected wallet's address — must be the loan's original
   *  borrower, or the contract rejects the cancellation. */
  sourceAddress: string;
  loanId: number;
}

export interface CancelLoanRequestResult {
  txHash: string;
  /** Same as `CreateLoanRequestResult.event`, for the `cancelled` event. */
  event: LoanRegistryEvent | null;
}

/**
 * Cancels an existing open loan request — `loan_registry`'s
 * `cancel_loan_request(borrower, loan_id)`. Same
 * build/simulate/sign/submit/confirm flow as `createLoanRequest`.
 */
export async function cancelLoanRequest(
  params: CancelLoanRequestParams
): Promise<CancelLoanRequestResult> {
  const { sourceAddress, loanId } = params;
  try {
    const client = await getClient();
    const assembled = await client.cancel_loan_request(
      { borrower: sourceAddress, loan_id: BigInt(loanId) },
      { publicKey: sourceAddress, signTransaction: signWithSelectedWallet }
    );
    const sent = await assembled.signAndSend();
    const txHash = requireConfirmedTxHash(sent);
    requireOkResult(
      sent.result,
      "This loan request could not be cancelled — it may not exist, may not belong to this wallet, or may already be cancelled."
    );
    return { txHash, event: extractConfirmedEvent(sent, "cancelled") };
  } catch (err) {
    // See getLoanCount()'s comment above.
    console.error("[loan_registry] cancel_loan_request() failed:", err);
    throw toContractWriteError(err);
  }
}

/**
 * Decodes the confirmed transaction's `loan_registry` event (L2-P08),
 * from data `signAndSend()` already fetched — no extra RPC call. Only
 * ever returns `null` on a genuine absence/decode miss; any
 * unexpected exception while decoding is caught and logged rather
 * than allowed to fail the whole write, since the transaction itself
 * already succeeded (confirmed via `txHash`/`sent.result` above) by
 * the time this runs — event decoding is enrichment, not the source
 * of truth for whether the write succeeded.
 */
function extractConfirmedEvent(
  sent: contract.SentTransaction<unknown>,
  kind: LoanRegistryEvent["kind"]
): LoanRegistryEvent | null {
  const response = sent.getTransactionResponse;
  if (!response || response.status !== rpc.Api.GetTransactionStatus.SUCCESS) return null;
  const meta = response.resultMetaXdr;
  try {
    const events = extractLoanRegistryEvents(meta, stellarConfig.loanRegistryContractId);
    return events.find((event) => event.kind === kind) ?? null;
  } catch (err) {
    console.error("[loan_registry] failed to decode contract event:", err);
    return null;
  }
}

/**
 * Adapts the real SDK's `SentTransaction` into the plain shape
 * `resolveConfirmedTxHash` (in `loanRegistryErrors.ts`) makes its
 * actual success/failure decision on — kept here, not there, only
 * because it touches the live SDK's `rpc.Api.GetTransactionStatus`.
 */
function requireConfirmedTxHash(sent: contract.SentTransaction<unknown>): string {
  return resolveConfirmedTxHash({
    hash: sent.sendTransactionResponse?.hash,
    confirmed: sent.getTransactionResponse?.status === rpc.Api.GetTransactionStatus.SUCCESS,
  });
}

/**
 * `resolveOkResult` (in `loanRegistryErrors.ts`) holds the actual
 * decision logic and is directly tested; this is just the call site
 * against the real SDK's `contract.Result<T>`.
 */
function requireOkResult<T>(result: contract.Result<T>, contractErrorMessage: string): T {
  return resolveOkResult(result, contractErrorMessage);
}

/**
 * Maps a write failure to a safe ContractWriteError. Distinguishes
 * the SDK's own Soroban-specific error classes via `instanceof`
 * against their documented public accessors
 * (`contract.AssembledTransaction.Errors`, `contract.SentTransaction.Errors`
 * — see their doc comments: "feel free to catch specific errors in
 * your application logic") before falling back to
 * `classifyWriteError`'s wallet-rejection/network-failure detection.
 */
function toContractWriteError(err: unknown): ContractWriteError {
  if (isContractWriteError(err)) return err;

  const { UserRejected, SimulationFailed, ExternalServiceError } =
    contract.AssembledTransaction.Errors;
  const { SendFailed, SendResultOnly, TransactionStillPending } =
    contract.SentTransaction.Errors;

  if (err instanceof UserRejected) {
    return { code: "REJECTED", message: "The request was rejected in your wallet." };
  }
  if (err instanceof SimulationFailed) {
    return {
      code: "SIMULATION_FAILED",
      message: "The transaction could not be simulated. Please try again.",
    };
  }
  if (err instanceof SendFailed || err instanceof SendResultOnly) {
    return {
      code: "SUBMISSION_FAILED",
      message: "The transaction could not be submitted to Stellar Testnet.",
    };
  }
  if (err instanceof TransactionStillPending) {
    return {
      code: "UNKNOWN",
      message: "The transaction is taking longer than expected to confirm. Check the explorer or try again shortly.",
    };
  }
  if (err instanceof ExternalServiceError) {
    return {
      code: "NETWORK_ERROR",
      message: "Could not reach the Stellar network. Check your connection and try again.",
    };
  }

  return classifyWriteError(err);
}
