"use client";

/**
 * useXlmBalance
 *
 * Fetches and tracks the native XLM balance for a given Stellar
 * address. Deliberately decoupled from the wallet hook (accepts an
 * `address` value rather than importing `useWallet` itself) so it can
 * be reused if the wallet layer changes in Level 2.
 *
 * Behavior:
 * - address is null (disconnected) -> state resets to idle, no fetch
 * - address changes -> previous in-flight request's result is
 *   discarded if it resolves after the address has already changed
 *   again, preventing stale balance data from being applied
 * - refresh() re-fetches the balance for the current address
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchXlmBalance } from "@/lib/stellar/horizon";
import type { BalanceError, BalanceState } from "@/lib/stellar/types";

const idleState: BalanceState = {
  status: "idle",
  balance: null,
  error: null,
};

export interface UseXlmBalanceResult extends BalanceState {
  refresh: () => void;
}

export function useXlmBalance(address: string | null): UseXlmBalanceResult {
  const [state, setState] = useState<BalanceState>(idleState);

  // Tracks the address the most recent fetch was issued for, so a
  // late-resolving response for a since-changed or cleared address
  // never overwrites newer state.
  const requestedAddressRef = useRef<string | null>(null);
  // Incrementing token lets refresh() force a new fetch even when the
  // address itself hasn't changed.
  const requestTokenRef = useRef(0);

  const load = useCallback((targetAddress: string) => {
    requestedAddressRef.current = targetAddress;
    const token = ++requestTokenRef.current;

    // Deferred (not a direct synchronous call in the effect body) so
    // it follows the same "setState inside a callback" pattern as the
    // .then()/.catch() handlers below.
    Promise.resolve().then(() => {
      if (
        requestedAddressRef.current === targetAddress &&
        requestTokenRef.current === token
      ) {
        setState({ status: "loading", balance: null, error: null });
      }
    });

    fetchXlmBalance(targetAddress)
      .then((balance) => {
        if (
          requestedAddressRef.current !== targetAddress ||
          requestTokenRef.current !== token
        ) {
          return; // stale response — address changed or superseded by refresh()
        }
        setState({ status: "loaded", balance, error: null });
      })
      .catch((err: unknown) => {
        if (
          requestedAddressRef.current !== targetAddress ||
          requestTokenRef.current !== token
        ) {
          return; // stale response
        }
        setState({
          status: "error",
          balance: null,
          error: normalizeBalanceError(err),
        });
      });
  }, []);

  useEffect(() => {
    if (!address) {
      requestedAddressRef.current = null;
      requestTokenRef.current += 1; // invalidate any in-flight request
      return; // no setState needed — render falls back to idle below
    }
    load(address);
  }, [address, load]);

  const refresh = useCallback(() => {
    if (!address) return;
    load(address);
  }, [address, load]);

  // When disconnected, always present idle state regardless of
  // whatever the last connected address's fetch had produced.
  const effectiveState = address ? state : idleState;

  return {
    ...effectiveState,
    refresh,
  };
}

function normalizeBalanceError(err: unknown): BalanceError {
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "message" in err
  ) {
    return err as BalanceError;
  }
  return {
    code: "HORIZON_ERROR",
    message: err instanceof Error ? err.message : "Failed to fetch balance.",
  };
}
