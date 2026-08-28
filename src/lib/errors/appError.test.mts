/**
 * Focused tests for the centralized L1-P06 error mapper.
 *
 * Uses Node's built-in test runner, consistent with L1-P05's
 * feedbackContent.test.mts — no new test framework/dependency.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { TransactionFailedError } from "@stellar/stellar-sdk";
import {
  SAFE_MESSAGES,
  classifyTransactionFailure,
  createAppError,
  isHorizonNotFoundError,
  isRejectionMessage,
  mapWalletApiError,
  mapUnknownError,
} from "./appError.ts";
import type { AppErrorCode } from "./appError.ts";

// --- 1. wallet-not-found mapping ---------------------------------

test("wallet-not-found maps to the required safe message", () => {
  const appError = createAppError("WALLET_NOT_FOUND");
  assert.equal(appError.code, "WALLET_NOT_FOUND");
  assert.equal(
    appError.message,
    "Freighter wallet was not found. Install Freighter and try again."
  );
});

// --- 2. connection rejection mapping ------------------------------

test("wallet connection rejection maps to REJECTED with the safe message", () => {
  const appError = mapWalletApiError({
    message: "User declined access to their public key.",
  });
  assert.equal(appError.code, "REJECTED");
  assert.equal(appError.message, "The request was rejected in Freighter.");
});

// --- 3. transaction-signing rejection mapping ---------------------

test("transaction signing rejection maps to REJECTED with the safe message", () => {
  // Connection rejection and signing rejection are reported the same
  // way (a message string on the error object) by every wallet
  // module — mapWalletApiError is reused for both, per the module's
  // design.
  const appError = mapWalletApiError({
    message: "Transaction rejected by user in Freighter.",
  });
  assert.equal(appError.code, "REJECTED");
  assert.equal(appError.message, "The request was rejected in Freighter.");
});

test("non-rejection wallet API errors map to UNKNOWN_ERROR, never the raw message", () => {
  const appError = mapWalletApiError({
    message: "Some internal wallet extension failure detail",
  });
  assert.equal(appError.code, "UNKNOWN_ERROR");
  assert.equal(appError.message, "Something went wrong. Please try again.");
  assert.notEqual(appError.message, "Some internal wallet extension failure detail");
});

// --- 4. insufficient-balance mapping ------------------------------

test("op_underfunded transaction failure maps to INSUFFICIENT_BALANCE", () => {
  const err = new TransactionFailedError("tx failed", {
    data: {
      extras: {
        result_codes: { transaction: "tx_failed", operations: ["op_underfunded"] },
      },
    },
  });
  const appError = classifyTransactionFailure(err);
  assert.equal(appError.code, "INSUFFICIENT_BALANCE");
  assert.equal(appError.message, "Insufficient XLM balance for this transaction.");
});

// --- 5. network/Horizon failure mapping ---------------------------

test("Horizon 404 (axios-style) error shape is detected", () => {
  const axiosLike404 = { response: { status: 404 } };
  assert.equal(isHorizonNotFoundError(axiosLike404), true);
});

test("non-404 or malformed errors are not detected as Horizon not-found", () => {
  assert.equal(isHorizonNotFoundError({ response: { status: 500 } }), false);
  assert.equal(isHorizonNotFoundError(new Error("network down")), false);
  assert.equal(isHorizonNotFoundError(null), false);
  assert.equal(isHorizonNotFoundError(undefined), false);
});

test("generic network failure maps to NETWORK_ERROR via the fallback classifier", () => {
  const appError = mapUnknownError(new TypeError("fetch failed"), "NETWORK_ERROR");
  assert.equal(appError.code, "NETWORK_ERROR");
  assert.equal(
    appError.message,
    "Unable to communicate with the Stellar network. Please try again."
  );
});

// --- 6. transaction failure mapping -------------------------------

test("a transaction failure with an unrelated result code maps to TRANSACTION_FAILED", () => {
  const err = new TransactionFailedError("tx failed", {
    data: {
      extras: {
        result_codes: { transaction: "tx_failed", operations: ["op_no_destination"] },
      },
    },
  });
  const appError = classifyTransactionFailure(err);
  assert.equal(appError.code, "TRANSACTION_FAILED");
  assert.equal(appError.message, "Transaction failed. Please try again.");
});

test("a transaction failure with no operation codes still maps safely to TRANSACTION_FAILED", () => {
  const err = new TransactionFailedError("tx failed", {
    data: {
      extras: { result_codes: { transaction: "tx_bad_seq", operations: [] } },
    },
  });
  const appError = classifyTransactionFailure(err);
  assert.equal(appError.code, "TRANSACTION_FAILED");
  assert.equal(appError.message, "Transaction failed. Please try again.");
});

// --- 7. unknown-error fallback -------------------------------------

test("an arbitrary unexpected error falls back to UNKNOWN_ERROR with the safe message", () => {
  const appError = mapUnknownError(new Error("some odd internal thing broke"));
  assert.equal(appError.code, "UNKNOWN_ERROR");
  assert.equal(appError.message, "Something went wrong. Please try again.");
});

// --- 8. safe user-facing messages -----------------------------------

test("every AppErrorCode has the exact required safe message", () => {
  const expected: Record<AppErrorCode, string> = {
    WALLET_NOT_FOUND:
      "Freighter wallet was not found. Install Freighter and try again.",
    REJECTED: "The request was rejected in Freighter.",
    INSUFFICIENT_BALANCE: "Insufficient XLM balance for this transaction.",
    NETWORK_ERROR:
      "Unable to communicate with the Stellar network. Please try again.",
    TRANSACTION_FAILED: "Transaction failed. Please try again.",
    UNKNOWN_ERROR: "Something went wrong. Please try again.",
  };
  for (const code of Object.keys(expected) as AppErrorCode[]) {
    assert.equal(SAFE_MESSAGES[code], expected[code]);
    assert.equal(createAppError(code).message, expected[code]);
  }
});

// --- 9. raw technical error details are not exposed -----------------

test("rejection detection is case-insensitive and phrasing-tolerant", () => {
  assert.equal(isRejectionMessage("User Declined the request"), true);
  assert.equal(isRejectionMessage("Request was REJECTED"), true);
  assert.equal(isRejectionMessage("Access denied by user"), true);
  assert.equal(isRejectionMessage("User cancelled"), true);
  assert.equal(isRejectionMessage("Something unrelated happened"), false);
  assert.equal(isRejectionMessage(undefined), false);
});

test("a raw error containing a sensitive-looking URL/detail never reaches the safe message", () => {
  const sensitive = "Failed at https://internal.example.com/api?key=SECRET123 (stack: at foo.js:42)";
  const appError = mapUnknownError(new Error(sensitive));
  assert.equal(appError.code, "UNKNOWN_ERROR");
  assert.equal(appError.message, "Something went wrong. Please try again.");
  assert.ok(!appError.message.includes("SECRET123"));
  assert.ok(!appError.message.includes("internal.example.com"));
  // The raw detail may still be retained internally for future
  // logging, but callers (all current UI components) only ever
  // render `.message`, never `.internal`.
  assert.equal(appError.internal, sensitive);
});

test("a rejected wallet API error's raw message is preserved only in .internal, never in .message", () => {
  const raw = "User rejected the request in the Freighter popup (session abc123)";
  const appError = mapWalletApiError({ message: raw });
  assert.equal(appError.code, "REJECTED");
  assert.notEqual(appError.message, raw);
  assert.equal(appError.internal, raw);
});
