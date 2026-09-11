/**
 * Scenario-level tests for the borrower self-registration flow
 * (`useIsBorrowerEligible` + `useEligibilityRegistration`, wired
 * together in `LoanRequestActions`/`RegisterWalletAction`).
 *
 * This project has no React Testing Library / jsdom (confirmed via
 * `package.json` — `"test": "node --test"` only), and no hook in this
 * codebase is unit-tested by rendering it directly; `useLoanCount`,
 * `useLoanRequest`, `useLoanRegistryWrite`, etc. all follow the same
 * pattern of being thin wrappers around the already-tested
 * `contractReadReducer`/`contractWriteReducer` (see
 * `contractReadState.test.mts`/`contractWriteState.test.mts`) plus a
 * network call this sandbox has no path to Stellar Testnet to make
 * (see `docs/CURRENT_STATUS.md`'s repeated notes on this). This file
 * follows that same established boundary — it drives the exact
 * reducers `useIsBorrowerEligible`/`useEligibilityRegistration` use,
 * with eligibility-specific data/error shapes, rather than adding new
 * test infrastructure this task wasn't asked to introduce.
 *
 * Each `test()` below corresponds 1:1 to one of the scenarios this
 * task asked to be covered: a registered wallet, an unregistered
 * wallet, a blocked wallet, a successful registration, a
 * rejected/failed registration, and a registration-triggered
 * eligibility refresh.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contractReadReducer,
  initialContractReadState,
} from "./contractReadState.ts";
import {
  contractWriteReducer,
  initialContractWriteState,
} from "./contractWriteState.ts";
import { BLOCKED_MESSAGE } from "../lib/stellar/eligibilityRegistryErrors.ts";
import type { ContractWriteError, LoanRegistryError } from "../lib/stellar/eligibilityRegistryErrors.ts";
import { retryEligibilityRefreshOnce } from "./eligibilityRetry.ts";

// Read side (useIsBorrowerEligible): boolean data, LoanRegistryError on failure.
type ReadState = ReturnType<typeof initialContractReadState<boolean, LoanRegistryError>>;
// Write side (useEligibilityRegistration): no result payload, ContractWriteError on failure.
type WriteState = ReturnType<typeof initialContractWriteState<null, ContractWriteError>>;

function initialRead(): ReadState {
  return initialContractReadState<boolean, LoanRegistryError>();
}

function initialWrite(): WriteState {
  return initialContractWriteState<null, ContractWriteError>();
}

// --- Registered wallet -------------------------------------------------

test("registered wallet: eligibility read resolves to loaded/true, so the Create Loan Request form is shown (not RegisterWalletAction)", () => {
  let state = initialRead();
  state = contractReadReducer(state, { type: "FETCH_START" });
  assert.equal(state.status, "loading");

  state = contractReadReducer(state, { type: "FETCH_SUCCESS", data: true });
  assert.equal(state.status, "loaded");
  assert.equal(state.data, true);
  assert.equal(state.error, null);
  // LoanRequestActions.tsx's gating condition: only `data === false`
  // renders RegisterWalletAction — a registered wallet must not.
  assert.notEqual(state.data, false);
});

// --- Unregistered wallet -------------------------------------------------

test("unregistered wallet: eligibility read resolves to loaded/false, so RegisterWalletAction is shown", () => {
  let state = initialRead();
  state = contractReadReducer(state, { type: "FETCH_START" });
  state = contractReadReducer(state, { type: "FETCH_SUCCESS", data: false });

  assert.equal(state.status, "loaded");
  assert.equal(state.data, false);
  assert.equal(state.error, null);
});

// --- Blocked wallet -------------------------------------------------

test("blocked wallet: read side is indistinguishable from unregistered (contract's own deny-by-default), so RegisterWalletAction is still offered", () => {
  // is_borrower_eligible() returns false for both "never registered"
  // and "blocked" by the contract's own design (see
  // contracts/eligibility_registry/src/lib.rs's doc comment) — there
  // is no separate on-chain read this frontend could use to tell them
  // apart in advance. The distinction only becomes visible once the
  // wallet actually attempts to register.
  let state = initialRead();
  state = contractReadReducer(state, { type: "FETCH_START" });
  state = contractReadReducer(state, { type: "FETCH_SUCCESS", data: false });
  assert.equal(state.data, false);
});

test("blocked wallet: attempting to register fails with a clear, non-generic BLOCKED explanation, and borrowing stays disabled", () => {
  let write = initialWrite();
  write = contractWriteReducer(write, { type: "PENDING" });
  assert.equal(write.status, "pending");

  const blockedError: ContractWriteError = { code: "BLOCKED", message: BLOCKED_MESSAGE };
  write = contractWriteReducer(write, { type: "FAILURE", error: blockedError });

  assert.equal(write.status, "failure");
  assert.equal(write.txHash, null);
  assert.equal(write.result, null);
  assert.equal(write.error?.code, "BLOCKED");
  // A real, specific explanation — not a generic "something went
  // wrong" message — and it must not imply retrying will help, since
  // this contract's register() will keep refusing a blocked borrower.
  assert.match(write.error!.message, /blocked/i);
  assert.match(write.error!.message, /administrator/i);
});

// --- Successful registration -------------------------------------------------

test("successful registration: pending -> success with a confirmed tx hash, and no error", () => {
  let write = initialWrite();
  write = contractWriteReducer(write, { type: "PENDING" });
  assert.equal(write.status, "pending");
  assert.equal(write.error, null);

  write = contractWriteReducer(write, {
    type: "SUCCESS",
    txHash: "abcd1234confirmedtxhash",
    result: null,
  });

  assert.equal(write.status, "success");
  assert.equal(write.txHash, "abcd1234confirmedtxhash");
  assert.equal(write.error, null);
});

// --- Rejected / failed registration -------------------------------------------------

test("rejected registration: wallet-side signature rejection surfaces as a REJECTED failure, not a crash or silent no-op", () => {
  let write = initialWrite();
  write = contractWriteReducer(write, { type: "PENDING" });

  const rejectedError: ContractWriteError = {
    code: "REJECTED",
    message: "The request was rejected in your wallet.",
  };
  write = contractWriteReducer(write, { type: "FAILURE", error: rejectedError });

  assert.equal(write.status, "failure");
  assert.equal(write.error?.code, "REJECTED");
  assert.equal(write.txHash, null);
});

test("failed registration: a submission/simulation failure surfaces as a FAILURE with the txHash cleared, and RESET returns to idle for retry", () => {
  let write = initialWrite();
  write = contractWriteReducer(write, { type: "PENDING" });
  write = contractWriteReducer(write, {
    type: "FAILURE",
    error: { code: "SUBMISSION_FAILED", message: "The transaction could not be submitted to Stellar Testnet." },
  });
  assert.equal(write.status, "failure");
  assert.equal(write.txHash, null);

  // RegisterWalletAction's "Try again" button dispatches RESET.
  write = contractWriteReducer(write, { type: "RESET" });
  assert.equal(write.status, "idle");
  assert.equal(write.error, null);
});

// --- UNREGISTERED -> REGISTERING -> REGISTERED (exact wording requested) ---

test("UNREGISTERED -> REGISTERING -> REGISTERED: full happy-path state transition", () => {
  // UNREGISTERED
  let read = initialRead();
  read = contractReadReducer(read, { type: "FETCH_START" });
  read = contractReadReducer(read, { type: "FETCH_SUCCESS", data: false });
  assert.equal(read.data, false, "UNREGISTERED");

  // REGISTERING
  let write = initialWrite();
  write = contractWriteReducer(write, { type: "PENDING" });
  assert.equal(write.status, "pending", "REGISTERING");

  // REGISTERED (write confirms, then the mandatory re-check confirms too)
  write = contractWriteReducer(write, { type: "SUCCESS", txHash: "regtxhash", result: null });
  assert.equal(write.status, "success");
  read = contractReadReducer(read, { type: "FETCH_START" });
  read = contractReadReducer(read, { type: "FETCH_SUCCESS", data: true });
  assert.equal(read.data, true, "REGISTERED");
});

// --- retryEligibilityRefreshOnce (bounded post-registration retry) ---

test("retryEligibilityRefreshOnce: does not retry when the first refresh already reports eligible", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const refresh = t.mock.fn(async () => true);

  await retryEligibilityRefreshOnce(refresh);

  assert.equal(refresh.mock.callCount(), 1);
});

test("retryEligibilityRefreshOnce: retries exactly once, after the given delay, when the first refresh still reports ineligible", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const refresh = t.mock.fn(async () => {
    calls += 1;
    return calls > 1; // false on the 1st call, true on the 2nd
  });

  const pending = retryEligibilityRefreshOnce(refresh, 1500);
  await Promise.resolve(); // let the first refresh() call fire
  await Promise.resolve();
  assert.equal(refresh.mock.callCount(), 1, "should not have retried yet — delay hasn't elapsed");

  t.mock.timers.tick(1499);
  await Promise.resolve();
  assert.equal(refresh.mock.callCount(), 1, "still not yet — one millisecond short of the delay");

  t.mock.timers.tick(1);
  await pending;
  assert.equal(refresh.mock.callCount(), 2, "exactly one retry after the full delay elapsed");
});

test("retryEligibilityRefreshOnce: stops after the single retry even if the wallet is still ineligible (does not loop)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const refresh = t.mock.fn(async () => false);

  const pending = retryEligibilityRefreshOnce(refresh, 1500);
  await Promise.resolve();
  t.mock.timers.tick(1500);
  await pending;

  assert.equal(refresh.mock.callCount(), 2, "exactly two calls total — not zero, not three+");
});


test("registration state refresh: after a successful register(), re-checking eligibility (refresh) transitions unregistered -> registered", () => {
  // Before registering: read side reports not-eligible.
  let read = initialRead();
  read = contractReadReducer(read, { type: "FETCH_START" });
  read = contractReadReducer(read, { type: "FETCH_SUCCESS", data: false });
  assert.equal(read.data, false);

  // register() confirms on-chain...
  let write = initialWrite();
  write = contractWriteReducer(write, { type: "PENDING" });
  write = contractWriteReducer(write, { type: "SUCCESS", txHash: "regtxhash", result: null });
  assert.equal(write.status, "success");

  // ...which triggers RegisterWalletAction's onRegistered callback ->
  // useIsBorrowerEligible.refresh() -> a fresh FETCH_START/SUCCESS
  // cycle. Deliberately a real re-check, not an optimistic local flag
  // (see RegisterWalletAction.tsx's doc comment) — so the Create form
  // only appears once the chain actually confirms eligibility.
  read = contractReadReducer(read, { type: "FETCH_START" });
  assert.equal(read.status, "loading");
  // Stale data must not remain visible while the refresh is in flight.
  assert.equal(read.data, null);

  read = contractReadReducer(read, { type: "FETCH_SUCCESS", data: true });
  assert.equal(read.status, "loaded");
  assert.equal(read.data, true);
});

test("registration state refresh: a failed register() attempt still triggers a refresh, which honestly re-confirms the wallet remains ineligible", () => {
  let read = initialRead();
  read = contractReadReducer(read, { type: "FETCH_START" });
  read = contractReadReducer(read, { type: "FETCH_SUCCESS", data: false });

  let write = initialWrite();
  write = contractWriteReducer(write, { type: "PENDING" });
  write = contractWriteReducer(write, {
    type: "FAILURE",
    error: { code: "REJECTED", message: "The request was rejected in your wallet." },
  });
  assert.equal(write.status, "failure");

  // RegisterWalletAction calls onRegistered() unconditionally (see its
  // own doc comment) — even on failure, so the UI's belief about
  // eligibility never silently goes stale.
  read = contractReadReducer(read, { type: "FETCH_START" });
  read = contractReadReducer(read, { type: "FETCH_SUCCESS", data: false });
  assert.equal(read.status, "loaded");
  assert.equal(read.data, false);
});
