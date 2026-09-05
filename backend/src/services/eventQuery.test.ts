import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  queryContractEvents,
  resolveEventQueryLimit,
  DEFAULT_EVENT_QUERY_LIMIT,
  MAX_EVENT_QUERY_LIMIT,
} from "./eventQuery.ts";
import { processContractEvent, type RawContractEventInput } from "./eventProcessing.ts";
import { createDbClient, type Database, type DbClient } from "../db/client.ts";

// ---------------------------------------------------------------------
// Pure limit-clamping tests — no database involved at all.
// ---------------------------------------------------------------------

test("resolveEventQueryLimit defaults when undefined", () => {
  assert.equal(resolveEventQueryLimit(undefined), DEFAULT_EVENT_QUERY_LIMIT);
});

test("resolveEventQueryLimit defaults when not finite", () => {
  assert.equal(resolveEventQueryLimit(NaN), DEFAULT_EVENT_QUERY_LIMIT);
  assert.equal(resolveEventQueryLimit(Infinity), DEFAULT_EVENT_QUERY_LIMIT);
});

test("resolveEventQueryLimit passes a value inside the allowed range through unchanged", () => {
  assert.equal(resolveEventQueryLimit(10), 10);
});

test("resolveEventQueryLimit clamps a value above the max", () => {
  assert.equal(resolveEventQueryLimit(MAX_EVENT_QUERY_LIMIT + 500), MAX_EVENT_QUERY_LIMIT);
});

test("resolveEventQueryLimit clamps a value below 1", () => {
  assert.equal(resolveEventQueryLimit(0), 1);
  assert.equal(resolveEventQueryLimit(-5), 1);
});

test("resolveEventQueryLimit truncates a fractional value", () => {
  assert.equal(resolveEventQueryLimit(10.9), 10);
});

// ---------------------------------------------------------------------
// Live PostgreSQL integration tests — skipped automatically (not
// failed) when DATABASE_URL isn't set. The query logic depends on real
// SQL filtering/ordering/pagination semantics that a hand-written fake
// database chain can't faithfully reproduce (same reasoning
// eventProcessing.test.ts's own live-DB section documents for its
// multi-row scenarios) — so this is where that behavior is actually
// proven.
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

function eventInput(overrides: Partial<RawContractEventInput> = {}): RawContractEventInput {
  return {
    transactionHash: `test_${randomUUID()}`,
    contractId: "CTESTCONTRACTID",
    network: "testnet",
    eventType: "created",
    ledgerSequence: 1,
    payload: { loanId: 1 },
    ...overrides,
  };
}

test(
  "queryContractEvents returns newest-first and respects limit",
  { skip: !hasDb && "DATABASE_URL not set — skipping live database tests" },
  async () => {
    const client = createDbClient(process.env.DATABASE_URL);
    try {
      await inRolledBackTransaction(client, async (tx) => {
        const txHash = `test_${randomUUID()}`;
        await processContractEvent(eventInput({ transactionHash: txHash, eventType: "created" }), tx);
        await processContractEvent(eventInput({ transactionHash: txHash, eventType: "cancelled" }), tx);

        const results = await queryContractEvents({ contractId: "CTESTCONTRACTID", limit: 1 }, tx);
        assert.equal(results.length, 1);
        // Newest id first — "cancelled" was inserted second.
        assert.equal(results[0].eventType, "cancelled");
      });
    } finally {
      await client.close();
    }
  },
);

test(
  "queryContractEvents filters by eventType and network",
  { skip: !hasDb && "DATABASE_URL not set — skipping live database tests" },
  async () => {
    const client = createDbClient(process.env.DATABASE_URL);
    try {
      await inRolledBackTransaction(client, async (tx) => {
        const contractId = `CFILTER_${randomUUID()}`;
        await processContractEvent(eventInput({ contractId, eventType: "created", network: "testnet" }), tx);
        await processContractEvent(eventInput({ contractId, eventType: "cancelled", network: "testnet" }), tx);

        const onlyCancelled = await queryContractEvents({ contractId, eventType: "cancelled" }, tx);
        assert.equal(onlyCancelled.length, 1);
        assert.equal(onlyCancelled[0].eventType, "cancelled");

        const wrongNetwork = await queryContractEvents({ contractId, network: "mainnet" }, tx);
        assert.equal(wrongNetwork.length, 0);
      });
    } finally {
      await client.close();
    }
  },
);

test(
  "queryContractEvents paginates via beforeId",
  { skip: !hasDb && "DATABASE_URL not set — skipping live database tests" },
  async () => {
    const client = createDbClient(process.env.DATABASE_URL);
    try {
      await inRolledBackTransaction(client, async (tx) => {
        const contractId = `CPAGE_${randomUUID()}`;
        await processContractEvent(eventInput({ contractId, eventType: "created" }), tx);
        await processContractEvent(eventInput({ contractId, eventType: "cancelled" }), tx);

        const firstPage = await queryContractEvents({ contractId, limit: 1 }, tx);
        assert.equal(firstPage.length, 1);

        const secondPage = await queryContractEvents({ contractId, limit: 1, beforeId: firstPage[0].id }, tx);
        assert.equal(secondPage.length, 1);
        assert.notEqual(secondPage[0].id, firstPage[0].id);
        assert.ok(secondPage[0].id < firstPage[0].id);
      });
    } finally {
      await client.close();
    }
  },
);
