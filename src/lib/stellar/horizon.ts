/**
 * Minimal Horizon REST client for reading account balances.
 *
 * Uses `fetch` directly against the configured Horizon endpoint
 * (`src/config/stellar.ts`) rather than adding a Stellar SDK
 * dependency, since a single read-only account lookup does not
 * justify the extra dependency weight. If future tasks need
 * transaction building/signing/submission, a proper SDK dependency
 * should be evaluated at that point.
 */

import { stellarConfig } from "@/config/stellar";
import type { BalanceError } from "./types";

interface HorizonBalance {
  asset_type: string;
  balance: string;
}

interface HorizonAccountResponse {
  balances?: HorizonBalance[];
}

/**
 * Fetches the native XLM balance for a given Stellar account from
 * Horizon. Throws a normalized BalanceError on failure.
 */
export async function fetchXlmBalance(address: string): Promise<string> {
  let response: Response;

  try {
    response = await fetch(
      `${stellarConfig.horizonUrl}/accounts/${encodeURIComponent(address)}`,
      { headers: { Accept: "application/json" } }
    );
  } catch {
    const error: BalanceError = {
      code: "HORIZON_ERROR",
      message: "Could not reach the Stellar Testnet network. Check your connection and try again.",
    };
    throw error;
  }

  if (response.status === 404) {
    const error: BalanceError = {
      code: "ACCOUNT_NOT_FOUND",
      message: "This account has not been funded on Stellar Testnet yet.",
    };
    throw error;
  }

  if (!response.ok) {
    const error: BalanceError = {
      code: "HORIZON_ERROR",
      message: `Stellar Testnet returned an error (${response.status}). Try again shortly.`,
    };
    throw error;
  }

  let data: HorizonAccountResponse;
  try {
    data = await response.json();
  } catch {
    const error: BalanceError = {
      code: "INVALID_RESPONSE",
      message: "Received an unreadable response from Stellar Testnet.",
    };
    throw error;
  }

  const nativeBalance = data.balances?.find(
    (b) => b.asset_type === "native"
  )?.balance;

  if (!nativeBalance) {
    const error: BalanceError = {
      code: "INVALID_RESPONSE",
      message: "Could not find a native XLM balance in the account response.",
    };
    throw error;
  }

  return nativeBalance;
}
