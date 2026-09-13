import { test } from "node:test";
import assert from "node:assert/strict";
import { contractWriteStatusToFeedbackStatus } from "./contractWriteFeedback.ts";

test("contractWriteStatusToFeedbackStatus maps idle to idle", () => {
  assert.equal(contractWriteStatusToFeedbackStatus("idle"), "idle");
});

test("contractWriteStatusToFeedbackStatus maps pending to submitted", () => {
  assert.equal(contractWriteStatusToFeedbackStatus("pending"), "submitted");
});

test("contractWriteStatusToFeedbackStatus maps success to confirmed", () => {
  assert.equal(contractWriteStatusToFeedbackStatus("success"), "confirmed");
});

test("contractWriteStatusToFeedbackStatus maps a non-rejection failure to failed", () => {
  assert.equal(contractWriteStatusToFeedbackStatus("failure"), "failed");
  assert.equal(
    contractWriteStatusToFeedbackStatus("failure", { code: "NETWORK_ERROR" }),
    "failed"
  );
  assert.equal(
    contractWriteStatusToFeedbackStatus("failure", { code: "UNKNOWN" }),
    "failed"
  );
});

test("contractWriteStatusToFeedbackStatus maps a wallet-rejection failure to rejected", () => {
  // L3-P17 audit finding #1: a contract-write wallet rejection must
  // show the same clean "Transaction rejected…" message the XLM
  // transfer flow already shows for the identical user action,
  // instead of the generic "The transaction could not be completed."
  assert.equal(
    contractWriteStatusToFeedbackStatus("failure", { code: "REJECTED" }),
    "rejected"
  );
});
