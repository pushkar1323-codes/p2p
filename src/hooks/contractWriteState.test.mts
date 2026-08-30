import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contractWriteReducer,
  initialContractWriteState,
} from "./contractWriteState.ts";

// --- Initial state ---------------------------------------------

test("initial state is idle with no txHash, result, or error", () => {
  const state = initialContractWriteState<{ loanId: number }, { code: string }>();
  assert.equal(state.status, "idle");
  assert.equal(state.txHash, null);
  assert.equal(state.result, null);
  assert.equal(state.error, null);
});

// --- Pending state ---------------------------------------------

test("PENDING moves to pending and clears any previous txHash/result/error", () => {
  const prior = {
    status: "success" as const,
    txHash: "old-hash",
    result: { loanId: 1 },
    error: null,
  };
  const next = contractWriteReducer(prior, { type: "PENDING" });
  assert.equal(next.status, "pending");
  assert.equal(next.txHash, null);
  assert.equal(next.result, null);
  assert.equal(next.error, null);
});

test("PENDING after a failure also clears the stale error", () => {
  const prior = {
    status: "failure" as const,
    txHash: null,
    result: null,
    error: { code: "REJECTED" },
  };
  const next = contractWriteReducer(prior, { type: "PENDING" });
  assert.equal(next.status, "pending");
  assert.equal(next.error, null);
});

// --- Successful transaction ---------------------------------------------

test("SUCCESS moves to success and exposes the real txHash and result", () => {
  const pending = contractWriteReducer(
    initialContractWriteState<{ loanId: number }, { code: string }>(),
    { type: "PENDING" }
  );
  const next = contractWriteReducer(pending, {
    type: "SUCCESS",
    txHash: "abcd1234",
    result: { loanId: 7 },
  });
  assert.equal(next.status, "success");
  assert.equal(next.txHash, "abcd1234");
  assert.deepEqual(next.result, { loanId: 7 });
  assert.equal(next.error, null);
});

test("SUCCESS with a null result (e.g. cancelLoanRequest) still exposes the txHash", () => {
  const next = contractWriteReducer(
    initialContractWriteState<{ loanId: number | null }, { code: string }>(),
    { type: "SUCCESS", txHash: "abcd1234", result: null }
  );
  assert.equal(next.status, "success");
  assert.equal(next.txHash, "abcd1234");
  assert.equal(next.result, null);
});

// --- Failed transaction ---------------------------------------------

test("FAILURE moves to failure, exposes the typed error, and does not set a txHash", () => {
  const next = contractWriteReducer(
    initialContractWriteState<{ loanId: number }, { code: string; message: string }>(),
    { type: "FAILURE", error: { code: "REJECTED", message: "The request was rejected in your wallet." } }
  );
  assert.equal(next.status, "failure");
  assert.equal(next.txHash, null);
  assert.equal(next.result, null);
  assert.deepEqual(next.error, { code: "REJECTED", message: "The request was rejected in your wallet." });
});

// --- Reset ---------------------------------------------

test("RESET returns to idle from a success state, clearing txHash and result", () => {
  const success = contractWriteReducer(
    initialContractWriteState<{ loanId: number }, { code: string }>(),
    { type: "SUCCESS", txHash: "abcd1234", result: { loanId: 3 } }
  );
  const next = contractWriteReducer(success, { type: "RESET" });
  assert.equal(next.status, "idle");
  assert.equal(next.txHash, null);
  assert.equal(next.result, null);
  assert.equal(next.error, null);
});

test("RESET returns to idle from a failure state, clearing the error", () => {
  const failure = contractWriteReducer(
    initialContractWriteState<{ loanId: number }, { code: string }>(),
    { type: "FAILURE", error: { code: "UNKNOWN" } }
  );
  const next = contractWriteReducer(failure, { type: "RESET" });
  assert.equal(next.status, "idle");
  assert.equal(next.error, null);
});

test("RESET returns to idle from a pending state", () => {
  const pending = contractWriteReducer(
    initialContractWriteState<{ loanId: number }, { code: string }>(),
    { type: "PENDING" }
  );
  const next = contractWriteReducer(pending, { type: "RESET" });
  assert.equal(next.status, "idle");
});

// --- Retry ---------------------------------------------

test("a retry after failure (PENDING again) clears the stale error before the new attempt resolves", () => {
  let state = contractWriteReducer(
    initialContractWriteState<{ loanId: number }, { code: string }>(),
    { type: "FAILURE", error: { code: "NETWORK_ERROR" } }
  );
  assert.equal(state.status, "failure");

  state = contractWriteReducer(state, { type: "PENDING" });
  assert.equal(state.status, "pending");
  assert.equal(state.error, null);

  state = contractWriteReducer(state, {
    type: "SUCCESS",
    txHash: "retry-hash",
    result: { loanId: 9 },
  });
  assert.equal(state.status, "success");
  assert.equal(state.txHash, "retry-hash");
});

test("a new transaction after a prior success does not leak the old txHash/result while pending", () => {
  let state = contractWriteReducer(
    initialContractWriteState<{ loanId: number }, { code: string }>(),
    { type: "SUCCESS", txHash: "first-hash", result: { loanId: 1 } }
  );
  state = contractWriteReducer(state, { type: "PENDING" });
  assert.equal(state.status, "pending");
  assert.equal(state.txHash, null);
  assert.equal(state.result, null);
});
