"use client";

/**
 * useTransfer
 *
 * Drives the XLM send form: validates input, submits the payment via
 * `sendXlm`, and tracks idle/submitting/success/failed state. Does
 * not own balance state itself — accepts the current known balance
 * (for the "amount exceeds balance" check) and a refresh callback so
 * a successful send can refresh the existing balance hook rather than
 * creating a second balance system.
 */

import { useCallback, useState } from "react";
import { isValidStellarAddress, sendXlm } from "@/lib/stellar/transaction";
import type { TransferError, TransferState } from "@/lib/stellar/types";

const idleState: TransferState = {
  status: "idle",
  hash: null,
  error: null,
};

export interface UseTransferParams {
  sourceAddress: string | null;
  /** Known available balance as a decimal string, if loaded. */
  availableBalance: string | null;
  /** Called after a successful transfer to refresh the existing balance hook. */
  onSuccess?: () => void;
}

export interface TransferFormInput {
  destination: string;
  amount: string;
}

export interface UseTransferResult extends TransferState {
  submit: (input: TransferFormInput) => Promise<void>;
  reset: () => void;
}

function validate(
  input: TransferFormInput,
  sourceAddress: string | null,
  availableBalance: string | null
): TransferError | null {
  if (!sourceAddress) {
    return { code: "NOT_CONNECTED", message: "Connect your wallet before sending XLM." };
  }

  const destination = input.destination.trim();
  if (!destination || !isValidStellarAddress(destination)) {
    return {
      code: "INVALID_DESTINATION",
      message: "Enter a valid Stellar Testnet destination address.",
    };
  }

  const amountValue = Number(input.amount);
  if (!input.amount || !Number.isFinite(amountValue) || amountValue <= 0) {
    return {
      code: "INVALID_AMOUNT",
      message: "Enter an amount greater than zero.",
    };
  }

  if (availableBalance !== null) {
    const available = Number(availableBalance);
    if (Number.isFinite(available) && amountValue > available) {
      return {
        code: "INSUFFICIENT_BALANCE",
        message: "Amount exceeds your available XLM balance.",
      };
    }
  }

  return null;
}

export function useTransfer({
  sourceAddress,
  availableBalance,
  onSuccess,
}: UseTransferParams): UseTransferResult {
  const [state, setState] = useState<TransferState>(idleState);

  const submit = useCallback(
    async (input: TransferFormInput) => {
      const validationError = validate(input, sourceAddress, availableBalance);
      if (validationError) {
        setState({ status: "failed", hash: null, error: validationError });
        return;
      }

      setState({ status: "submitting", hash: null, error: null });

      try {
        const hash = await sendXlm({
          sourceAddress: sourceAddress as string,
          destinationAddress: input.destination.trim(),
          amount: input.amount,
        });
        setState({ status: "success", hash, error: null });
        onSuccess?.();
      } catch (err) {
        setState({
          status: "failed",
          hash: null,
          error: normalizeTransferError(err),
        });
      }
    },
    [sourceAddress, availableBalance, onSuccess]
  );

  const reset = useCallback(() => {
    setState(idleState);
  }, []);

  return {
    ...state,
    submit,
    reset,
  };
}

function normalizeTransferError(err: unknown): TransferError {
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "message" in err
  ) {
    return err as TransferError;
  }
  return {
    code: "UNKNOWN",
    message: err instanceof Error ? err.message : "Failed to send XLM.",
  };
}
