"use client";

/**
 * useLoanCount
 *
 * Reads `loan_registry`'s `get_loan_count()` (L2-P05). Fetches once
 * on mount; call `refresh()` to re-fetch (e.g. after creating a loan
 * request, once that flow exists in a later task).
 *
 * State transitions are delegated to the shared, directly-tested
 * `contractReadReducer` (see `contractReadState.ts`) — this hook is
 * a thin wrapper: track the latest in-flight request (so a
 * late-resolving response after `refresh()` is called again can't
 * overwrite newer state, same pattern as `useXlmBalance`) and call
 * the service.
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import { getLoanCount } from "@/lib/stellar/loanRegistry";
import type { LoanRegistryError } from "@/lib/stellar/loanRegistry";
import {
  contractReadReducer,
  initialContractReadState,
  type ContractReadState,
} from "./contractReadState";

export interface UseLoanCountResult extends ContractReadState<number, LoanRegistryError> {
  refresh: () => void;
}

export function useLoanCount(): UseLoanCountResult {
  const [state, dispatch] = useReducer(
    contractReadReducer<number, LoanRegistryError>,
    initialContractReadState<number, LoanRegistryError>()
  );

  // Guards against a stale response (e.g. an earlier refresh()'s
  // fetch resolving after a newer one was already issued) applying
  // outdated state.
  const requestTokenRef = useRef(0);

  const load = useCallback(() => {
    const token = ++requestTokenRef.current;
    dispatch({ type: "FETCH_START" });

    getLoanCount()
      .then((data) => {
        if (requestTokenRef.current !== token) return; // superseded
        dispatch({ type: "FETCH_SUCCESS", data });
      })
      .catch((error: LoanRegistryError) => {
        if (requestTokenRef.current !== token) return; // superseded
        dispatch({ type: "FETCH_ERROR", error });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, refresh: load };
}
