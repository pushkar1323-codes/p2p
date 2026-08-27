/**
 * Freighter integration layer.
 *
 * This is the ONLY module that imports `@stellar/freighter-api`
 * directly. Keeping the raw API calls isolated here means the Level 2
 * StellarWalletsKit multi-wallet abstraction (L2-P01) can later
 * replace or wrap this module without changing `useWallet` or any UI
 * component.
 *
 * No secrets are handled here. Freighter is a browser extension that
 * manages keys itself; this app only ever receives a public address
 * and network metadata.
 */

import {
  isConnected as freighterIsConnected,
  requestAccess as freighterRequestAccess,
  getNetworkDetails as freighterGetNetworkDetails,
} from "@stellar/freighter-api";
import { stellarConfig } from "@/config/stellar";
import { createAppError, mapFreighterApiError } from "@/lib/errors/appError";
import type { WalletError } from "./types";

/**
 * Detects whether the Freighter browser extension is installed and
 * responding. Freighter is only available in browser contexts.
 */
export async function checkFreighterAvailability(): Promise<boolean> {
  const result = await freighterIsConnected();
  if (result.error) {
    return false;
  }
  return result.isConnected;
}

/**
 * Prompts Freighter for account access and returns the connected
 * public address. Throws a normalized WalletError on rejection,
 * missing extension, or any other failure.
 */
export async function connectFreighter(): Promise<string> {
  const available = await checkFreighterAvailability();
  if (!available) {
    const appError = createAppError("WALLET_NOT_FOUND");
    const error: WalletError = {
      code: "NOT_INSTALLED",
      message: appError.message,
    };
    throw error;
  }

  const result = await freighterRequestAccess();

  if (result.error) {
    const mapped = mapFreighterApiError(result.error);
    const error: WalletError = {
      code: mapped.code === "REJECTED" ? "REJECTED" : "UNKNOWN",
      message: mapped.message,
    };
    throw error;
  }

  if (!result.address) {
    const error: WalletError = {
      code: "UNKNOWN",
      message: "Freighter did not return an address.",
    };
    throw error;
  }

  return result.address;
}

/**
 * Reads the network Freighter is currently configured to use and
 * compares it against this app's expected Testnet passphrase
 * (`src/config/stellar.ts`). Returns whether the active Freighter
 * network matches the app's expected network.
 */
export async function checkNetworkMatch(): Promise<{
  matches: boolean;
  network: string | null;
}> {
  const result = await freighterGetNetworkDetails();

  if (result.error) {
    const error: WalletError = {
      code: "UNKNOWN",
      message: "Unable to read the active network from Freighter.",
    };
    throw error;
  }

  return {
    matches: result.networkPassphrase === stellarConfig.networkPassphrase,
    network: result.network || null,
  };
}
