/**
 * Stellar Testnet XLM payment transaction module.
 *
 * Handles building a native XLM payment transaction, requesting the
 * user's signature through Freighter, and submitting the signed
 * transaction to Horizon. This is the only module that imports
 * `@stellar/stellar-sdk` for transaction construction/submission, and
 * the only module (besides `wallet/freighter.ts`) that calls into
 * `@stellar/freighter-api`, keeping both integrations isolated from
 * UI code.
 *
 * No private keys or secrets are ever handled here. Freighter signs
 * the transaction inside the extension; this module only ever sees
 * public account IDs and signed transaction XDR.
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
import { signTransaction as freighterSignTransaction } from "@stellar/freighter-api";
import { stellarConfig } from "@/config/stellar";
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

function isUserRejection(message: string | undefined): boolean {
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

export interface SendXlmParams {
  sourceAddress: string;
  destinationAddress: string;
  amount: string;
  /** Reports awaiting_signature/submitted transitions as they occur. */
  onProgress?: (stage: TransactionProgress) => void;
}

/**
 * Builds, signs (via Freighter), and submits a native XLM payment
 * transaction on Stellar Testnet. Returns the submitted transaction
 * hash on success. Throws a normalized TransferError on any failure.
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
    if (isNotFoundError(err)) {
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
  const signResult = await freighterSignTransaction(transaction.toXDR(), {
    networkPassphrase: stellarConfig.networkPassphrase,
    address: sourceAddress,
  });

  if (signResult.error) {
    const rejected = isUserRejection(signResult.error.message);
    const error: TransferError = rejected
      ? { code: "REJECTED", message: "Transaction signing was rejected in Freighter." }
      : {
          code: "UNKNOWN",
          message: signResult.error.message || "Failed to sign the transaction.",
        };
    throw error;
  }

  if (!signResult.signedTxXdr) {
    const error: TransferError = {
      code: "UNKNOWN",
      message: "Freighter did not return a signed transaction.",
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
      const { operations } = err.getResultCodes();
      const error: TransferError = {
        code: "TRANSACTION_FAILED",
        message: describeFailure(operations),
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

function isNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "response" in err &&
    typeof (err as { response?: { status?: number } }).response === "object" &&
    (err as { response?: { status?: number } }).response?.status === 404
  );
}

function describeFailure(operationCodes: string[]): string {
  if (operationCodes.includes("op_underfunded")) {
    return "Transaction failed: insufficient XLM balance to cover the amount and fee.";
  }
  if (operationCodes.includes("op_no_destination")) {
    return "Transaction failed: the destination account does not exist on Stellar Testnet.";
  }
  if (operationCodes.length > 0) {
    return `Transaction failed on Stellar Testnet (${operationCodes.join(", ")}).`;
  }
  return "Transaction failed on Stellar Testnet.";
}

/**
 * Builds a Stellar Testnet Explorer link for a transaction hash.
 */
export function testnetExplorerUrl(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}
