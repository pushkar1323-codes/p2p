/**
 * Frontend service for the deployed `eligibility_registry` Soroban
 * contract (L3-P07/L3-P14 self-registration correction): a read
 * (`isBorrowerEligible`) and a write (`register`).
 *
 * Mirrors `loanRegistry.ts`'s structure and conventions exactly —
 * `contract.Client.from()`, the existing wallet-signing abstraction
 * (`signWithSelectedWallet`), the existing centralized
 * `stellarConfig`. See that file's doc comment for the full
 * reasoning; not repeated here.
 *
 * Per the approved design: registration is an explicit, separate
 * transaction the borrower sends directly to this contract —
 * `create_loan_request` does NOT call this automatically. This
 * module has no dependency on `loanRegistry.ts` at all, and vice
 * versa; the two contracts are only ever linked through
 * `loan_registry`'s own on-chain `is_borrower_eligible` cross-contract
 * call (see `contracts/loan_registry/src/eligibility.rs`), which
 * needed no changes.
 */

import { contract, rpc } from "@stellar/stellar-sdk";
import { signWithSelectedWallet } from "@/lib/wallet/kit";
import { stellarConfig } from "@/config/stellar";
import {
  classifyReadError,
  classifyWriteError,
  contractStateExpiredError,
  isBlockedRejection,
  isContractWriteError,
  resolveConfirmedTxHash,
  resolveOkResult,
  BLOCKED_MESSAGE,
} from "./eligibilityRegistryErrors";
import type { ContractWriteError, LoanRegistryError } from "./eligibilityRegistryErrors";

export type {
  ContractWriteError,
  ContractWriteErrorCode,
  LoanRegistryError,
  LoanRegistryErrorCode,
} from "./eligibilityRegistryErrors";
export { classifyReadError, classifyWriteError } from "./eligibilityRegistryErrors";

/**
 * Shape of the generated contract client this service expects,
 * matching `contracts/eligibility_registry/src/lib.rs`'s public
 * interface exactly. Used only as a TypeScript type parameter for
 * `contract.Client.from<T>()` — see `loanRegistry.ts`'s identical
 * pattern and caveat.
 */
interface EligibilityRegistryContractApi {
  is_borrower_eligible(args: { borrower: string }): Promise<{ result: boolean }>;
  register(
    args: { borrower: string },
    options?: contract.MethodOptions
  ): Promise<contract.AssembledTransaction<contract.Result<null>>>;
}

let clientPromise: Promise<contract.Client & EligibilityRegistryContractApi> | null = null;

function getClient(): Promise<contract.Client & EligibilityRegistryContractApi> {
  if (!clientPromise) {
    clientPromise = contract.Client.from<EligibilityRegistryContractApi>({
      contractId: stellarConfig.eligibilityRegistryContractId,
      networkPassphrase: stellarConfig.networkPassphrase,
      rpcUrl: stellarConfig.sorobanRpcUrl,
    }).catch((err: unknown) => {
      clientPromise = null; // allow a retry on the next call
      throw err;
    });
  }
  return clientPromise;
}

/** Same reasoning as `loanRegistry.ts`'s `toReadError`. */
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
      message: "Something went wrong checking your eligibility. Please try again.",
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
 * Reads whether `borrower` is currently eligible —
 * `eligibility_registry`'s `is_borrower_eligible(borrower)`. A plain
 * RPC simulation; no wallet connection needed. `true` only for a
 * currently-`Registered` borrower; `false` for both "never
 * registered" and "blocked" (the contract's own deny-by-default —
 * see `is_borrower_eligible`'s doc comment in `lib.rs`).
 */
export async function isBorrowerEligible(borrower: string): Promise<boolean> {
  try {
    const client = await getClient();
    // Diagnostic only (not gated behind NODE_ENV — contract IDs and
    // wallet addresses are already public on-chain, nothing sensitive
    // here). Added while investigating a live report of the
    // "Register Wallet" card persisting after an apparently
    // successful registration: this sandbox has no network path to
    // Stellar Testnet (confirmed: soroban-testnet.stellar.org /
    // horizon-testnet.stellar.org are both outside its egress
    // allowlist) or a browser to reproduce the live flow directly, so
    // this line lets it be confirmed instead from the browser
    // devtools console on the machine that CAN reach Testnet — most
    // usefully, whether this matches the contract ID
    // `register()` below just wrote to (it always will within a
    // single page load — both share the one `getClient()` singleton —
    // but a stale build/dev-server from before
    // `NEXT_PUBLIC_ELIGIBILITY_REGISTRY_CONTRACT_ID` was last updated
    // could still be serving an old bundle with a different value
    // baked in; this makes that directly checkable rather than
    // guessed at).
    console.debug(
      `[eligibility_registry] is_borrower_eligible(${borrower}) — contract ${stellarConfig.eligibilityRegistryContractId}`
    );
    const { result } = await client.is_borrower_eligible({ borrower });
    return result;
  } catch (err) {
    // See loanRegistry.ts's getLoanCount()'s identical comment.
    console.error("[eligibility_registry] is_borrower_eligible() failed:", err);
    throw toReadError(err);
  }
}

export interface RegisterResult {
  txHash: string;
}

/**
 * Self-registers `borrower` — `eligibility_registry`'s
 * `register(borrower)`. Builds, simulates, signs (via the connected
 * wallet), submits, and confirms the transaction; resolves only once
 * actually confirmed on Testnet (not merely signed/submitted — same
 * standard as `loanRegistry.ts`'s writes). The contract makes this
 * idempotent (see its own doc comment) — calling this again for an
 * already-registered wallet succeeds harmlessly rather than erroring.
 */
export async function register(borrower: string): Promise<RegisterResult> {
  try {
    const client = await getClient();
    // Same diagnostic reasoning as isBorrowerEligible() above — lets
    // the read and write contract IDs be visually cross-checked in
    // the browser console during a live test, since this sandbox
    // cannot make that call itself.
    console.debug(
      `[eligibility_registry] register(${borrower}) — contract ${stellarConfig.eligibilityRegistryContractId}`
    );
    const assembled = await client.register(
      { borrower },
      { publicKey: borrower, signTransaction: signWithSelectedWallet }
    );
    const sent = await assembled.signAndSend();
    const txHash = resolveConfirmedTxHash({
      hash: sent.sendTransactionResponse?.hash,
      confirmed: sent.getTransactionResponse?.status === rpc.Api.GetTransactionStatus.SUCCESS,
    });
    resolveOkResult(sent.result, "Registration could not be completed.");
    console.debug(`[eligibility_registry] register(${borrower}) confirmed — tx ${txHash}`);
    return { txHash };
  } catch (err) {
    // See loanRegistry.ts's getLoanCount()'s identical comment.
    console.error("[eligibility_registry] register() failed:", err);
    throw toContractWriteError(err);
  }
}

/**
 * Maps a `register()` failure to a safe ContractWriteError. Same
 * `instanceof`-first approach as `loanRegistry.ts`'s
 * `toContractWriteError`, plus the one write this contract has that
 * loan_registry's doesn't: a `BorrowerBlocked` rejection.
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
    if (isBlockedRejection(err.message)) {
      return { code: "BLOCKED", message: BLOCKED_MESSAGE, internal: err.message };
    }
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
      message:
        "The transaction is taking longer than expected to confirm. Check the explorer or try again shortly.",
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
