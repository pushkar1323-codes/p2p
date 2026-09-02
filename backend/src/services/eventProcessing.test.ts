import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import {
  processContractEvent,
  validateAndNormalizeEvent,
  type RawContractEventInput,
} from "./eventProcessing.ts";
import { AppError } from "../errors/AppError.ts";
import { createDbClient, type Database, type DbClient } from "../db/client.ts";
import { contractEvents } from "../db/schema.ts";

// ---------------------------------------------------------------------
// Pure validation tests — no database involved at all.
// ---------------------------------------------------------------------

function validInput(overrides: Partial<RawContractEventInput> = {}): RawContractEventInput {
  return {
    transactionHash: `test_${randomUUID()}`,
    contractId: "CTESTCONTRACTID",
    network: "testnet",
    eventType: "created",
    ledgerSequence: 123456,
    payload: { loanId: 1, amount: 1000 },
    ...overrides,
  };
}

test("validateAndNormalizeEvent accepts a fully-specified valid event", () => {
  const input = validInput();
  const normalized = validateAndNormalizeEvent(input);
  assert.equal(normalized.transactionHash, input.transactionHash);
  assert.equal(normalized.contractId, "CTESTCONTRACTID");
  assert.equal(normalized.network, "testnet");
  assert.equal(normalized.eventType, "created");
  assert.equal(normalized.ledgerSequence, 123456);
  assert.deepEqual(normalized.payload, { loanId: 1, amount: 1000 });
});

test("validateAndNormalizeEvent trims surrounding whitespace on string fields", () => {
  const normalized = validateAndNormalizeEvent(
    validInput({
      transactionHash: "  abc123  ",
      contractId: " CTEST ",
      network: " testnet ",
      eventType: " created ",
    }),
  );
  assert.equal(normalized.transactionHash, "abc123");
  assert.equal(normalized.contractId, "CTEST");
  assert.equal(normalized.network, "testnet");
  assert.equal(normalized.eventType, "created");
});

test("validateAndNormalizeEvent defaults ledgerSequence and payload to null when omitted", () => {
  const normalized = validateAndNormalizeEvent({
    transactionHash: "abc",
    contractId: "C1",
    network: "testnet",
    eventType: "created",
  });
  assert.equal(normalized.ledgerSequence, null);
  assert.equal(normalized.payload, null);
});

for (const field of ["transactionHash", "contractId", "network", "eventType"] as const) {
  test(`rejects a missing required field: ${field}`, () => {
    const input = validInput({ [field]: undefined });
    assert.throws(
      () => validateAndNormalizeEvent(input),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 422);
        assert.equal(err.code, "VALIDATION_ERROR");
        assert.ok(Array.isArray(err.details));
        assert.ok((err.details as { field: string }[]).some((d) => d.field === field));
        return true;
      },
    );
  });

  test(`rejects an empty-string required field: ${field}`, () => {
    const input = validInput({ [field]: "   " });
    assert.throws(() => validateAndNormalizeEvent(input), AppError);
  });

  test(`rejects a non-string required field: ${field}`, () => {
    const input = validInput({ [field]: 12345 });
    assert.throws(() => validateAndNormalizeEvent(input), AppError);
  });
}

test("collects multiple field issues in a single error rather than only reporting the first", () => {
  try {
    validateAndNormalizeEvent({});
    assert.fail("expected validateAndNormalizeEvent to throw");
  } catch (err) {
    assert.ok(err instanceof AppError);
    assert.ok(Array.isArray(err.details));
    const fields = (err.details as { field: string }[]).map((d) => d.field);
    assert.deepEqual(
      fields.sort(),
      ["contractId", "eventType", "network", "transactionHash"].sort(),
    );
  }
});

test("rejects a negative ledgerSequence", () => {
  assert.throws(
    () => validateAndNormalizeEvent(validInput({ ledgerSequence: -1 })),
    AppError,
  );
});

test("rejects a non-integer ledgerSequence", () => {
  assert.throws(
    () => validateAndNormalizeEvent(validInput({ ledgerSequence: 1.5 })),
    AppError,
  );
});

test("rejects a non-numeric ledgerSequence string", () => {
  assert.throws(
    () => validateAndNormalizeEvent(validInput({ ledgerSequence: "not-a-number" })),
    AppError,
  );
});

