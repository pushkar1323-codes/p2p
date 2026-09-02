import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app.ts";
import { createEventBroadcaster } from "../realtime/eventBroadcaster.ts";
import type { ContractEventUpdate } from "../realtime/types.ts";

/**
 * Starts a fresh app (with its own isolated broadcaster, never the
 * process-wide singleton) on an ephemeral port. Mirrors
 * `app.test.ts`'s `startTestServer`, extended to also hand back the
 * broadcaster so tests can call `broadcast()` directly.
 */
async function startTestServer() {
  const eventBroadcaster = createEventBroadcaster();
  const app = createApp({ eventBroadcaster });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    eventBroadcaster,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Reads one SSE "frame" (up to the next blank line) from a stream reader. */
async function readOneFrame(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  buffered: { text: string },
): Promise<string> {
  const decoder = new TextDecoder();
  while (!buffered.text.includes("\n\n")) {
    const { value, done } = await reader.read();
    if (done) throw new Error("stream ended before a full frame was received");
    buffered.text += decoder.decode(value, { stream: true });
  }
  const separatorIndex = buffered.text.indexOf("\n\n");
  const frame = buffered.text.slice(0, separatorIndex);
  buffered.text = buffered.text.slice(separatorIndex + 2);
  return frame;
}

function sampleUpdate(overrides: Partial<ContractEventUpdate> = {}): ContractEventUpdate {
  return {
    type: "contract-event",
    transactionHash: "tx-http-test",
    contractId: "CTEST",
    network: "testnet",
    eventType: "created",
    ledgerSequence: 7,
    payload: { loanId: 3, borrower: "GABC", amount: "1000" },
    occurredAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("GET /events/stream establishes a connection with the correct SSE headers", async () => {
  const { baseUrl, close } = await startTestServer();
  const controller = new AbortController();
  try {
    const res = await fetch(`${baseUrl}/events/stream`, { signal: controller.signal });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);

    // The route writes an initial comment frame immediately, before
    // any broadcast — proves the connection is actually open and
    // streaming, not just accepted.
    const reader = res.body!.getReader();
    const buffered = { text: "" };
    const firstFrame = await readOneFrame(reader, buffered);
    assert.match(firstFrame, /^: connected/);
  } finally {
    controller.abort();
    await close();
  }
});

test("a broadcasted update reaches a connected SSE client", async () => {
  const { baseUrl, eventBroadcaster, close } = await startTestServer();
  const controller = new AbortController();
  try {
    const res = await fetch(`${baseUrl}/events/stream`, { signal: controller.signal });
    const reader = res.body!.getReader();
    const buffered = { text: "" };
    await readOneFrame(reader, buffered); // discard the initial ": connected" comment

    const update = sampleUpdate();
    eventBroadcaster.broadcast(update);

    const frame = await readOneFrame(reader, buffered);
    assert.match(frame, /^event: contract-event\n/);
    const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
    assert.ok(dataLine, "expected a data: line in the broadcast frame");
    assert.deepEqual(JSON.parse(dataLine!.slice("data: ".length)), update);
  } finally {
    controller.abort();
    await close();
  }
});

test("an update broadcast before any client connects is not delivered retroactively, and a later client only sees updates broadcast after it connects", async () => {
  const { baseUrl, eventBroadcaster, close } = await startTestServer();
  const controller = new AbortController();
  try {
    // Broadcast with nobody listening — must not throw, and must not
    // be queued for a client that connects afterward.
    assert.doesNotThrow(() => eventBroadcaster.broadcast(sampleUpdate({ transactionHash: "before-connect" })));

    const res = await fetch(`${baseUrl}/events/stream`, { signal: controller.signal });
    const reader = res.body!.getReader();
    const buffered = { text: "" };
    const firstFrame = await readOneFrame(reader, buffered);
    assert.match(firstFrame, /^: connected/, "the first frame must be the connection comment, not a stale update");

    const update = sampleUpdate({ transactionHash: "after-connect" });
    eventBroadcaster.broadcast(update);
    const frame = await readOneFrame(reader, buffered);
    const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
    assert.equal(JSON.parse(dataLine!.slice("data: ".length)).transactionHash, "after-connect");
  } finally {
    controller.abort();
    await close();
  }
});

test("closing the client connection removes it from the broadcaster's subscribed clients", async () => {
  const { baseUrl, eventBroadcaster, close } = await startTestServer();
  const controller = new AbortController();
  try {
    const res = await fetch(`${baseUrl}/events/stream`, { signal: controller.signal });
    const reader = res.body!.getReader();
    const buffered = { text: "" };
    await readOneFrame(reader, buffered); // wait for the connection to actually be open
    assert.equal(eventBroadcaster.clientCount(), 1);

    controller.abort();

    // The server's "close" listener fires asynchronously; poll briefly
    // rather than asserting immediately.
    const deadline = Date.now() + 2000;
    while (eventBroadcaster.clientCount() > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(eventBroadcaster.clientCount(), 0);
  } finally {
    await close();
  }
});
