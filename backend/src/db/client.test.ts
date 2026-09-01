import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDbClient, type DbClient } from "./client.ts";
import { blockchainTransactions, contractEvents } from "./schema.ts";

/**
 * These tests exercise the *actual migrated schema* against a real
 * PostgreSQL database — they are integration tests, not unit tests, and
 * are skipped automatically (not failed) when `DATABASE_URL` isn't set,
 * so `npm test` still passes in an environment with no Postgres
 * available. When `DATABASE_URL` *is* set, these genuinely connect,
 * insert, query, and verify the unique constraints created by
 * `drizzle/0000_init_infra_tables.sql` — run against a real local
 * PostgreSQL 16 instance as part of verifying this task (see
 * `docs/CURRENT_STATUS.md`).
 *
 * Each test runs inside its own transaction and deliberately throws a
 * sentinel at the end to force a ROLLBACK, so no test data is ever left
 * behind in the database, including after a test that intentionally
 * triggers a constraint violation.
 */

const hasDb = Boolean(process.env.DATABASE_URL);

class RollbackForTestCleanup extends Error {}

async function inRolledBackTransaction(
  client: DbClient,
  fn: (tx: DbClient["db"]) => Promise<void>,
): Promise<void> {
  try {
    await client.db.transaction(async (tx) => {
      await fn(tx);
      throw new RollbackForTestCleanup();
    });
  } catch (err) {
    if (!(err instanceof RollbackForTestCleanup)) {
      throw err;
    }
  }
}

test(
  "inserts a blockchain_transactions row and reads it back with the expected columns",
  { skip: !hasDb && "DATABASE_URL not set — skipping live database tests" },
  async () => {
    const client = createDbClient(process.env.DATABASE_URL);
    try {
      const txHash = `test_${randomUUID()}`;
      await inRolledBackTransaction(client, async (tx) => {
        const [inserted] = await tx
          .insert(blockchainTransactions)
          .values({
            transactionHash: txHash,
            network: "testnet",
            status: "confirmed",
            actionType: "xlm_transfer",
          })
          .returning();

        assert.equal(inserted.transactionHash, txHash);
        assert.equal(inserted.network, "testnet");
        assert.equal(inserted.status, "confirmed");
        assert.ok(inserted.createdAt instanceof Date);
        assert.equal(inserted.confirmedAt, null);
        assert.equal(inserted.errorCode, null);

        const rows = await tx
          .select()
          .from(blockchainTransactions)
          .where(eq(blockchainTransactions.transactionHash, txHash));
        assert.equal(rows.length, 1);
        assert.equal(rows[0].actionType, "xlm_transfer");
      });
    } finally {
      await client.close();
    }
  },
);

test(
  "rejects a duplicate transaction_hash (unique constraint enforced)",
  { skip: !hasDb && "DATABASE_URL not set — skipping live database tests" },
  async () => {
    const client = createDbClient(process.env.DATABASE_URL);
    try {
      const txHash = `test_${randomUUID()}`;
      await inRolledBackTransaction(client, async (tx) => {
        await tx.insert(blockchainTransactions).values({
          transactionHash: txHash,
          network: "testnet",
          status: "pending",
        });

        await assert.rejects(
          () =>
            tx.insert(blockchainTransactions).values({
              transactionHash: txHash,
              network: "testnet",
              status: "pending",
            }),
          (err: unknown) => {
            assert.ok(err instanceof Error);
            const cause = err.cause;
            const causeMessage = cause instanceof Error ? cause.message : String(cause);
            assert.match(causeMessage, /duplicate key value violates unique constraint/);
            return true;
          },
        );
      });
    } finally {
      await client.close();
    }
  },
);

test(
  "inserts a contract_events row and rejects a duplicate (transaction_hash, event_type) pair",
  { skip: !hasDb && "DATABASE_URL not set — skipping live database tests" },
  async () => {
    const client = createDbClient(process.env.DATABASE_URL);
    try {
      const txHash = `test_${randomUUID()}`;
      const contractId = `CTEST${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;

      await inRolledBackTransaction(client, async (tx) => {
        const [inserted] = await tx
          .insert(contractEvents)
          .values({
            transactionHash: txHash,
            contractId,
            network: "testnet",
            eventType: "created",
            payload: { loanId: 1, amount: 1000 },
          })
          .returning();

        assert.equal(inserted.eventType, "created");
        assert.deepEqual(inserted.payload, { loanId: 1, amount: 1000 });
        assert.equal(inserted.ledgerSequence, null);

        // A different event type for the same transaction is allowed —
        // checked before the deliberate violation below, since Postgres
        // aborts the rest of a transaction once a statement fails.
        const [second] = await tx
          .insert(contractEvents)
          .values({
            transactionHash: txHash,
            contractId,
            network: "testnet",
            eventType: "cancelled",
          })
          .returning();
        assert.equal(second.eventType, "cancelled");

        await assert.rejects(
          () =>
            tx.insert(contractEvents).values({
              transactionHash: txHash,
              contractId,
              network: "testnet",
              eventType: "created",
              payload: { loanId: 1, amount: 1000 },
            }),
          (err: unknown) => {
            assert.ok(err instanceof Error);
            const cause = err.cause;
            const causeMessage = cause instanceof Error ? cause.message : String(cause);
            assert.match(causeMessage, /duplicate key value violates unique constraint/);
            return true;
          },
        );
      });
    } finally {
      await client.close();
    }
  },
);
