import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyReadError,
  isLoanRegistryError,
  parseLoanStatus,
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
