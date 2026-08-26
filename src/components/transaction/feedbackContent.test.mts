/**
 * Focused tests for the TransactionFeedback state-mapping logic.
 *
 * Uses Node's built-in test runner (`node --test`, Node 22+ natively
 * executes .ts/.mts via type stripping) rather than introducing a new
 * test framework/dependency, per L1-P05's "smallest reasonable
 * approach" instruction.
 *
 * Scope/limitation: these tests cover the pure status -> content
 * mapping (getFeedbackContent), which is what determines every
 * user-visible message, tone, and which sections (hash/detail)
 * render. They do NOT render actual JSX/DOM, since that would require
 * adding React Testing Library + a DOM environment (jsdom) — a larger
 * testing stack this task explicitly says to avoid unless absolutely
 * necessary. "Mobile-safe rendering" is verified structurally instead
 * (CSS uses relative units, `word-break`/`overflow-wrap` on the hash,
 * `box-sizing: border-box` and `max-width: 100%` on the container —
 * see TransactionFeedback.module.css) and should be confirmed
 * visually by the user on a real small-viewport device/browser.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { getFeedbackContent } from "./feedbackContent.ts";
import type { TransferStatus } from "../../lib/stellar/types.ts";

test("idle renders nothing", () => {
  const content = getFeedbackContent("idle");
  assert.equal(content.visible, false);
  assert.equal(content.showHash, false);
  assert.equal(content.showDetail, false);
});

test("preparing shows a pending message and no hash/detail", () => {
  const content = getFeedbackContent("preparing");
  assert.equal(content.visible, true);
  assert.equal(content.tone, "pending");
  assert.match(content.message, /preparing/i);
  assert.equal(content.showHash, false);
  assert.equal(content.showDetail, false);
});

test("awaiting_signature explicitly tells the user to approve/reject in Freighter", () => {
  const content = getFeedbackContent("awaiting_signature");
  assert.equal(content.visible, true);
  assert.equal(content.tone, "pending");
  assert.match(content.message, /freighter/i);
  assert.match(content.message, /approve|reject/i);
});

test("submitted indicates the transaction is pending confirmation", () => {
  const content = getFeedbackContent("submitted");
  assert.equal(content.visible, true);
  assert.equal(content.tone, "pending");
  assert.match(content.message, /submitted|confirmation/i);
  assert.equal(content.showHash, false);
});

test("confirmed shows success tone and enables the hash section", () => {
  const content = getFeedbackContent("confirmed");
  assert.equal(content.visible, true);
  assert.equal(content.tone, "success");
  assert.equal(content.showHash, true);
  assert.equal(content.showDetail, false);
});

test("failed shows error tone and enables the detail section", () => {
  const content = getFeedbackContent("failed");
  assert.equal(content.visible, true);
  assert.equal(content.tone, "error");
  assert.equal(content.showHash, false);
  assert.equal(content.showDetail, true);
});

test("rejected is distinguished from failed with its own message", () => {
  const rejected = getFeedbackContent("rejected");
  const failed = getFeedbackContent("failed");
  assert.equal(rejected.tone, "error");
  assert.equal(rejected.showDetail, true);
  assert.notEqual(rejected.message, failed.message);
  assert.match(rejected.message, /rejected/i);
});

test("every non-idle TransferStatus produces a visible, non-empty message", () => {
  const statuses: TransferStatus[] = [
    "preparing",
    "awaiting_signature",
    "submitted",
    "confirmed",
    "failed",
    "rejected",
  ];
  for (const status of statuses) {
    const content = getFeedbackContent(status);
    assert.equal(content.visible, true, `${status} should be visible`);
    assert.ok(content.message.length > 0, `${status} should have a message`);
  }
});

test("message override replaces the default copy for a given status", () => {
  const content = getFeedbackContent("preparing", {
    preparing: "Custom preparing message",
  });
  assert.equal(content.message, "Custom preparing message");
});

test("only confirmed enables showHash", () => {
  const statuses: TransferStatus[] = [
    "idle",
    "preparing",
    "awaiting_signature",
    "submitted",
    "failed",
    "rejected",
  ];
  for (const status of statuses) {
    assert.equal(
      getFeedbackContent(status).showHash,
      false,
      `${status} should not show hash`
    );
  }
  assert.equal(getFeedbackContent("confirmed").showHash, true);
});

test("only failed/rejected enable showDetail", () => {
  const statuses: TransferStatus[] = [
    "idle",
    "preparing",
    "awaiting_signature",
    "submitted",
    "confirmed",
  ];
  for (const status of statuses) {
    assert.equal(
      getFeedbackContent(status).showDetail,
      false,
      `${status} should not show detail`
    );
  }
  assert.equal(getFeedbackContent("failed").showDetail, true);
  assert.equal(getFeedbackContent("rejected").showDetail, true);
});
