/**
 * Focused tests for signError.ts's pure sign-error classification
 * logic (L2-P02).
 *
 * `sendXlm` itself is not unit tested here — it performs real I/O
 * (Horizon `loadAccount`/`submitTransaction`, the live
 * StellarWalletsKit signing call) and this project's established
 * pattern (see appError.ts, kitMapping.ts, feedbackContent.ts) is to
 * pull the pure decision logic out into its own small, directly
 * testable module rather than introduce a mocking framework. See the
 * "remaining limitations" note in the L2-P02 final report for what
 * still needs manual/live verification of the full sendXlm flow.
 *
 * `classifySignError` is exactly what `transaction.ts`'s `sendXlm`
 * calls when `signWithSelectedWallet` throws, so these tests cover
 * the "signature rejection -> REJECTED" requirement without needing
 * to exercise the whole transaction pipeline or load the live wallet
 * kit.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySignError } from "./signError.ts";

test("a rejected signature request maps to REJECTED with a wallet-agnostic safe message", () => {
  const error = classifySignError(
    new Error("User declined access to their public key.")
  );
  assert.equal(error.code, "REJECTED");
  assert.equal(error.message, "The request was rejected in your wallet.");
});

test("classifySignError's REJECTED message is wallet-agnostic regardless of which wallet reported it", () => {
  // Freighter, Albedo, and xBull all report a rejection the same
  // shape (`{ message: string }`), and this app can't know in
  // advance which one was used to sign, so the message must not name
  // any specific wallet.
  const fromAlbedo = classifySignError(
    new Error("Request rejected by user in Albedo")
  );
  const fromXbull = classifySignError(new Error("user cancelled"));
  assert.equal(fromAlbedo.code, "REJECTED");
  assert.equal(fromXbull.code, "REJECTED");
  assert.equal(fromAlbedo.message, "The request was rejected in your wallet.");
  assert.equal(fromXbull.message, "The request was rejected in your wallet.");
  assert.ok(!/freighter|albedo|xbull/i.test(fromAlbedo.message));
});

test("a non-rejection signing failure falls back to the safe UNKNOWN classification", () => {
  const error = classifySignError(
    new Error("Some internal wallet extension failure detail")
  );
  assert.equal(error.code, "UNKNOWN");
  assert.equal(error.message, "Something went wrong. Please try again.");
});

test("classifySignError never exposes the raw underlying error message", () => {
  const raw = "Failed at https://internal.example.com/api?key=SECRET123";
  const error = classifySignError(new Error(raw));
  assert.notEqual(error.message, raw);
  assert.ok(!error.message.includes("SECRET123"));
});

test("classifySignError handles a non-Error thrown value safely", () => {
  const error = classifySignError("a raw string throw");
  assert.equal(error.code, "UNKNOWN");
  assert.equal(error.message, "Something went wrong. Please try again.");
});

test("classifySignError handles an undefined error safely", () => {
  const error = classifySignError(undefined);
  assert.equal(error.code, "UNKNOWN");
  assert.equal(error.message, "Something went wrong. Please try again.");
});
