"use client";

/**
 * useIsBorrowerEligible
 *
 * Reads `eligibility_registry`'s `is_borrower_eligible(borrower)`
 * (L3-P07/L3-P14 self-registration correction). Pass `null` for
 * `address` (e.g. wallet not connected) to keep state idle without
 * fetching — same "null key means idle, no fetch" convention as
 * `useLoanRequest`/`useXlmBalance`.
 *
 * State transitions are delegated to the shared, directly-tested
 * `contractReadReducer` (see `contractReadState.ts`) — this hook is a
 * thin wrapper, mirroring `useLoanRequest.ts` almost exactly.
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import { isBorrowerEligible } from "@/lib/stellar/eligibilityRegistry";
import type { LoanRegistryError } from "@/lib/stellar/eligibilityRegistry";
import {
  contractReadReducer,
  initialContractReadState,
  type ContractReadState,
} from "./contractReadState";
export { retryEligibilityRefreshOnce } from "./eligibilityRetry";

export interface UseIsBorrowerEligibleResult extends ContractReadState<boolean, LoanRegistryError> {
  /**
   * Re-fetches eligibility for the current address. Resolves with the
   * freshly-read value (or `false` if `address` is `null`, or on a
   * read error — callers that need to distinguish an error from a
   * real `false` should read `.error`/`.data` off the hook's own
   * returned state instead, same as before; the resolved value here
   * exists only so a caller that just performed a write — see
   * `LoanRequestActions.tsx`'s post-registration retry — can react to
   * the outcome without a separate effect). Never rejects.
   */
  refresh: () => Promise<boolean>;
}

export function useIsBorrowerEligible(address: string | null): UseIsBorrowerEligibleResult {
  const [state, dispatch] = useReducer(
    contractReadReducer<boolean, LoanRegistryError>,
    initialContractReadState<boolean, LoanRegistryError>()
  );

  const requestedAddressRef = useRef<string | null>(null);
  const requestTokenRef = useRef(0);

  const load = useCallback((addr: string): Promise<boolean> => {
    requestedAddressRef.current = addr;
    const token = ++requestTokenRef.current;
    dispatch({ type: "FETCH_START" });

    return isBorrowerEligible(addr)
      .then((data) => {
        if (requestedAddressRef.current !== addr || requestTokenRef.current !== token) {
          return data; // stale — address or refresh() superseded this request; still return the real value to this specific caller
        }
        dispatch({ type: "FETCH_SUCCESS", data });
        return data;
      })
      .catch((error: LoanRegistryError) => {
        if (requestedAddressRef.current !== addr || requestTokenRef.current !== token) {
          return false; // stale
        }
        dispatch({ type: "FETCH_ERROR", error });
        return false;
      });
  }, []);

  useEffect(() => {
    if (address === null) {
      requestedAddressRef.current = null;
      requestTokenRef.current += 1; // invalidate any in-flight request
      dispatch({ type: "RESET" });
      return;
    }
    load(address);
  }, [address, load]);

  const refresh = useCallback((): Promise<boolean> => {
    if (address === null) return Promise.resolve(false);
    return load(address);
  }, [address, load]);

  return { ...state, refresh };
}
