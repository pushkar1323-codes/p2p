import { test } from "node:test";
import assert from "node:assert/strict";
import { requireEnv } from "./requireEnv.ts";

test("requireEnv: returns the value when it is set, ignoring any fallback", () => {
  assert.equal(requireEnv("X", "real-value", "fallback-value"), "real-value");
});

test("requireEnv: returns the value when set and no fallback was given", () => {
  assert.equal(requireEnv("X", "real-value"), "real-value");
});

test("requireEnv: falls back when the value is undefined", () => {
  assert.equal(requireEnv("X", undefined, "fallback-value"), "fallback-value");
});

test("requireEnv: throws a clear, name-specific error when undefined and no fallback was given", () => {
  assert.throws(() => requireEnv("NEXT_PUBLIC_SOMETHING", undefined), {
    message: "Missing required environment variable: NEXT_PUBLIC_SOMETHING. Check your .env file against .env.example.",
  });
});

test("requireEnv: an empty-string value is treated as missing and does NOT fall back (existing, preserved behavior)", () => {
  // This is a pre-existing quirk of the original implementation
  // (`value ?? fallback` only catches null/undefined, then a
  // separate falsy check rejects ""), preserved exactly by this
  // refactor rather than "fixed" as a drive-by change.
  assert.throws(() => requireEnv("X", "", "fallback-value"), {
    message: "Missing required environment variable: X. Check your .env file against .env.example.",
  });
});

test("requireEnv: throws when both the value and the fallback are missing", () => {
  assert.throws(() => requireEnv("X", undefined, undefined));
});
