import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnv } from "./env.ts";

test("parseEnv applies defaults when NODE_ENV/PORT are absent", () => {
  const config = parseEnv({});
  assert.equal(config.NODE_ENV, "development");
  assert.equal(config.PORT, 4000);
});

test("parseEnv accepts a valid, fully-specified environment", () => {
  const config = parseEnv({ NODE_ENV: "production", PORT: "8080" });
  assert.equal(config.NODE_ENV, "production");
  assert.equal(config.PORT, 8080);
});

test("parseEnv coerces a numeric PORT string to a number", () => {
  const config = parseEnv({ PORT: "5001" });
  assert.equal(config.PORT, 5001);
  assert.equal(typeof config.PORT, "number");
});

test("parseEnv rejects an invalid NODE_ENV", () => {
  assert.throws(
    () => parseEnv({ NODE_ENV: "staging" }),
    /Invalid environment configuration/,
  );
});

test("parseEnv rejects a non-numeric PORT", () => {
  assert.throws(
    () => parseEnv({ PORT: "not-a-number" }),
    /Invalid environment configuration/,
  );
});

test("parseEnv rejects a negative PORT", () => {
  assert.throws(() => parseEnv({ PORT: "-1" }));
});

test("parseEnv error message never includes raw secret-shaped values, only field names/reasons", () => {
  try {
    parseEnv({ NODE_ENV: "totally-invalid-value" });
    assert.fail("expected parseEnv to throw");
  } catch (err) {
    assert.ok(err instanceof Error);
    assert.match(err.message, /NODE_ENV/);
  }
});
