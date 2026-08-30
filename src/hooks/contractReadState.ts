/**
 * Pure loading/success/error state machine shared by this project's
 * contract-read hooks (`useLoanCount`, `useLoanRequest`).
 *
 * Deliberately kept as a plain reducer function with no React
 * import, so it's directly unit-testable with this project's
 * existing test setup (Node's built-in test runner) without needing
 * a DOM or React Testing Library — neither of which this project
 * currently has (see `package.json`). This mirrors the project's
 * established pattern of extracting pure logic out of hooks/services
 * for direct testing (`feedbackContent.ts`, `kitMapping.ts`,
 * `signError.ts`) — applied here to the hook's state transitions,
 * which weren't previously covered by tests anywhere in this
 * codebase (e.g. `useXlmBalance`'s equivalent stale-request-guard
 * logic has no direct test).
 */

export type ContractReadStatus = "idle" | "loading" | "loaded" | "error";

export interface ContractReadState<T, E> {
  status: ContractReadStatus;
  data: T | null;
  error: E | null;
}

export type ContractReadAction<T, E> =
  | { type: "RESET" }
  | { type: "FETCH_START" }
  | { type: "FETCH_SUCCESS"; data: T }
  | { type: "FETCH_ERROR"; error: E };

export function initialContractReadState<T, E>(): ContractReadState<T, E> {
  return { status: "idle", data: null, error: null };
}

export function contractReadReducer<T, E>(
  state: ContractReadState<T, E>,
  action: ContractReadAction<T, E>
): ContractReadState<T, E> {
  switch (action.type) {
    case "RESET":
      return { status: "idle", data: null, error: null };
    case "FETCH_START":
      return { status: "loading", data: null, error: null };
    case "FETCH_SUCCESS":
      return { status: "loaded", data: action.data, error: null };
    case "FETCH_ERROR":
      return { status: "error", data: null, error: action.error };
    default:
      return state;
  }
}