test("accepts a numeric-string ledgerSequence and coerces it to a number", () => {
  const normalized = validateAndNormalizeEvent(validInput({ ledgerSequence: "42" }));
  assert.equal(normalized.ledgerSequence, 42);
  assert.equal(typeof normalized.ledgerSequence, "number");
});

test("rejects a payload that isn't JSON-serializable (e.g. a BigInt)", () => {
  assert.throws(
    () => validateAndNormalizeEvent(validInput({ payload: { amount: 10n } })),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.ok((err.details as { field: string }[]).some((d) => d.field === "payload"));
      return true;
    },
  );
});

test("rejects a circular-reference payload", () => {
  const circular: Record<string, unknown> = { a: 1 };
  circular.self = circular;
  assert.throws(
    () => validateAndNormalizeEvent(validInput({ payload: circular })),
    AppError,
  );
});

test("normalizes a payload's non-JSON values away exactly as JSON.stringify would (e.g. drops undefined properties)", () => {
  const normalized = validateAndNormalizeEvent(
    validInput({ payload: { keep: 1, drop: undefined } }),
  );
  assert.deepEqual(normalized.payload, { keep: 1 });
});

test("accepts array and primitive JSON payloads, not just objects", () => {
  assert.deepEqual(
    validateAndNormalizeEvent(validInput({ payload: [1, 2, 3] })).payload,
    [1, 2, 3],
  );
  assert.equal(
    validateAndNormalizeEvent(validInput({ payload: "just-a-string" })).payload,
    "just-a-string",
  );
});

// ---------------------------------------------------------------------
// Failure handling — a fake database that always fails, no live
// Postgres required. Proves the service never treats an unexpected
// persistence failure as success.
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

test("processContractEvent rejects invalid input before ever touching the database", async () => {
  // No db argument at all, and no DATABASE_URL required — validation
  // must fail before the database would even be resolved.
  await assert.rejects(
    () => processContractEvent({ transactionHash: "only-one-field" }),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.code, "VALIDATION_ERROR");
      return true;
    },
  );
});

test("processContractEvent surfaces an unexpected persistence failure as AppError.persistenceFailed, not as success", async () => {
  const underlying = new Error("simulated connection failure");
  const failingDb = makeFailingDb(underlying);

  await assert.rejects(
    () => processContractEvent(validInput(), failingDb),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 503);
      assert.equal(err.code, "PERSISTENCE_FAILED");
      assert.equal(err.cause, underlying);
      return true;
    },
  );
});

// ---------------------------------------------------------------------
// Live PostgreSQL integration tests — skipped automatically (not
// failed) when DATABASE_URL isn't set. Each test runs inside its own
// transaction that is always rolled back, so no test data is left
// behind, matching the pattern already established in
// `db/client.test.ts`.
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
  "processContractEvent persists a valid event and reports it as inserted",
  { skip: !hasDb && "DATABASE_URL not set — skipping live database tests" },
  async () => {
    const client = createDbClient(process.env.DATABASE_URL);
    try {
      await inRolledBackTransaction(client, async (tx) => {
        const input = validInput();
        const result = await processContractEvent(input, tx);

        assert.equal(result.outcome, "inserted");
        assert.equal(result.event.transactionHash, input.transactionHash);

        const rows = await tx
          .select()
          .from(contractEvents)
          .where(eq(contractEvents.transactionHash, input.transactionHash as string));
        assert.equal(rows.length, 1);
        assert.equal(rows[0].eventType, "created");
      });
    } finally {
      await client.close();
    }
  },
);

test(
  "processing the same event twice results in exactly one database record",
  { skip: !hasDb && "DATABASE_URL not set — skipping live database tests" },
  async () => {
    const client = createDbClient(process.env.DATABASE_URL);
    try {
      await inRolledBackTransaction(client, async (tx) => {
        const input = validInput();

        const first = await processContractEvent(input, tx);
        assert.equal(first.outcome, "inserted");

        const second = await processContractEvent(input, tx);
        assert.equal(second.outcome, "duplicate");
        assert.equal(second.event.transactionHash, first.event.transactionHash);

        const rows = await tx
          .select()
          .from(contractEvents)
          .where(
            and(
              eq(contractEvents.transactionHash, input.transactionHash as string),
              eq(contractEvents.eventType, input.eventType as string),
            ),
          );
        assert.equal(rows.length, 1, "reprocessing must not create a duplicate row");
      });
    } finally {
      await client.close();
    }
  },
);

