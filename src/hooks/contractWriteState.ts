/**
 * Pure idle/pending/success/failure state machine for contract writes
 * (L2-P06), shared by `useLoanRegistryWrite`.
 *
 * Mirrors `contractReadState.ts`'s pattern (kept as a plain reducer
 * function, no React import, directly unit-testable without a DOM or
 * React Testing Library — see that file's doc comment for the full
 * reasoning) but with write-appropriate status names and a named
 * `txHash` field, matching this task's explicitly requested hook
 * shape rather than reusing the read reducer's generic `data` field.
 */

export type ContractWriteStatus = "idle" | "pending" | "success" | "failure";

export interface ContractWriteState<R, E> {
  status: ContractWriteStatus;
  txHash: string | null;
  result: R | null;
  error: E | null;
}

export type ContractWriteAction<R, E> =
  | { type: "RESET" }
  | { type: "PENDING" }
  | { type: "SUCCESS"; txHash: string; result: R | null }
  | { type: "FAILURE"; error: E };

export function initialContractWriteState<R, E>(): ContractWriteState<R, E> {
  return { status: "idle", txHash: null, result: null, error: null };
}

export function contractWriteReducer<R, E>(
  state: ContractWriteState<R, E>,
  action: ContractWriteAction<R, E>
): ContractWriteState<R, E> {
  switch (action.type) {
    case "RESET":
      return { status: "idle", txHash: null, result: null, error: null };
    case "PENDING":
      // A new transaction starting always clears any previous
      // result/hash/error (L2-P06 §14: "A previous transaction result
      // must not leak into the new transaction state").
      return { status: "pending", txHash: null, result: null, error: null };
    case "SUCCESS":
      return { status: "success", txHash: action.txHash, result: action.result, error: null };
    case "FAILURE":
      return { status: "failure", txHash: null, result: null, error: action.error };
    default:
      return state;
  }
}
