/**
 * Read-only frontend service for the deployed `loan_registry` Soroban
 * contract (L2-P05).
 *
 * Every function here is a read: internally it's a Soroban RPC
 * *simulation* only, never a signed/submitted transaction, so no
 * wallet connection is required to call these (matches
 * `@stellar/stellar-sdk`'s own `contract.Client`/`AssembledTransaction`
 * design — see its docs: `publicKey`/`signTransaction` are only
 * needed for methods you intend to sign and send).
 *
 * Uses `contract.Client.from()`, which fetches the contract's actual
 * on-chain spec and gives typed, spec-driven method calls — this
 * module does not hand-roll ScVal encoding/decoding, and reuses the
 * existing centralized `stellarConfig` (network passphrase, Soroban
 * RPC URL, and the deployed contract ID — see `config/stellar.ts`)
 * rather than duplicating connection setup.
 *
 * Following this project's established pattern (`transaction.ts`,
 * `kit.ts`): the actual network I/O (`getLoanCount`, `getLoanRequest`)
 * is not directly unit tested here — it depends on a live Soroban RPC
 * endpoint. The pure classification/parsing logic it uses
 * (`classifyReadError`, `parseLoanStatus`) lives in
 * `loanRegistryErrors.ts` and is directly tested there.
 */

import { contract } from "@stellar/stellar-sdk";
import { stellarConfig } from "@/config/stellar";
import {
  classifyReadError,
  isLoanRegistryError,
  parseLoanStatus,
} from "./loanRegistryErrors";
import type { LoanRegistryError, LoanRequest } from "./loanRegistryErrors";

export type { LoanStatus, LoanRequest, LoanRegistryErrorCode, LoanRegistryError } from "./loanRegistryErrors";
export { classifyReadError, parseLoanStatus } from "./loanRegistryErrors";

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
 * Total number of loan requests ever created (including cancelled
 * ones) — `loan_registry`'s `get_loan_count()`.
 */
export async function getLoanCount(): Promise<number> {
  try {
    const client = await getClient();
    const { result } = await client.get_loan_count();
    return Number(result);
  } catch (err) {
    throw classifyReadError(err);
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
    throw classifyReadError(err);
  }
}
