import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  recordBlockchainTransaction,
  validateAndNormalizeTransaction,
  type RawBlockchainTransactionInput,
} from "./transactionRecording.ts";
import { AppError } from "../errors/AppError.ts";
import { createDbClient, type Database, type DbClient } from "../db/client.ts";
import { blockchainTransactions } from "../db/schema.ts";

// ---------------------------------------------------------------------
// Pure validation tests — no database involved at all.
// ---------------------------------------------------------------------

function validInput(overrides: Partial<RawBlockchainTransactionInput> = {}): RawBlockchainTransactionInput {
  return {
    transactionHash: `test_${randomUUID()}`,
    network: "testnet",
    status: "confirmed",
    actionType: "contract_invocation",
    contractId: "CTESTCONTRACTID",
    confirmedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("validateAndNormalizeTransaction accepts a fully-specified valid input", () => {
  const input = validInput();
  const normalized = validateAndNormalizeTransaction(input);
  assert.equal(normalized.transactionHash, input.transactionHash);
  assert.equal(normalized.network, "testnet");
  assert.equal(normalized.status, "confirmed");
  assert.equal(normalized.actionType, "contract_invocation");
  assert.equal(normalized.contractId, "CTESTCONTRACTID");
  assert.equal(normalized.confirmedAt?.toISOString(), "2026-01-01T00:00:00.000Z");
});

test("validateAndNormalizeTransaction trims whitespace on string fields", () => {
  const normalized = validateAndNormalizeTransaction(
    validInput({ transactionHash: "  abc  ", network: " testnet ", contractId: " C1 " }),
  );
  assert.equal(normalized.transactionHash, "abc");
  assert.equal(normalized.network, "testnet");
  assert.equal(normalized.contractId, "C1");
});

test("validateAndNormalizeTransaction defaults optional fields to null when omitted", () => {
  const normalized = validateAndNormalizeTransaction({
    transactionHash: "abc",
    network: "testnet",
    status: "pending",
  });
  assert.equal(normalized.actionType, null);
  assert.equal(normalized.contractId, null);
  assert.equal(normalized.confirmedAt, null);
  assert.equal(normalized.errorCode, null);
  assert.equal(normalized.errorMessage, null);
});

for (const field of ["transactionHash", "network"] as const) {
  test(`rejects a missing required field: ${field}`, () => {
    assert.throws(
      () => validateAndNormalizeTransaction(validInput({ [field]: undefined })),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 422);
        assert.ok((err.details as { field: string }[]).some((d) => d.field === field));
        return true;
      },
    );
  });
}

test("rejects a missing status", () => {
  assert.throws(() => validateAndNormalizeTransaction(validInput({ status: undefined })), AppError);
});

test("rejects a status outside the known enum", () => {
  assert.throws(
    () => validateAndNormalizeTransaction(validInput({ status: "processing" })),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.ok((err.details as { field: string }[]).some((d) => d.field === "status"));
      return true;
    },
  );
});

for (const status of ["pending", "submitted", "confirmed", "failed", "rejected"] as const) {
  test(`accepts the valid status: ${status}`, () => {
    const normalized = validateAndNormalizeTransaction(validInput({ status }));
    assert.equal(normalized.status, status);
  });
}

test("rejects an invalid confirmedAt string", () => {
  assert.throws(
    () => validateAndNormalizeTransaction(validInput({ confirmedAt: "not-a-date" })),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.ok((err.details as { field: string }[]).some((d) => d.field === "confirmedAt"));
      return true;
    },
  );
});

test("rejects a non-string optional field when provided", () => {
  assert.throws(
    () => validateAndNormalizeTransaction(validInput({ actionType: 12345 })),
    AppError,
  );
});

test("collects multiple field issues in a single error", () => {
  try {
    validateAndNormalizeTransaction({});
    assert.fail("expected validateAndNormalizeTransaction to throw");
  } catch (err) {
    assert.ok(err instanceof AppError);
    const fields = (err.details as { field: string }[]).map((d) => d.field);
    assert.deepEqual(fields.sort(), ["network", "status", "transactionHash"].sort());
  }
});

