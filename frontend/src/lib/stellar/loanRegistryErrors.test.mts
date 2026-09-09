import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyReadError,
  classifyWriteError,
  contractStateExpiredError,
  isContractWriteError,
  isEligibilityRejection,
  isFundingAmountMismatchRejection,
  isLenderIsBorrowerRejection,
  isLoanNotOpenForFundingRejection,
  isLoanRegistryError,
  canFundLoan,
  FUNDING_AMOUNT_MISMATCH_MESSAGE,
  LENDER_IS_BORROWER_MESSAGE,
  LOAN_NOT_OPEN_FOR_FUNDING_MESSAGE,
  NOT_ELIGIBLE_MESSAGE,
  parseLoanStatus,
  resolveConfirmedTxHash,
  resolveOkResult,
} from "./loanRegistryErrors.ts";

// --- parseLoanStatus ---------------------------------------------

test("parseLoanStatus accepts a plain string shape", () => {
  assert.equal(parseLoanStatus("Open"), "Open");
  assert.equal(parseLoanStatus("Cancelled"), "Cancelled");
  // L3-P12 correction: "Funded" is now a real, expected status — the
  // currently deployed contract can genuinely return it (fund_loan
  // exists and is wired to a real frontend flow now), not just an
  // unrecognized value to reject.
  assert.equal(parseLoanStatus("Funded"), "Funded");
});

test("parseLoanStatus accepts a {tag} object shape (generated TS bindings convention)", () => {
  assert.equal(parseLoanStatus({ tag: "Open", values: undefined }), "Open");
  assert.equal(parseLoanStatus({ tag: "Cancelled" }), "Cancelled");
  assert.equal(parseLoanStatus({ tag: "Funded" }), "Funded");
});

test("parseLoanStatus accepts a [tag] array shape", () => {
  assert.equal(parseLoanStatus(["Open"]), "Open");
  assert.equal(parseLoanStatus(["Cancelled"]), "Cancelled");
  assert.equal(parseLoanStatus(["Funded"]), "Funded");
});

test("parseLoanStatus throws on an unrecognized value rather than silently guessing", () => {
  // A status the deployed contract does not (yet) return at all —
  // see contracts/loan_registry/src/types.rs's full LoanStatus enum
  // (Repaying/Repaid/Defaulted exist on-chain but are explicitly out
  // of this task's scope, per L3-P12's own scope control).
  assert.throws(() => parseLoanStatus("Repaying"));
  assert.throws(() => parseLoanStatus(null));
  assert.throws(() => parseLoanStatus(42));
  assert.throws(() => parseLoanStatus({ tag: "SomethingElse" }));
});

// --- classifyReadError ---------------------------------------------

test("a network-ish failure message maps to NETWORK_ERROR with a safe message", () => {
  const error = classifyReadError(new Error("fetch failed"));
  assert.equal(error.code, "NETWORK_ERROR");
  assert.equal(
    error.message,
    "Could not reach the Stellar network. Check your connection and try again."
  );
});

test("classifyReadError recognizes several network-failure phrasings", () => {
  for (const message of [
    "ECONNREFUSED",
    "getaddrinfo ENOTFOUND soroban-testnet.stellar.org",
    "request timeout",
    "The operation was aborted",
  ]) {
    assert.equal(classifyReadError(new Error(message)).code, "NETWORK_ERROR");
  }
});

// Regression test for the live "Something went wrong reading contract
// data" report: real browsers throw network/CORS/DNS failures with
// wording the old pattern (`/fetch failed/i`, Node-style) did not
// match, so they fell through to UNKNOWN instead of NETWORK_ERROR.
test("classifyReadError recognizes real browser fetch-failure wording (not just Node's)", () => {
  for (const message of [
    "Failed to fetch", // Chrome/Edge TypeError
    "NetworkError when attempting to fetch resource.", // Firefox
    "Load failed", // Safari
    "TypeError: Failed to fetch",
  ]) {
    assert.equal(
      classifyReadError(new Error(message)).code,
      "NETWORK_ERROR",
      `expected "${message}" to classify as NETWORK_ERROR`
    );
  }
});

test("classifyReadError retains the raw message in .internal without putting it in .message", () => {
  const error = classifyReadError(new Error("Failed to fetch"));
  assert.equal(error.internal, "Failed to fetch");
  assert.notEqual(error.message, "Failed to fetch");
});

