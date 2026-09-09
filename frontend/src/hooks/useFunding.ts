"use client";

/**
 * useFunding
 *
 * Reads a loan's funding record by id — `loan_registry`'s
 * `get_funding(loan_id)` (L3-P12). Pass `null` for `loanId` (e.g. the
 * loan isn't `Funded` yet, so there's nothing real to read) to keep
 * state idle without fetching — same "null key means idle, no fetch"
 * convention as `useLoanRequest`/`useXlmBalance`.
 *
 * State transitions are delegated to the shared, directly-tested
 * `contractReadReducer` (see `contractReadState.ts`) — this hook is a
 * near-exact mirror of `useLoanRequest.ts`.
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import { getFunding } from "@/lib/stellar/loanRegistry";
import type { Funding, LoanRegistryError } from "@/lib/stellar/loanRegistry";
import {
  contractReadReducer,
  initialContractReadState,
  type ContractReadState,
} from "./contractReadState";

export interface UseFundingResult extends ContractReadState<Funding, LoanRegistryError> {
  refresh: () => void;
}

export function useFunding(loanId: number | null): UseFundingResult {
  const [state, dispatch] = useReducer(
    contractReadReducer<Funding, LoanRegistryError>,
    initialContractReadState<Funding, LoanRegistryError>()
  );

  const requestedIdRef = useRef<number | null>(null);
  const requestTokenRef = useRef(0);

  const load = useCallback((id: number) => {
    requestedIdRef.current = id;
    const token = ++requestTokenRef.current;
    dispatch({ type: "FETCH_START" });

    getFunding(id)
      .then((data) => {
        if (requestedIdRef.current !== id || requestTokenRef.current !== token) {
          return; // stale — loanId or refresh() superseded this request
        }
        dispatch({ type: "FETCH_SUCCESS", data });
      })
      .catch((error: LoanRegistryError) => {
        if (requestedIdRef.current !== id || requestTokenRef.current !== token) {
          return; // stale
        }
        dispatch({ type: "FETCH_ERROR", error });
      });
  }, []);

  useEffect(() => {
    if (loanId === null) {
      requestedIdRef.current = null;
      requestTokenRef.current += 1; // invalidate any in-flight request
      dispatch({ type: "RESET" });
      return;
    }
    load(loanId);
  }, [loanId, load]);

  const refresh = useCallback(() => {
    if (loanId === null) return;
    load(loanId);
  }, [loanId, load]);

  return { ...state, refresh };
}
