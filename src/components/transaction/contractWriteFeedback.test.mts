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

test("contractWriteStatusToFeedbackStatus maps failure to failed", () => {
  assert.equal(contractWriteStatusToFeedbackStatus("failure"), "failed");
});
