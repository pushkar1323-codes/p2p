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
import type { WalletError } from "./types";

/**
 * Freighter error messages are not a stable enum in the current API
 * (`FreighterApiError` only guarantees `code`/`message`), so rejection
 * is detected via a case-insensitive match against known phrasing.
 * This is intentionally minimal — a fuller mapping belongs to
 * L1-P06 (centralized error mapping), not this task.
 */
function isUserRejection(message: string | undefined): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("declin") ||
    normalized.includes("reject") ||
    normalized.includes("denied") ||
    normalized.includes("not allowed") ||
    normalized.includes("not granted")
  );
}

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
    const error: WalletError = {
      code: "NOT_INSTALLED",
      message: "Freighter extension was not detected in this browser.",
    };
    throw error;
  }

  const result = await freighterRequestAccess();

  if (result.error) {
    const rejected = isUserRejection(result.error.message);
    const error: WalletError = rejected
      ? {
          code: "REJECTED",
          message: "Connection request was rejected in Freighter.",
        }
      : {
          code: "UNKNOWN",
          message: result.error.message || "Failed to connect to Freighter.",
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
