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

export interface UseIsBorrowerEligibleResult extends ContractReadState<boolean, LoanRegistryError> {
  refresh: () => void;
}

export function useIsBorrowerEligible(address: string | null): UseIsBorrowerEligibleResult {
  const [state, dispatch] = useReducer(
    contractReadReducer<boolean, LoanRegistryError>,
    initialContractReadState<boolean, LoanRegistryError>()
  );

  const requestedAddressRef = useRef<string | null>(null);
  const requestTokenRef = useRef(0);

  const load = useCallback((addr: string) => {
    requestedAddressRef.current = addr;
    const token = ++requestTokenRef.current;
    dispatch({ type: "FETCH_START" });

    isBorrowerEligible(addr)
      .then((data) => {
        if (requestedAddressRef.current !== addr || requestTokenRef.current !== token) {
          return; // stale — address or refresh() superseded this request
        }
        dispatch({ type: "FETCH_SUCCESS", data });
      })
      .catch((error: LoanRegistryError) => {
        if (requestedAddressRef.current !== addr || requestTokenRef.current !== token) {
          return; // stale
        }
        dispatch({ type: "FETCH_ERROR", error });
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

  const refresh = useCallback(() => {
    if (address === null) return;
    load(address);
  }, [address, load]);

  return { ...state, refresh };
}
