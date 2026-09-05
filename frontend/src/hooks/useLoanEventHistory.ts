"use client";

/**
 * useLoanEventHistory (FCP-03)
 *
 * Fetches persisted `loan_registry` event history from the backend's
 * `GET /events` endpoint, for the Transactions/History page. Same
 * reducer/stale-token shape as `useLoanRegistryList`/`useLoanCount`
 * (`contractReadState.ts`) even though the data source here is the
 * backend, not a Soroban RPC read — the reducer is generic over its
 * data/error types precisely so this kind of reuse works.
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import { fetchLoanEventHistory, LoanEventHistoryError, type LoanHistoryEvent } from "@/lib/backend/eventsApi";
import { contractReadReducer, initialContractReadState, type ContractReadState } from "./contractReadState";

export interface UseLoanEventHistoryResult
  extends ContractReadState<LoanHistoryEvent[], LoanEventHistoryError> {
  refresh: () => void;
}

export function useLoanEventHistory(contractId?: string): UseLoanEventHistoryResult {
  const [state, dispatch] = useReducer(
    contractReadReducer<LoanHistoryEvent[], LoanEventHistoryError>,
    initialContractReadState<LoanHistoryEvent[], LoanEventHistoryError>()
  );
  const requestTokenRef = useRef(0);

  const load = useCallback(() => {
    const token = ++requestTokenRef.current;
    dispatch({ type: "FETCH_START" });

    fetchLoanEventHistory({ contractId })
      .then((events) => {
        if (requestTokenRef.current !== token) return; // stale
        dispatch({ type: "FETCH_SUCCESS", data: events });
      })
      .catch((error: unknown) => {
        if (requestTokenRef.current !== token) return; // stale
        const normalized =
          error instanceof LoanEventHistoryError
            ? error
            : new LoanEventHistoryError("Something went wrong loading transaction history.");
        dispatch({ type: "FETCH_ERROR", error: normalized });
      });
  }, [contractId]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, refresh: load };
}
