"use client";

/**
 * useLoanRegistryWrite
 *
 * Reusable hook for `loan_registry` contract writes (L2-P06):
 * `createLoanRequest(amount)` and `cancelLoanRequest(loanId)`, sharing
 * one idle/pending/success/failure state so a UI component can show
 * consistent feedback regardless of which action was taken (same
 * shared-state approach `useTransfer` uses for its one `submit`
 * action).
 *
 * Takes the connected wallet's address as a parameter — same
 * convention as `useTransfer`'s `sourceAddress` param — rather than
 * calling `useWallet()` internally, so the caller decides where
 * wallet state comes from and this hook stays focused on the
 * contract-write lifecycle.
 *
 * State transitions are delegated to the shared, directly-tested
 * `contractWriteReducer` (see `contractWriteState.ts`). Stale-request
 * protection mirrors `useLoanCount`/`useLoanRequest` (L2-P05): a
 * request token guards against an older in-flight call's result
 * overwriting a newer one (e.g. the user clicks "cancel" again, or
 * triggers a different action, before the first call resolves).
 */

import { useCallback, useReducer, useRef } from "react";
import { createLoanRequest, cancelLoanRequest } from "@/lib/stellar/loanRegistry";
import { isContractWriteError } from "@/lib/stellar/loanRegistryErrors";
import type { ContractWriteError } from "@/lib/stellar/loanRegistry";
import {
  contractWriteReducer,
  initialContractWriteState,
  type ContractWriteState,
} from "./contractWriteState";

export interface LoanRegistryWriteResult {
  /** Present only after a successful createLoanRequest. */
  loanId: number | null;
}

export interface UseLoanRegistryWriteResult
  extends ContractWriteState<LoanRegistryWriteResult, ContractWriteError> {
  createLoanRequest: (amount: string) => Promise<void>;
  cancelLoanRequest: (loanId: number) => Promise<void>;
  reset: () => void;
}

const NOT_CONNECTED_ERROR: ContractWriteError = {
  code: "NOT_CONNECTED",
  message: "Connect your wallet before submitting a loan request.",
};

const INVALID_AMOUNT_ERROR: ContractWriteError = {
  code: "INVALID_AMOUNT",
  message: "Enter a whole number amount greater than zero.",
};

/** A non-negative integer with at least one nonzero digit, e.g. "500". */
const WHOLE_POSITIVE_AMOUNT = /^\d+$/;

export function useLoanRegistryWrite(
  sourceAddress: string | null
): UseLoanRegistryWriteResult {
  const [state, dispatch] = useReducer(
    contractWriteReducer<LoanRegistryWriteResult, ContractWriteError>,
    initialContractWriteState<LoanRegistryWriteResult, ContractWriteError>()
  );

  // Guards against a stale response (e.g. an earlier call resolving
  // after a newer one was already issued) applying outdated state —
  // same token pattern as useLoanCount/useLoanRequest.
  const requestTokenRef = useRef(0);

  const create = useCallback(
    async (amount: string) => {
      if (!sourceAddress) {
        requestTokenRef.current += 1; // invalidate any in-flight request
        dispatch({ type: "FAILURE", error: NOT_CONNECTED_ERROR });
        return;
      }
      if (!WHOLE_POSITIVE_AMOUNT.test(amount) || BigInt(amount) <= BigInt(0)) {
        requestTokenRef.current += 1;
        dispatch({ type: "FAILURE", error: INVALID_AMOUNT_ERROR });
        return;
      }

      const token = ++requestTokenRef.current;
      dispatch({ type: "PENDING" });

      try {
        const { txHash, loanId } = await createLoanRequest({
          sourceAddress,
          amount: BigInt(amount),
        });
        if (requestTokenRef.current !== token) return; // superseded
        dispatch({ type: "SUCCESS", txHash, result: { loanId } });
      } catch (error) {
        if (requestTokenRef.current !== token) return; // superseded
        dispatch({ type: "FAILURE", error: normalizeWriteError(error) });
      }
    },
    [sourceAddress]
  );

  const cancel = useCallback(
    async (loanId: number) => {
      if (!sourceAddress) {
        requestTokenRef.current += 1;
        dispatch({ type: "FAILURE", error: NOT_CONNECTED_ERROR });
        return;
      }

      const token = ++requestTokenRef.current;
      dispatch({ type: "PENDING" });

      try {
        const { txHash } = await cancelLoanRequest({ sourceAddress, loanId });
        if (requestTokenRef.current !== token) return; // superseded
        dispatch({ type: "SUCCESS", txHash, result: { loanId: null } });
      } catch (error) {
        if (requestTokenRef.current !== token) return; // superseded
        dispatch({ type: "FAILURE", error: normalizeWriteError(error) });
      }
    },
    [sourceAddress]
  );

  const reset = useCallback(() => {
    requestTokenRef.current += 1; // invalidate any in-flight request
    dispatch({ type: "RESET" });
  }, []);

  return {
    ...state,
    createLoanRequest: create,
    cancelLoanRequest: cancel,
    reset,
  };
}

/**
 * Defensive fallback: `loanRegistry.ts`'s write functions always
 * throw a well-formed `ContractWriteError` (every catch path in
 * `createLoanRequest`/`cancelLoanRequest` goes through
 * `toContractWriteError`), but this guard means a genuinely
 * unexpected thrown value still can't crash the hook or leak a raw
 * error into UI state.
 */
function normalizeWriteError(err: unknown): ContractWriteError {
  if (isContractWriteError(err)) return err;
  return { code: "UNKNOWN", message: "Something went wrong submitting the transaction. Please try again." };
}
