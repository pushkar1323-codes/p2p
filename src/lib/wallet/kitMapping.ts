/**
 * Pure mapping logic for the StellarWalletsKit adapter (lib/wallet/kit.ts).
 *
 * Deliberately has no dependency on the live kit or a browser
 * environment, so it can be unit tested directly with Node's built-in
 * test runner (see kitMapping.test.mts) — same pattern as
 * components/transaction/feedbackContent.ts and lib/errors/appError.ts.
 */

import { mapWalletApiError } from "../errors/appError.ts";
import type { WalletError, WalletOption } from "./types";

/**
 * The minimal shape of the kit's `ISupportedWallet` this module
 * depends on, so it doesn't need to import the kit's own type.
 */
export interface SupportedWalletLike {
  id: string;
  name: string;
  icon: string;
  isAvailable: boolean;
}

/**
 * Converts a kit-reported supported wallet into this app's local
 * WalletOption shape, so no third-party wallet-library type leaks
 * past this module.
 */
export function toWalletOption(supported: SupportedWalletLike): WalletOption {
  return {
    id: supported.id,
    name: supported.name,
    icon: supported.icon,
    isAvailable: supported.isAvailable,
  };
}

export function toWalletOptions(
  supported: SupportedWalletLike[]
): WalletOption[] {
  return supported.map(toWalletOption);
}

/**
 * Classifies an error raised while connecting to or signing with the
 * currently selected wallet into the existing L1-P02 `WalletError`
 * shape, reusing the L1-P06 centralized rejection detector so the
 * same wording is recognized everywhere. `wasAvailable` (from the
 * wallet's `isAvailable` flag, known before the connection attempt)
 * lets this distinguish "wallet not installed" from a genuine
 * rejection or unexpected failure, since kit errors don't always
 * carry a distinct "not installed" code. `walletName` keeps the
 * not-installed message accurate for whichever wallet is selected
 * (Freighter, Albedo, xBull, ...), not hardcoded to one.
 */
export function classifyKitError(
  err: unknown,
  wasAvailable: boolean,
  walletName: string
): WalletError {
  if (!wasAvailable) {
    return {
      code: "NOT_INSTALLED",
      message: `${walletName} wallet was not found. Install ${walletName} and try again.`,
    };
  }

  const mapped = mapWalletApiError({ message: errorMessageOf(err) });
  if (mapped.code === "REJECTED") {
    return {
      code: "REJECTED",
      message: `The request was rejected in ${walletName}.`,
    };
  }
  return { code: "UNKNOWN", message: mapped.message };
}

function errorMessageOf(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message?: unknown }).message;
    return typeof message === "string" ? message : undefined;
  }
  return undefined;
}
