"use client";

/**
 * useLoanRegistryList (FCP-02)
 *
 * Loads every `loan_registry` loan request, for Browse Loans and My
 * Loans (My Loans reuses this same data, filtered client-side by
 * borrower — see `MyLoansSection.tsx`/`filterLoansByBorrower`). This
 * is a real client-side scan built on the existing
 * `get_loan_count`/`get_loan_request` reads (L2-P05) — see
 * `lib/stellar/loanRegistryList.ts`'s doc comment for why (no batch
 * read entrypoint, no backend index exists yet).
 *
 * State transitions delegate to the shared, directly-tested
 * `contractReadReducer` (`contractReadState.ts`), same as
 * `useLoanCount`/`useLoanRequest`. A stale-request token guards
 * against an older in-flight load overwriting a newer one (e.g. two
 * `refresh()` calls in quick succession) — same pattern those hooks
 * already use.
 *
 * A partial failure (some individual loan ids failed to load) does
 * not fail the whole list — see `aggregateLoanListResults` — since
 * the count read and most individual reads can very plausibly have
 * still succeeded; it's surfaced honestly via `data.failedIds`
 * instead.
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import { getLoanCount, getLoanRequest } from "@/lib/stellar/loanRegistry";
import type { LoanRegistryError } from "@/lib/stellar/loanRegistry";
import { loanIdsToFetch, aggregateLoanListResults, type LoanListOutcome } from "@/lib/stellar/loanRegistryList";
import {
  contractReadReducer,
  initialContractReadState,
  type ContractReadState,
} from "./contractReadState";

export interface UseLoanRegistryListResult
  extends ContractReadState<LoanListOutcome, LoanRegistryError> {
  refresh: () => void;
}

export function useLoanRegistryList(): UseLoanRegistryListResult {
  const [state, dispatch] = useReducer(
    contractReadReducer<LoanListOutcome, LoanRegistryError>,
    initialContractReadState<LoanListOutcome, LoanRegistryError>()
  );
  const requestTokenRef = useRef(0);

  const load = useCallback(() => {
    const token = ++requestTokenRef.current;
    dispatch({ type: "FETCH_START" });

    getLoanCount()
      .then(async (count) => {
        if (requestTokenRef.current !== token) return; // stale — superseded by a newer load
        const ids = loanIdsToFetch(count);
        const results = await Promise.allSettled(ids.map((id) => getLoanRequest(id)));
        if (requestTokenRef.current !== token) return; // stale
        dispatch({ type: "FETCH_SUCCESS", data: aggregateLoanListResults(ids, results) });
      })
      .catch((error: LoanRegistryError) => {
        if (requestTokenRef.current !== token) return; // stale
        dispatch({ type: "FETCH_ERROR", error });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, refresh: load };
}
