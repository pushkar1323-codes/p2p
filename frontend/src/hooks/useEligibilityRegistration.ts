"use client";

/**
 * useEligibilityRegistration
 *
 * Reusable hook for `eligibility_registry`'s `register(borrower)`
 * write (L3-P07/L3-P14 self-registration correction). One action,
 * unlike `useLoanRegistryWrite`'s two (create/cancel) — otherwise the
 * same idle/pending/success/failure shape, sharing state transitions
 * with the same directly-tested `contractWriteReducer` (see
 * `contractWriteState.ts`) so it can reuse the exact same
 * `TransactionFeedback` UI component as loan_registry's writes.
 *
 * Takes the connected wallet's address as a parameter, same
 * convention as `useLoanRegistryWrite`'s `sourceAddress`, rather than
 * calling `useWallet()` internally.
 */

import { useCallback, useReducer, useRef } from "react";
import { register as registerBorrower } from "@/lib/stellar/eligibilityRegistry";
import { isContractWriteError } from "@/lib/stellar/eligibilityRegistryErrors";
import type { ContractWriteError } from "@/lib/stellar/eligibilityRegistryErrors";
import {
  contractWriteReducer,
  initialContractWriteState,
  type ContractWriteState,
} from "./contractWriteState";

export interface UseEligibilityRegistrationResult
  extends ContractWriteState<null, ContractWriteError> {
  register: () => Promise<void>;
  reset: () => void;
}

const NOT_CONNECTED_ERROR: ContractWriteError = {
  code: "NOT_CONNECTED",
  message: "Connect your wallet before registering.",
};

export function useEligibilityRegistration(
  sourceAddress: string | null
): UseEligibilityRegistrationResult {
  const [state, dispatch] = useReducer(
    contractWriteReducer<null, ContractWriteError>,
    initialContractWriteState<null, ContractWriteError>()
  );

  // Same stale-request guard as useLoanRegistryWrite.
  const requestTokenRef = useRef(0);

  const doRegister = useCallback(async () => {
    if (!sourceAddress) {
      requestTokenRef.current += 1; // invalidate any in-flight request
      dispatch({ type: "FAILURE", error: NOT_CONNECTED_ERROR });
      return;
    }

    const token = ++requestTokenRef.current;
    dispatch({ type: "PENDING" });

    try {
      const { txHash } = await registerBorrower(sourceAddress);
      if (requestTokenRef.current !== token) return; // superseded
      dispatch({ type: "SUCCESS", txHash, result: null });
    } catch (error) {
      if (requestTokenRef.current !== token) return; // superseded
      dispatch({ type: "FAILURE", error: normalizeWriteError(error) });
    }
  }, [sourceAddress]);

  const reset = useCallback(() => {
    requestTokenRef.current += 1; // invalidate any in-flight request
    dispatch({ type: "RESET" });
  }, []);

  return {
    ...state,
    register: doRegister,
    reset,
  };
}

/** Same defensive fallback as useLoanRegistryWrite's identical helper. */
function normalizeWriteError(err: unknown): ContractWriteError {
  if (isContractWriteError(err)) return err;
  return {
    code: "UNKNOWN",
    message: "Something went wrong submitting the transaction. Please try again.",
  };
}
