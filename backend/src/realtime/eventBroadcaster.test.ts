import { test } from "node:test";
import assert from "node:assert/strict";
import { createEventBroadcaster, type SseSink } from "./eventBroadcaster.ts";
import type { ContractEventUpdate } from "./types.ts";

function fakeSink() {
  const chunks: string[] = [];
  return {
    chunks,
    sink: {
      write(chunk: string) {
        chunks.push(chunk);
      },
    } as SseSink,
  };
}

function sampleUpdate(overrides: Partial<ContractEventUpdate> = {}): ContractEventUpdate {
  return {
    type: "contract-event",
    transactionHash: "tx123",
    contractId: "CTEST",
    network: "testnet",
    eventType: "created",
    ledgerSequence: 42,
    payload: { loanId: 1 },
    occurredAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("clientCount starts at zero for a fresh broadcaster", () => {
  const broadcaster = createEventBroadcaster();
  assert.equal(broadcaster.clientCount(), 0);
});

test("subscribe registers a client, reflected in clientCount", () => {
  const broadcaster = createEventBroadcaster();
  const { sink } = fakeSink();
  broadcaster.subscribe(sink);
  assert.equal(broadcaster.clientCount(), 1);
});

test("broadcast writes a well-formed SSE frame containing the update as JSON to every subscribed client", () => {
  const broadcaster = createEventBroadcaster();
  const a = fakeSink();
  const b = fakeSink();
  broadcaster.subscribe(a.sink);
  broadcaster.subscribe(b.sink);

  const update = sampleUpdate();
  broadcaster.broadcast(update);

  for (const { chunks } of [a, b]) {
    assert.equal(chunks.length, 1);
    assert.match(chunks[0], /^event: contract-event\n/);
    assert.match(chunks[0], /\n\n$/);
    const dataLine = chunks[0].split("\n").find((line) => line.startsWith("data: "));
    assert.ok(dataLine, "expected a data: line in the SSE frame");
    const parsed = JSON.parse(dataLine!.slice("data: ".length));
    assert.deepEqual(parsed, update);
  }
});

test("a client not subscribed does not receive a broadcast", () => {
  const broadcaster = createEventBroadcaster();
  const subscribed = fakeSink();
  const notSubscribed = fakeSink();
  broadcaster.subscribe(subscribed.sink);

  broadcaster.broadcast(sampleUpdate());

  assert.equal(subscribed.chunks.length, 1);
  assert.equal(notSubscribed.chunks.length, 0);
});

test("unsubscribe removes a client so it no longer receives broadcasts", () => {
  const broadcaster = createEventBroadcaster();
  const { sink, chunks } = fakeSink();
  broadcaster.subscribe(sink);
  broadcaster.unsubscribe(sink);

  assert.equal(broadcaster.clientCount(), 0);
  broadcaster.broadcast(sampleUpdate());
  assert.equal(chunks.length, 0);
});

test("unsubscribing a sink that was never subscribed is a safe no-op", () => {
  const broadcaster = createEventBroadcaster();
  const { sink } = fakeSink();
  assert.doesNotThrow(() => broadcaster.unsubscribe(sink));
  assert.equal(broadcaster.clientCount(), 0);
});

test("a sink whose write() throws is dropped automatically, without breaking delivery to other clients", () => {
  const broadcaster = createEventBroadcaster();
  const broken: SseSink = {
    write() {
      throw new Error("simulated dead connection");
    },
  };
  const healthy = fakeSink();
  broadcaster.subscribe(broken);
  broadcaster.subscribe(healthy.sink);

  assert.doesNotThrow(() => broadcaster.broadcast(sampleUpdate()));
  assert.equal(healthy.chunks.length, 1, "the healthy client must still receive the update");
  assert.equal(broadcaster.clientCount(), 1, "the broken sink must be removed from the client set");
});

test("createEventBroadcaster returns an isolated instance each time (no shared state)", () => {
  const a = createEventBroadcaster();
  const b = createEventBroadcaster();
  const { sink } = fakeSink();
  a.subscribe(sink);
  assert.equal(a.clientCount(), 1);
  assert.equal(b.clientCount(), 0);
});