// ---------------------------------------------------------------------
// Fake-database tests — no live Postgres required. Same fake-chain
// convention as eventProcessing.test.ts.
// ---------------------------------------------------------------------

function makeFailingDb(failure: Error): Database {
  const chain = {
    insert: () => chain,
    values: () => chain,
    onConflictDoNothing: () => chain,
    returning: () => Promise.reject(failure),
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: () => Promise.reject(failure),
  };
  return chain as unknown as Database;
}

function makeSucceedingDb(): Database {
  let lastValues: Record<string, unknown> = {};
  const chain = {
    insert: () => chain,
    values: (v: Record<string, unknown>) => {
      lastValues = v;
      return chain;
    },
    onConflictDoNothing: () => chain,
    returning: () => Promise.resolve([{ id: 1, createdAt: new Date(), ...lastValues }]),
  };
  return chain as unknown as Database;
}

test("recordBlockchainTransaction rejects invalid input before touching the database", async () => {
  await assert.rejects(
    () => recordBlockchainTransaction({ transactionHash: "only-one-field" }),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.code, "VALIDATION_ERROR");
      return true;
    },
  );
});

test("recordBlockchainTransaction surfaces an unexpected persistence failure, not success", async () => {
  const underlying = new Error("simulated connection failure");
  await assert.rejects(
    () => recordBlockchainTransaction(validInput(), makeFailingDb(underlying)),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 503);
      assert.equal(err.code, "PERSISTENCE_FAILED");
      assert.equal(err.cause, underlying);
      return true;
    },
  );
});

test("recordBlockchainTransaction reports a fresh insert", async () => {
  const result = await recordBlockchainTransaction(validInput({ transactionHash: "tx-fresh" }), makeSucceedingDb());
  assert.equal(result.outcome, "inserted");
  assert.equal(result.transaction.transactionHash, "tx-fresh");
});

// ---------------------------------------------------------------------
// Live PostgreSQL integration tests — skipped automatically (not
// failed) when DATABASE_URL isn't set. Rolled back, same as
// eventProcessing.test.ts.
// ---------------------------------------------------------------------

const hasDb = Boolean(process.env.DATABASE_URL);

class RollbackForTestCleanup extends Error {}

async function inRolledBackTransaction(
  client: DbClient,
  fn: (tx: Database) => Promise<void>,
): Promise<void> {
  try {
    await client.db.transaction(async (tx) => {
      await fn(tx as unknown as Database);
      throw new RollbackForTestCleanup();
    });
  } catch (err) {
    if (!(err instanceof RollbackForTestCleanup)) {
      throw err;
    }
  }
}

test(
  "recordBlockchainTransaction persists a valid transaction and reports it as inserted",
  { skip: !hasDb && "DATABASE_URL not set — skipping live database tests" },
  async () => {
    const client = createDbClient(process.env.DATABASE_URL);
    try {
      await inRolledBackTransaction(client, async (tx) => {
        const input = validInput();
        const result = await recordBlockchainTransaction(input, tx);
        assert.equal(result.outcome, "inserted");

        const rows = await tx
          .select()
          .from(blockchainTransactions)
          .where(eq(blockchainTransactions.transactionHash, input.transactionHash as string));
        assert.equal(rows.length, 1);
        assert.equal(rows[0].status, "confirmed");
      });
    } finally {
      await client.close();
    }
  },
);

test(
  "recording the same transaction twice results in exactly one row",
  { skip: !hasDb && "DATABASE_URL not set — skipping live database tests" },
  async () => {
    const client = createDbClient(process.env.DATABASE_URL);
    try {
      await inRolledBackTransaction(client, async (tx) => {
        const input = validInput();
        const first = await recordBlockchainTransaction(input, tx);
        assert.equal(first.outcome, "inserted");
        const second = await recordBlockchainTransaction(input, tx);
        assert.equal(second.outcome, "duplicate");

        const rows = await tx
          .select()
          .from(blockchainTransactions)
          .where(eq(blockchainTransactions.transactionHash, input.transactionHash as string));
        assert.equal(rows.length, 1, "reprocessing must not create a duplicate row");
      });
    } finally {
      await client.close();
    }
  },
);