test("an unrelated/unexpected error falls back to the safe UNKNOWN classification", () => {
  const error = classifyReadError(new Error("some internal RPC detail"));
  assert.equal(error.code, "UNKNOWN");
  assert.equal(error.message, "Something went wrong reading contract data. Please try again.");
});

test("classifyReadError never exposes the raw underlying error message", () => {
  const raw = "simulation failed: host error at frame #3, contract abcd1234";
  const error = classifyReadError(new Error(raw));
  assert.notEqual(error.message, raw);
  assert.ok(!error.message.includes("frame #3"));
});

test("classifyReadError handles a non-Error thrown value safely", () => {
  const error = classifyReadError("a raw string throw");
  assert.equal(error.code, "UNKNOWN");
});

// --- contractStateExpiredError ---------------------------------------------

test("contractStateExpiredError returns STATE_EXPIRED with a safe, non-blaming message", () => {
  const error = contractStateExpiredError("ExpiredStateError: entry has expired");
  assert.equal(error.code, "STATE_EXPIRED");
  assert.ok(error.message.length > 0);
  assert.ok(!/expiredstateerror/i.test(error.message)); // no raw class name leaked
  assert.equal(error.internal, "ExpiredStateError: entry has expired");
});

test("contractStateExpiredError works without an internal detail", () => {
  const error = contractStateExpiredError();
  assert.equal(error.code, "STATE_EXPIRED");
  assert.equal(error.internal, undefined);
});

// --- isLoanRegistryError ---------------------------------------------

test("isLoanRegistryError recognizes a well-formed LoanRegistryError", () => {
  assert.equal(
    isLoanRegistryError({ code: "LOAN_NOT_FOUND", message: "No loan request found with id 5." }),
    true
  );
});

test("isLoanRegistryError recognizes the STATE_EXPIRED code", () => {
  assert.equal(isLoanRegistryError({ code: "STATE_EXPIRED", message: "x" }), true);
});

test("isLoanRegistryError recognizes the FUNDING_NOT_FOUND code (L3-P12)", () => {
  assert.equal(
    isLoanRegistryError({ code: "FUNDING_NOT_FOUND", message: "Loan 5 hasn't been funded yet." }),
    true
  );
});

test("isLoanRegistryError rejects plain Errors and other shapes", () => {
  assert.equal(isLoanRegistryError(new Error("boom")), false);
  assert.equal(isLoanRegistryError({ code: "SOMETHING_ELSE", message: "x" }), false);
  assert.equal(isLoanRegistryError(null), false);
  assert.equal(isLoanRegistryError(undefined), false);
});

// --- classifyWriteError (L2-P06) ---------------------------------------------

test("a wallet rejection message maps to REJECTED via the centralized rejection detector", () => {
  const error = classifyWriteError(new Error("User declined access to their public key."));
  assert.equal(error.code, "REJECTED");
  assert.equal(error.message, "The request was rejected in your wallet.");
});

test("classifyWriteError's REJECTED message is wallet-agnostic", () => {
  const error = classifyWriteError(new Error("Request rejected by user in Albedo"));
  assert.equal(error.code, "REJECTED");
  assert.ok(!/freighter|albedo|xbull/i.test(error.message));
});

test("a network-ish failure message maps to NETWORK_ERROR", () => {
  const error = classifyWriteError(new Error("fetch failed"));
  assert.equal(error.code, "NETWORK_ERROR");
});

test("classifyWriteError also recognizes real browser fetch-failure wording", () => {
  assert.equal(classifyWriteError(new Error("Failed to fetch")).code, "NETWORK_ERROR");
  assert.equal(classifyWriteError(new Error("Load failed")).code, "NETWORK_ERROR");
});

test("classifyWriteError falls back to the safe UNKNOWN classification for unrelated errors", () => {
  const error = classifyWriteError(new Error("some internal RPC detail"));
  assert.equal(error.code, "UNKNOWN");
  assert.equal(error.message, "Something went wrong submitting the transaction. Please try again.");
});

test("classifyWriteError never exposes the raw underlying error message", () => {
  const raw = "simulation failed: host error at frame #3, contract abcd1234";
  const error = classifyWriteError(new Error(raw));
  assert.notEqual(error.message, raw);
  assert.ok(!error.message.includes("frame #3"));
});

