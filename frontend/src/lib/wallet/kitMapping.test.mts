/**
 * Focused tests for the StellarWalletsKit adapter's pure mapping
 * logic (L2-P01). Uses Node's built-in test runner, consistent with
 * every prior task's test files — no new test framework/dependency.
 *
 * Deliberately does not test lib/wallet/kit.ts's live calls, since
 * those depend on the real kit talking to browser extensions — see
 * the "Limitations" note in the final report for what still needs
 * manual/live verification.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyKitError,
  toWalletOption,
  toWalletOptions,
} from "./kitMapping.ts";

// --- toWalletOption / toWalletOptions -------------------------------

test("toWalletOption maps the kit's supported-wallet shape to the local WalletOption shape", () => {
  const option = toWalletOption({
    id: "freighter",
    name: "Freighter",
    icon: "data:image/svg+xml;base64,xyz",
    isAvailable: true,
  });
  assert.deepEqual(option, {
    id: "freighter",
    name: "Freighter",
    icon: "data:image/svg+xml;base64,xyz",
    isAvailable: true,
  });
});

test("toWalletOptions maps a list, preserving order and each wallet's availability", () => {
  const options = toWalletOptions([
    { id: "freighter", name: "Freighter", icon: "a", isAvailable: true },
    { id: "albedo", name: "Albedo", icon: "b", isAvailable: true },
    { id: "xbull", name: "xBull", icon: "c", isAvailable: false },
  ]);
  assert.equal(options.length, 3);
  assert.equal(options[0].id, "freighter");
  assert.equal(options[1].id, "albedo");
  assert.equal(options[2].id, "xbull");
  assert.equal(options[2].isAvailable, false);
});

test("toWalletOptions returns an empty array for an empty input", () => {
  assert.deepEqual(toWalletOptions([]), []);
});

// --- classifyKitError: not-installed --------------------------------

test("classifyKitError maps an unavailable wallet to NOT_INSTALLED with a wallet-name-accurate message", () => {
  const error = classifyKitError(new Error("anything"), false, "Albedo");
  assert.equal(error.code, "NOT_INSTALLED");
  assert.equal(
    error.message,
    "Albedo wallet was not found. Install Albedo and try again."
  );
});

test("classifyKitError's not-installed message is accurate for a different wallet name", () => {
  const error = classifyKitError(undefined, false, "xBull");
  assert.equal(error.code, "NOT_INSTALLED");
  assert.equal(
    error.message,
    "xBull wallet was not found. Install xBull and try again."
  );
  // Must not say the wrong wallet's name.
  assert.ok(!error.message.includes("Freighter"));
});

// --- classifyKitError: rejection -------------------------------------

test("classifyKitError maps a rejection to REJECTED with a wallet-name-accurate message", () => {
  const error = classifyKitError(
    new Error("User declined access"),
    true,
    "Freighter"
  );
  assert.equal(error.code, "REJECTED");
  assert.equal(error.message, "The request was rejected in Freighter.");
});

test("classifyKitError's rejected message names the actual connected wallet, not a hardcoded one", () => {
  const error = classifyKitError(
    new Error("Request rejected by user"),
    true,
    "Albedo"
  );
  assert.equal(error.code, "REJECTED");
  assert.equal(error.message, "The request was rejected in Albedo.");
  assert.ok(!error.message.includes("Freighter"));
});

// --- classifyKitError: unknown fallback -------------------------------

test("classifyKitError falls back to UNKNOWN for a non-rejection error, never exposing the raw message", () => {
  const error = classifyKitError(
    new Error("Some internal wallet extension failure detail"),
    true,
    "xBull"
  );
  assert.equal(error.code, "UNKNOWN");
  assert.equal(error.message, "Something went wrong. Please try again.");
  assert.ok(
    !error.message.includes("Some internal wallet extension failure detail")
  );
});

test("classifyKitError handles a non-Error thrown value safely", () => {
  const error = classifyKitError("a raw string throw", true, "Freighter");
  assert.equal(error.code, "UNKNOWN");
  assert.equal(error.message, "Something went wrong. Please try again.");
});

test("classifyKitError handles an undefined error safely", () => {
  const error = classifyKitError(undefined, true, "Freighter");
  assert.equal(error.code, "UNKNOWN");
  assert.equal(error.message, "Something went wrong. Please try again.");
});
