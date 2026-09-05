import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { createApp } from "../app.ts";
import { createEventBroadcaster } from "../realtime/eventBroadcaster.ts";
import type { ContractEventUpdate } from "../realtime/types.ts";
import { createDbClient, type Database, type DbClient } from "../db/client.ts";

async function startTestServer(db?: Database) {
  const eventBroadcaster = createEventBroadcaster();
  const app = createApp({ eventBroadcaster, db });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    eventBroadcaster,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function eventBody(overrides: Record<string, unknown> = {}) {
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

// ---------------------------------------------------------------------
// Fake-database tests — no live Postgres required.
// ---------------------------------------------------------------------

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

/**
 * Like `makeSucceedingDb`, but also supports the read
 * (`select/from/where/orderBy/limit`) chain `queryContractEvents`
 * uses, terminating in an empty result set. Needed for any test that
 * exercises a *successful* `GET /events` — `makeSucceedingDb` alone
 * only implements the write chain, so calling `.select()` on it would
 * throw `TypeError: database.select is not a function`, which would
 * mask the actual behavior under test.
 */
function makeReadWriteDb(): Database {
  let lastValues: Record<string, unknown> = {};
  const chain = {
    insert: () => chain,
    values: (v: Record<string, unknown>) => {
      lastValues = v;
      return chain;
    },
    onConflictDoNothing: () => chain,
    returning: () => Promise.resolve([{ id: 1, createdAt: new Date(), ...lastValues }]),
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve([]),
  };
  return chain as unknown as Database;
}

test("POST /events rejects a body without an event", async () => {
  const { baseUrl, close } = await startTestServer(makeSucceedingDb());
  try {
    const res = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 422);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "VALIDATION_ERROR");
  } finally {
    await close();
  }
});

test("POST /events rejects an event missing required fields", async () => {
  const { baseUrl, close } = await startTestServer(makeSucceedingDb());
  try {
    const res = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: { transactionHash: "only-one-field" } }),
    });
    assert.equal(res.status, 422);
  } finally {
    await close();
  }
});

test("POST /events with a valid event (no transaction) persists and broadcasts it", async () => {
  const { baseUrl, eventBroadcaster, close } = await startTestServer(makeSucceedingDb());
  try {
    const body = eventBody({ transactionHash: "tx-post-1" });
    const res = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: body }),
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as { transaction: unknown; event: { outcome: string } };
    assert.equal(json.transaction, null);
    assert.equal(json.event.outcome, "inserted");
    assert.equal(eventBroadcaster.clientCount(), 0); // no SSE clients connected in this test — just proves the call didn't throw
  } finally {
    await close();
  }
});

test("POST /events records the transaction and event together when both are supplied", async () => {
  const { baseUrl, close } = await startTestServer(makeSucceedingDb());
  try {
    const txHash = "tx-post-2";
    const res = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transaction: { transactionHash: txHash, network: "testnet", status: "confirmed" },
        event: eventBody({ transactionHash: txHash }),
      }),
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      transaction: { outcome: string } | null;
      event: { outcome: string };
    };
    assert.equal(json.transaction?.outcome, "inserted");
    assert.equal(json.event.outcome, "inserted");
  } finally {
    await close();
  }
});

test("GET /events rejects a non-numeric limit", async () => {
  const { baseUrl, close } = await startTestServer(makeSucceedingDb());
  try {
    const res = await fetch(`${baseUrl}/events?limit=abc`);
    assert.equal(res.status, 422);
  } finally {
    await close();
  }
});

// Regression test for the Express 5 `req.query` getter-only-property
// bug: this specifically exercises the *success* path of query
// validation (a valid query reaching the `req.query = result.data`
// replacement inside validate.ts) against a real Express app/request,
// which "rejects a non-numeric limit" above never did — that test's
// invalid query short-circuits before validate.ts ever attempts the
// replacement. Without the fix, every one of these previously
// responded 500 with "Cannot set property query of #<IncomingMessage>
// which has only a getter".
test("GET /events succeeds with no query params (empty query still hits validate's success path)", async () => {
  const { baseUrl, close } = await startTestServer(makeReadWriteDb());
  try {
    const res = await fetch(`${baseUrl}/events`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { events: unknown[] };
    assert.ok(Array.isArray(body.events));
  } finally {
    await close();
  }
});

test("GET /events succeeds with valid filters and a numeric limit", async () => {
  const { baseUrl, close } = await startTestServer(makeReadWriteDb());
  try {
    const res = await fetch(`${baseUrl}/events?limit=5&contractId=CTEST&eventType=created`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { events: unknown[] };
    assert.ok(Array.isArray(body.events));
  } finally {
    await close();
  }
});

// ---------------------------------------------------------------------
// Live PostgreSQL integration test — skipped automatically (not
// failed) when DATABASE_URL isn't set. Proves the actual
// POST-then-GET round trip end to end, in a rolled-back transaction.
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
  "a real POST /events is visible through a subsequent GET /events",
  { skip: !hasDb && "DATABASE_URL not set — skipping live database tests" },
  async () => {
    const client = createDbClient(process.env.DATABASE_URL);
    try {
      await inRolledBackTransaction(client, async (tx) => {
        const { baseUrl, close } = await startTestServer(tx);
        try {
          const contractId = `CROUNDTRIP_${randomUUID()}`;
          const postRes = await fetch(`${baseUrl}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event: eventBody({ contractId }) }),
          });
          assert.equal(postRes.status, 200);

          const getRes = await fetch(`${baseUrl}/events?contractId=${contractId}`);
          assert.equal(getRes.status, 200);
          const { events } = (await getRes.json()) as { events: { contractId: string; eventType: string }[] };
          assert.equal(events.length, 1);
          assert.equal(events[0].contractId, contractId);
          assert.equal(events[0].eventType, "created");
        } finally {
          await close();
        }
      });
    } finally {
      await client.close();
    }
  },
);

test(
  "GET /events with no query params at all succeeds against a real database",
  { skip: !hasDb && "DATABASE_URL not set — skipping live database tests" },
  async () => {
    const client = createDbClient(process.env.DATABASE_URL);
    try {
      await inRolledBackTransaction(client, async (tx) => {
        const { baseUrl, close } = await startTestServer(tx);
        try {
          // The exact shape that triggered the original bug report:
          // an empty query object is still a *successful* zod parse,
          // so this reaches validate.ts's req.query replacement even
          // though no filters were provided.
          const res = await fetch(`${baseUrl}/events`);
          assert.equal(res.status, 200);
          const body = (await res.json()) as { events: unknown[] };
          assert.ok(Array.isArray(body.events));
        } finally {
          await close();
        }
      });
    } finally {
      await client.close();
    }
  },
);
