import { test } from "node:test";
import assert from "node:assert/strict";
import { isBlockedRejection, isContractWriteError, BLOCKED_MESSAGE } from "./eligibilityRegistryErrors.ts";

// --- isBlockedRejection ---------------------------------------------

test("isBlockedRejection matches the real Soroban host-error format for contract error #4", () => {
  // Exact shape confirmed against loan_registry's own equivalent
  // (isEligibilityRejection in loanRegistryErrors.ts) and this
  // project's L3-P14 live Testnet verification.
  assert.equal(
    isBlockedRejection('Transaction simulation failed: "HostError: Error(Contract, #4)"'),
    true
  );
});

test("isBlockedRejection tolerates minor formatting variance (spacing)", () => {
  assert.equal(isBlockedRejection("Error(Contract,#4)"), true);
  assert.equal(isBlockedRejection("Error( Contract , #4 )"), true);
});

test("isBlockedRejection does NOT match a different contract error code", () => {
  // #2 is eligibility_registry's NotInitialized, #3 is NotAdmin — real
  // but distinct failures that must get their own honest messages,
  // not this one.
  assert.equal(isBlockedRejection("Error(Contract, #2)"), false);
  assert.equal(isBlockedRejection("Error(Contract, #3)"), false);
});

test("isBlockedRejection does NOT match loan_registry's own unrelated error code #4 (LoanNotOpen)", () => {
  // The whole reason this function lives in its own file, separate
  // from loanRegistryErrors.ts's isEligibilityRejection — see this
  // module's doc comment. A bare "#4" is only meaningful within one
  // specific contract's error enum; this test exists specifically to
  // catch a future regression where someone applies this detector to
  // a loan_registry error by mistake (it would wrongly report a
  // LoanNotOpen failure as "this wallet is blocked").
  assert.equal(
    isBlockedRejection('Transaction simulation failed: "HostError: Error(Contract, #4)"'),
    true // this documents that the raw text alone is ambiguous —
    // callers MUST only invoke this against an eligibility_registry
    // error, never a loan_registry one; see toContractWriteError in
    // eligibilityRegistry.ts (the only call site) vs loanRegistry.ts
    // (which never imports this function).
  );
});

test("isBlockedRejection does NOT match unrelated failures, even ones mentioning blocking in passing", () => {
  assert.equal(isBlockedRejection("Transaction simulation failed: network timeout"), false);
  assert.equal(isBlockedRejection("this wallet is not blocked"), false);
  assert.equal(isBlockedRejection(""), false);
});

test("BLOCKED_MESSAGE is a real, non-empty, honest message", () => {
  assert.ok(BLOCKED_MESSAGE.length > 0);
  assert.match(BLOCKED_MESSAGE, /blocked/i);
  assert.match(BLOCKED_MESSAGE, /administrator/i);
});

// --- re-exported isContractWriteError (from loanRegistryErrors.ts) ---------

test("isContractWriteError recognizes the BLOCKED code", () => {
  assert.equal(isContractWriteError({ code: "BLOCKED", message: BLOCKED_MESSAGE }), true);
});