test("classifyWriteError handles a non-Error thrown value safely", () => {
  const error = classifyWriteError("a raw string throw");
  assert.equal(error.code, "UNKNOWN");
});

// --- isContractWriteError ---------------------------------------------

test("isContractWriteError recognizes a well-formed ContractWriteError", () => {
  assert.equal(
    isContractWriteError({ code: "REJECTED", message: "The request was rejected in your wallet." }),
    true
  );
});

test("isContractWriteError recognizes INVALID_LOAN_ID (FCP-02 cancel validation)", () => {
  assert.equal(
    isContractWriteError({ code: "INVALID_LOAN_ID", message: "Enter a whole number loan ID (0 or greater)." }),
    true
  );
});

test("isContractWriteError rejects plain Errors, LoanRegistryError-shaped objects, and other values", () => {
  assert.equal(isContractWriteError(new Error("boom")), false);
  // LOAN_NOT_FOUND is a valid LoanRegistryError code, but not a valid
  // ContractWriteError code — these two error taxonomies must not be
  // confused with each other.
  assert.equal(isContractWriteError({ code: "LOAN_NOT_FOUND", message: "x" }), false);
  assert.equal(isContractWriteError(null), false);
  assert.equal(isContractWriteError(undefined), false);
});

test("isContractWriteError recognizes NOT_ELIGIBLE", () => {
  assert.equal(
    isContractWriteError({ code: "NOT_ELIGIBLE", message: NOT_ELIGIBLE_MESSAGE }),
    true
  );
});

// --- isEligibilityRejection ---------------------------------------------

test("isEligibilityRejection matches the real Soroban host-error format for contract error #9", () => {
  // Exact shape confirmed against this project's own L3-P14 live
  // Testnet verification (see docs/CURRENT_STATUS.md).
  assert.equal(
    isEligibilityRejection('Transaction simulation failed: "HostError: Error(Contract, #9)"'),
    true
  );
});

test("isEligibilityRejection tolerates minor formatting variance (spacing)", () => {
  assert.equal(isEligibilityRejection("Error(Contract,#9)"), true);
  assert.equal(isEligibilityRejection("Error( Contract , #9 )"), true);
});

test("isEligibilityRejection does NOT match a different contract error code", () => {
  // #8 is EligibilityContractNotConfigured — a real but distinct
  // failure (misconfiguration, not a rejected borrower) that must
  // get its own honest message, not this one.
  assert.equal(isEligibilityRejection("Error(Contract, #8)"), false);
  assert.equal(isEligibilityRejection("Error(Contract, #1)"), false);
});

test("isEligibilityRejection does NOT match unrelated failures, even ones mentioning eligibility in passing", () => {
  assert.equal(isEligibilityRejection("Transaction simulation failed: network timeout"), false);
  assert.equal(isEligibilityRejection("checking eligibility took too long"), false);
  assert.equal(isEligibilityRejection(""), false);
});

// --- canFundLoan (L3-P12) ---------------------------------------------

test("canFundLoan is true for an Open loan and a non-borrower wallet", () => {
  assert.equal(canFundLoan("Open", false), true);
});

test("canFundLoan is false for the loan's own borrower, even if Open", () => {
  assert.equal(canFundLoan("Open", true), false);
});

test("canFundLoan is false for a Cancelled loan, regardless of borrower status", () => {
  assert.equal(canFundLoan("Cancelled", false), false);
  assert.equal(canFundLoan("Cancelled", true), false);
});

test("canFundLoan is false for an already-Funded loan, regardless of borrower status", () => {
  assert.equal(canFundLoan("Funded", false), false);
  assert.equal(canFundLoan("Funded", true), false);
});

// --- fund_loan rejection detectors (L3-P12) ---------------------------------------------

test("isLenderIsBorrowerRejection matches contract error #12", () => {
  assert.equal(
    isLenderIsBorrowerRejection('Transaction simulation failed: "HostError: Error(Contract, #12)"'),
    true
  );
  assert.equal(isLenderIsBorrowerRejection("Error(Contract, #4)"), false);
  assert.equal(isLenderIsBorrowerRejection(""), false);
});

test("isLoanNotOpenForFundingRejection matches contract error #4", () => {
  assert.equal(
    isLoanNotOpenForFundingRejection('Transaction simulation failed: "HostError: Error(Contract, #4)"'),
    true
  );
  assert.equal(isLoanNotOpenForFundingRejection("Error(Contract, #12)"), false);
  assert.equal(isLoanNotOpenForFundingRejection(""), false);
});

