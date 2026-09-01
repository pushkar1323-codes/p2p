"use client";

/**
 * useLoanRequest
 *
 * Reads a single loan request by id — `loan_registry`'s
 * `get_loan_request(loan_id)` (L2-P05). Pass `null` for `loanId`
 * (e.g. before the user has picked one) to keep state idle without
 * fetching — same "null key means idle, no fetch" convention as
 * `useXlmBalance`'s `address` parameter.
 *
 * State transitions are delegated to the shared, directly-tested
 * `contractReadReducer` (see `contractReadState.ts`).
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import { getLoanRequest } from "@/lib/stellar/loanRegistry";
import type { LoanRegistryError, LoanRequest } from "@/lib/stellar/loanRegistry";
import {
  contractReadReducer,
  initialContractReadState,
  type ContractReadState,
} from "./contractReadState";

export interface UseLoanRequestResult
  extends ContractReadState<LoanRequest, LoanRegistryError> {
  refresh: () => void;
}

export function useLoanRequest(loanId: number | null): UseLoanRequestResult {
  const [state, dispatch] = useReducer(
    contractReadReducer<LoanRequest, LoanRegistryError>,
    initialContractReadState<LoanRequest, LoanRegistryError>()
  );

  const requestedIdRef = useRef<number | null>(null);
  const requestTokenRef = useRef(0);

  const load = useCallback((id: number) => {
    requestedIdRef.current = id;
    const token = ++requestTokenRef.current;
    dispatch({ type: "FETCH_START" });

    getLoanRequest(id)
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