test(
  "processing the same event a third time is still safe and still a single record (retry-safety)",
  { skip: !hasDb && "DATABASE_URL not set — skipping live database tests" },
  async () => {
    const client = createDbClient(process.env.DATABASE_URL);
    try {
      await inRolledBackTransaction(client, async (tx) => {
        const input = validInput();
        await processContractEvent(input, tx);
        await processContractEvent(input, tx);
        const third = await processContractEvent(input, tx);
        assert.equal(third.outcome, "duplicate");

        const rows = await tx
          .select()
          .from(contractEvents)
          .where(eq(contractEvents.transactionHash, input.transactionHash as string));
        assert.equal(rows.length, 1);
      });
    } finally {
      await client.close();
    }
  },
);

test(
  "different valid events (different transaction hashes) are persisted independently",
  { skip: !hasDb && "DATABASE_URL not set — skipping live database tests" },
  async () => {
    const client = createDbClient(process.env.DATABASE_URL);
    try {
      await inRolledBackTransaction(client, async (tx) => {
        const inputA = validInput();
        const inputB = validInput();

        const resultA = await processContractEvent(inputA, tx);
        const resultB = await processContractEvent(inputB, tx);

        assert.equal(resultA.outcome, "inserted");
        assert.equal(resultB.outcome, "inserted");
        assert.notEqual(resultA.event.transactionHash, resultB.event.transactionHash);
      });
    } finally {
      await client.close();
    }
  },
);

test(
  "two different event types on the same transaction hash are both persisted independently",
  { skip: !hasDb && "DATABASE_URL not set — skipping live database tests" },
  async () => {
    const client = createDbClient(process.env.DATABASE_URL);
    try {
      await inRolledBackTransaction(client, async (tx) => {
        const txHash = `test_${randomUUID()}`;
        const created = await processContractEvent(
          validInput({ transactionHash: txHash, eventType: "created" }),
          tx,
        );
        const cancelled = await processContractEvent(
          validInput({ transactionHash: txHash, eventType: "cancelled" }),
          tx,
        );

        assert.equal(created.outcome, "inserted");
        assert.equal(cancelled.outcome, "inserted");

        const rows = await tx
          .select()
          .from(contractEvents)
          .where(eq(contractEvents.transactionHash, txHash));
        assert.equal(rows.length, 2);
      });
    } finally {
      await client.close();
    }
  },
);

test(
  "ledger sequence is preserved through persistence when supplied",
  { skip: !hasDb && "DATABASE_URL not set — skipping live database tests" },
  async () => {
    const client = createDbClient(process.env.DATABASE_URL);
    try {
      await inRolledBackTransaction(client, async (tx) => {
        const input = validInput({ ledgerSequence: 987654321 });
        const result = await processContractEvent(input, tx);
        assert.equal(result.event.ledgerSequence, 987654321);

        const rows = await tx
          .select()
          .from(contractEvents)
          .where(eq(contractEvents.transactionHash, input.transactionHash as string));
        assert.equal(rows[0].ledgerSequence, 987654321);
      });
    } finally {
      await client.close();
    }
  },
);

test(
  "ledger sequence persists as null when omitted",
  { skip: !hasDb && "DATABASE_URL not set — skipping live database tests" },
  async () => {
    const client = createDbClient(process.env.DATABASE_URL);
    try {
      await inRolledBackTransaction(client, async (tx) => {
        const input = validInput({ ledgerSequence: undefined });
        await processContractEvent(input, tx);

        const rows = await tx
          .select()
          .from(contractEvents)
          .where(eq(contractEvents.transactionHash, input.transactionHash as string));
        assert.equal(rows[0].ledgerSequence, null);
      });
    } finally {
      await client.close();
    }
  },
);

test(
  "a JSON object payload round-trips through persistence unchanged",
  { skip: !hasDb && "DATABASE_URL not set — skipping live database tests" },
  async () => {
    const client = createDbClient(process.env.DATABASE_URL);
    try {
      await inRolledBackTransaction(client, async (tx) => {
        const input = validInput({
          payload: { loanId: 42, amount: 250000, nested: { ok: true } },
        });
        await processContractEvent(input, tx);

        const rows = await tx
          .select()
          .from(contractEvents)
          .where(eq(contractEvents.transactionHash, input.transactionHash as string));
        assert.deepEqual(rows[0].payload, {
          loanId: 42,
          amount: 250000,
          nested: { ok: true },
        });
      });
    } finally {
      await client.close();
    }
  },
);
