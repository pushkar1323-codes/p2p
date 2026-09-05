import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEventsHistoryQuery, parseHistoryEvent } from "./eventsApi.ts";

test("buildEventsHistoryQuery returns an empty string for no filters", () => {
  assert.equal(buildEventsHistoryQuery({}), "");
});

test("buildEventsHistoryQuery includes only the provided filters", () => {
  assert.equal(buildEventsHistoryQuery({ contractId: "C1" }), "?contractId=C1");
  assert.equal(buildEventsHistoryQuery({ limit: 10 }), "?limit=10");
});

test("buildEventsHistoryQuery combines multiple filters", () => {
  const query = buildEventsHistoryQuery({ contractId: "C1", eventType: "created", limit: 5 });
  const params = new URLSearchParams(query.slice(1));
  assert.equal(params.get("contractId"), "C1");
  assert.equal(params.get("eventType"), "created");
  assert.equal(params.get("limit"), "5");
});

test("parseHistoryEvent accepts a well-formed event", () => {
  const parsed = parseHistoryEvent({
    id: 1,
    transactionHash: "tx1",
    contractId: "C1",
    network: "testnet",
    eventType: "created",
    ledgerSequence: 42,
    payload: { loanId: 1 },
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  assert.ok(parsed);
  assert.equal(parsed?.id, 1);
  assert.equal(parsed?.eventType, "created");
  assert.equal(parsed?.ledgerSequence, 42);
});

test("parseHistoryEvent defaults ledgerSequence/payload when absent", () => {
  const parsed = parseHistoryEvent({
    id: 1,
    transactionHash: "tx1",
    contractId: "C1",
    network: "testnet",
    eventType: "created",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(parsed?.ledgerSequence, null);
  assert.equal(parsed?.payload, null);
});

test("parseHistoryEvent returns null for non-objects", () => {
  assert.equal(parseHistoryEvent(null), null);
  assert.equal(parseHistoryEvent("not an object"), null);
  assert.equal(parseHistoryEvent(42), null);
});

test("parseHistoryEvent returns null when a required field is missing or the wrong type", () => {
  const base = {
    id: 1,
    transactionHash: "tx1",
    contractId: "C1",
    network: "testnet",
    eventType: "created",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  for (const field of ["id", "transactionHash", "contractId", "network", "eventType", "createdAt"] as const) {
    assert.equal(parseHistoryEvent({ ...base, [field]: undefined }), null, `missing ${field}`);
  }
  assert.equal(parseHistoryEvent({ ...base, id: "not-a-number" }), null);
});
