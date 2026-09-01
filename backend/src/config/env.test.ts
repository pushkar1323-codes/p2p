import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnv, parseDbEnv } from "./env.ts";

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

test("parseDbEnv accepts a valid postgres:// connection string and applies defaults", () => {
  const config = parseDbEnv({
    DATABASE_URL: "postgres://user:pass@localhost:5432/p2p",
  });
  assert.equal(config.DATABASE_URL, "postgres://user:pass@localhost:5432/p2p");
  assert.equal(config.DB_POOL_MAX, 10);
  assert.equal(config.DB_SSL, false);
});

test("parseDbEnv accepts a valid postgresql:// connection string", () => {
  const config = parseDbEnv({
    DATABASE_URL: "postgresql://user:pass@localhost:5432/p2p",
  });
  assert.equal(config.DATABASE_URL, "postgresql://user:pass@localhost:5432/p2p");
});

test("parseDbEnv coerces DB_POOL_MAX and parses DB_SSL as a boolean", () => {
  const config = parseDbEnv({
    DATABASE_URL: "postgres://user:pass@localhost:5432/p2p",
    DB_POOL_MAX: "25",
    DB_SSL: "true",
  });
  assert.equal(config.DB_POOL_MAX, 25);
  assert.equal(config.DB_SSL, true);
});

test("parseDbEnv rejects a missing DATABASE_URL", () => {
  assert.throws(
    () => parseDbEnv({}),
    /Invalid database configuration/,
  );
});

test("parseDbEnv rejects a connection string that isn't a postgres:// URL", () => {
  assert.throws(
    () => parseDbEnv({ DATABASE_URL: "mysql://user:pass@localhost/p2p" }),
    /postgres/,
  );
});

test("parseDbEnv error message never leaks the invalid DATABASE_URL's own contents (e.g. an embedded password)", () => {
  try {
    parseDbEnv({ DATABASE_URL: "mysql://user:super-secret-pw@localhost/p2p" });
    assert.fail("expected parseDbEnv to throw");
  } catch (err) {
    assert.ok(err instanceof Error);
    assert.doesNotMatch(err.message, /super-secret-pw/);
  }
});
