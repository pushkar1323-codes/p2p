/**
 * Stellar Testnet XLM payment transaction module.
 *
 * Handles building a native XLM payment transaction, requesting the
 * user's signature through the currently selected wallet (via the
 * StellarWalletsKit abstraction, `lib/wallet/kit.ts`), and submitting
 * the signed transaction to Horizon. This is the only module that
 * imports `@stellar/stellar-sdk` for transaction construction/
 * submission. Signing no longer calls Freighter directly (L2-P01) —
 * it goes through the wallet abstraction, so a transfer works no
 * matter which supported wallet is connected.
 *
 * No private keys or secrets are ever handled here. The wallet signs
 * the transaction itself; this module only ever sees public account
 * IDs and signed transaction XDR.
 */

import {
  Asset,
  BASE_FEE,
  Horizon,
  Operation,
  StrKey,
  TransactionBuilder,
  TransactionFailedError,
} from "@stellar/stellar-sdk";
import { signWithSelectedWallet } from "@/lib/wallet/kit";
import { stellarConfig } from "@/config/stellar";
import { classifyTransactionFailure, isHorizonNotFoundError } from "@/lib/errors/appError";
import { classifySignError } from "./signError";
import type { TransferError } from "./types";

/**
 * Progress stages `sendXlm` can report mid-flight, so callers (e.g.
 * `useTransfer`) can reflect finer-grained UI states without
 * duplicating the submission logic itself. "preparing" is not
 * reported here because the caller already knows to show it the
 * moment it calls `sendXlm` (before the source account load begins).
 */
export type TransactionProgress = "awaiting_signature" | "submitted";

/** Seconds a submitted transaction remains valid before it expires. */
const TRANSACTION_TIMEOUT_SECONDS = 60;

const server = new Horizon.Server(stellarConfig.horizonUrl);

/**
 * Validates a Stellar public address (Ed25519, "G..." format).
 * Muxed ("M...") addresses are intentionally not accepted here to
 * keep the source-account/payment-destination path simple for this
 * task.
 */
export function isValidStellarAddress(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address.trim());
}

export interface SendXlmParams {
  sourceAddress: string;
  destinationAddress: string;
  amount: string;
  /** Reports awaiting_signature/submitted transitions as they occur. */
  onProgress?: (stage: TransactionProgress) => void;
}

/**
 * Builds, signs (via the currently connected wallet), and submits a
 * native XLM payment transaction on Stellar Testnet. Returns the
 * submitted transaction hash on success. Throws a normalized
 * TransferError on any failure.
 */
export async function sendXlm({
  sourceAddress,
  destinationAddress,
  amount,
  onProgress,
}: SendXlmParams): Promise<string> {
  // Load the source account (and its current sequence number) from
  // Testnet Horizon.
  let account;
  try {
    account = await server.loadAccount(sourceAddress);
  } catch (err) {
    if (isHorizonNotFoundError(err)) {
      const error: TransferError = {
        code: "SOURCE_ACCOUNT_NOT_FOUND",
        message: "Your account was not found on Stellar Testnet. It may not be funded yet.",
      };
      throw error;
    }
    const error: TransferError = {
      code: "NETWORK_ERROR",
      message: "Could not reach Stellar Testnet to prepare the transaction.",
    };
    throw error;
  }

  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: stellarConfig.networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: destinationAddress,
        asset: Asset.native(),
        amount,
      })
    )
    .setTimeout(TRANSACTION_TIMEOUT_SECONDS)
    .build();

  onProgress?.("awaiting_signature");
  let signResult: { signedTxXdr: string; signerAddress?: string };
  try {
    signResult = await signWithSelectedWallet(transaction.toXDR(), {
      networkPassphrase: stellarConfig.networkPassphrase,
      address: sourceAddress,
    });
  } catch (err) {
    throw classifySignError(err);
  }

  if (!signResult.signedTxXdr) {
    const error: TransferError = {
      code: "UNKNOWN",
      message: "The wallet did not return a signed transaction.",
    };
    throw error;
  }

  const signedTransaction = TransactionBuilder.fromXDR(
    signResult.signedTxXdr,
    stellarConfig.networkPassphrase
  );

  try {
    onProgress?.("submitted");
    const response = await server.submitTransaction(signedTransaction);
    return response.hash;
  } catch (err) {
    if (err instanceof TransactionFailedError) {
      const mapped = classifyTransactionFailure(err);
      const error: TransferError = {
        code:
          mapped.code === "INSUFFICIENT_BALANCE"
            ? "INSUFFICIENT_BALANCE"
            : "TRANSACTION_FAILED",
        message: mapped.message,
      };
      throw error;
    }
    const error: TransferError = {
      code: "NETWORK_ERROR",
      message: "Could not submit the transaction to Stellar Testnet.",
    };
    throw error;
  }
}

/**
 * Builds a Stellar Testnet Explorer link for a transaction hash.
 */
export function testnetExplorerUrl(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

export { classifySignError };