test("isFundingAmountMismatchRejection matches contract error #13", () => {
  assert.equal(
    isFundingAmountMismatchRejection('Transaction simulation failed: "HostError: Error(Contract, #13)"'),
    true
  );
  assert.equal(isFundingAmountMismatchRejection("Error(Contract, #4)"), false);
  assert.equal(isFundingAmountMismatchRejection(""), false);
});

test("fund_loan rejection messages are real, non-empty, honest text", () => {
  for (const message of [
    LENDER_IS_BORROWER_MESSAGE,
    LOAN_NOT_OPEN_FOR_FUNDING_MESSAGE,
    FUNDING_AMOUNT_MISMATCH_MESSAGE,
  ]) {
    assert.ok(message.length > 0);
  }
});

test("isContractWriteError recognizes all three new fund_loan error codes", () => {
  assert.equal(
    isContractWriteError({ code: "LENDER_IS_BORROWER", message: LENDER_IS_BORROWER_MESSAGE }),
    true
  );
  assert.equal(
    isContractWriteError({
      code: "LOAN_NOT_OPEN_FOR_FUNDING",
      message: LOAN_NOT_OPEN_FOR_FUNDING_MESSAGE,
    }),
    true
  );
  assert.equal(
    isContractWriteError({
      code: "FUNDING_AMOUNT_MISMATCH",
      message: FUNDING_AMOUNT_MISMATCH_MESSAGE,
    }),
    true
  );
});

// --- resolveConfirmedTxHash ---------------------------------------------

test("resolveConfirmedTxHash returns the hash when submission returned one and status is confirmed", () => {
  const hash = resolveConfirmedTxHash({ hash: "abcd1234", confirmed: true });
  assert.equal(hash, "abcd1234");
});

test("resolveConfirmedTxHash throws SUBMISSION_FAILED when no hash was returned at all", () => {
  assert.throws(
    () => resolveConfirmedTxHash({ hash: undefined, confirmed: false }),
    (error: unknown) => {
      assert.ok(isContractWriteError(error));
      assert.equal((error as { code: string }).code, "SUBMISSION_FAILED");
      return true;
    }
  );
});

test("resolveConfirmedTxHash throws TRANSACTION_FAILED when a hash exists but the final status was not SUCCESS", () => {
  // This is the case that distinguishes "submitted" from "actually
  // succeeded" (L2-P06 §8): the network accepted the submission and
  // returned a hash, but polling the final result found it did not
  // confirm as SUCCESS.
  assert.throws(
    () => resolveConfirmedTxHash({ hash: "abcd1234", confirmed: false }),
    (error: unknown) => {
      assert.ok(isContractWriteError(error));
      assert.equal((error as { code: string }).code, "TRANSACTION_FAILED");
      return true;
    }
  );
});

test("resolveConfirmedTxHash never exposes a hash when the transaction did not confirm", () => {
  try {
    resolveConfirmedTxHash({ hash: "abcd1234", confirmed: false });
    assert.fail("expected resolveConfirmedTxHash to throw");
  } catch (error) {
    // The thrown error must not carry the hash back out to callers
    // who don't check confirmation status first.
    assert.ok(!JSON.stringify(error).includes("abcd1234"));
  }
});

// --- resolveOkResult ---------------------------------------------

test("resolveOkResult returns the unwrapped value for an Ok result", () => {
  const okResult = { isErr: () => false, unwrap: () => 42 };
  assert.equal(resolveOkResult(okResult, "should not be used"), 42);
});

test("resolveOkResult throws TRANSACTION_FAILED with the given message for an Err result, without calling unwrap", () => {
  let unwrapCalled = false;
  const errResult = {
    isErr: () => true,
    unwrap: () => {
      unwrapCalled = true;
      throw new Error("unwrap should not be called on an Err result");
    },
  };
  assert.throws(
    () => resolveOkResult(errResult, "Enter an amount greater than zero."),
    (error: unknown) => {
      assert.ok(isContractWriteError(error));
      assert.equal((error as { code: string }).code, "TRANSACTION_FAILED");
      assert.equal((error as { message: string }).message, "Enter an amount greater than zero.");
      return true;
    }
  );
  assert.equal(unwrapCalled, false);
});
