import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyReadError,
  classifyWriteError,
  isContractWriteError,
  isLoanRegistryError,
  parseLoanStatus,
  resolveConfirmedTxHash,
  resolveOkResult,
} from "./loanRegistryErrors.ts";

// --- parseLoanStatus ---------------------------------------------

test("parseLoanStatus accepts a plain string shape", () => {
  assert.equal(parseLoanStatus("Open"), "Open");
  assert.equal(parseLoanStatus("Cancelled"), "Cancelled");
});

test("parseLoanStatus accepts a {tag} object shape (generated TS bindings convention)", () => {
  assert.equal(parseLoanStatus({ tag: "Open", values: undefined }), "Open");
  assert.equal(parseLoanStatus({ tag: "Cancelled" }), "Cancelled");
});

test("parseLoanStatus accepts a [tag] array shape", () => {
  assert.equal(parseLoanStatus(["Open"]), "Open");
  assert.equal(parseLoanStatus(["Cancelled"]), "Cancelled");
});

test("parseLoanStatus throws on an unrecognized value rather than silently guessing", () => {
  assert.throws(() => parseLoanStatus("Funded"));
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

// --- isLoanRegistryError ---------------------------------------------

test("isLoanRegistryError recognizes a well-formed LoanRegistryError", () => {
  assert.equal(
    isLoanRegistryError({ code: "LOAN_NOT_FOUND", message: "No loan request found with id 5." }),
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

test("isContractWriteError rejects plain Errors, LoanRegistryError-shaped objects, and other values", () => {
  assert.equal(isContractWriteError(new Error("boom")), false);
  // LOAN_NOT_FOUND is a valid LoanRegistryError code, but not a valid
  // ContractWriteError code — these two error taxonomies must not be
  // confused with each other.
  assert.equal(isContractWriteError({ code: "LOAN_NOT_FOUND", message: "x" }), false);
  assert.equal(isContractWriteError(null), false);
  assert.equal(isContractWriteError(undefined), false);
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
