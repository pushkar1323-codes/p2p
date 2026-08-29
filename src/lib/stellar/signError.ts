/**
 * Classifies a failure thrown while requesting the connected wallet's
 * signature (L2-P02).
 *
 * Kept as its own small, pure module — deliberately using only
 * relative imports, no `@/lib/wallet/kit` (which pulls in the live
 * StellarWalletsKit SDK) — so it can be unit tested directly with
 * Node's built-in test runner without a bundler resolving `@/`
 * aliases or evaluating the live wallet kit. Same pattern as
 * `lib/errors/appError.ts`, `lib/wallet/kitMapping.ts`, and
 * `components/transaction/feedbackContent.ts`.
 *
 * Used by `transaction.ts`'s `sendXlm` when `signWithSelectedWallet`
 * throws, and re-exported from there for convenience.
 */

import { mapWalletApiError } from "../errors/appError.ts";
import type { TransferError } from "./types";

function errorMessageOf(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message?: unknown }).message;
    return typeof message === "string" ? message : undefined;
  }
  return undefined;
}

/**
 * Reuses `mapWalletApiError`, the single centralized rejection
 * detector (`isRejectionMessage` in appError.ts) — no separate
 * rejection-detection logic is introduced here. The message is
 * deliberately wallet-agnostic ("your wallet", not "Freighter"),
 * since signing can happen through Freighter, Albedo, or xBull, and
 * this module has no way to know in advance which one raised the
 * error.
 */
export function classifySignError(err: unknown): TransferError {
  const mapped = mapWalletApiError({ message: errorMessageOf(err) });
  return mapped.code === "REJECTED"
    ? { code: "REJECTED", message: "The request was rejected in your wallet." }
    : { code: "UNKNOWN", message: mapped.message };
}
