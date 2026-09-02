import { test } from "node:test";
import assert from "node:assert/strict";
import { createSseClient, type EventSourceLike, type SseConnectionStatus } from "./sseClient.ts";

class FakeEventSource implements EventSourceLike {
  url: string;
  closed = false;
  onopen: (() => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  constructor(url: string) {
    this.url = url;
  }
  close() {
    this.closed = true;
  }
}

function makeFactory() {
  const instances: FakeEventSource[] = [];
  return {
    instances,
    create: (url: string): EventSourceLike => {
      const es = new FakeEventSource(url);
      instances.push(es);
      return es;
    },
  };
}

interface ScheduledEntry {
  fn: () => void;
  delayMs: number;
  cancelled: boolean;
}

function makeFakeScheduler() {
  const scheduled: ScheduledEntry[] = [];
  return {
    scheduled,
    scheduleTimeout: (fn: () => void, delayMs: number): unknown => {
      const entry: ScheduledEntry = { fn, delayMs, cancelled: false };
      scheduled.push(entry);
      return entry;
    },
    clearScheduledTimeout: (handle: unknown) => {
      (handle as ScheduledEntry).cancelled = true;
    },
    /** Runs (and removes) the oldest still-pending scheduled callback, if any. */
    runNext: () => {
      const entry = scheduled.shift();
      if (entry && !entry.cancelled) entry.fn();
    },
  };
}

/** Temporarily replaces console.error, returning the captured calls and a restore function. */
function captureConsoleError() {
  const calls: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };
  return {
    calls,
    restore: () => {
      console.error = original;
    },
  };
}

test("opens exactly one connection on creation, with status 'connecting'", () => {
  const factory = makeFactory();
  const client = createSseClient<{ foo: number }>({
    url: "http://backend.test/events/stream",
    onMessage: () => {},
    createEventSource: factory.create,
  });
  assert.equal(factory.instances.length, 1);
  assert.equal(factory.instances[0].url, "http://backend.test/events/stream");
  assert.equal(client.status(), "connecting");
  client.stop();
});

test("status becomes 'open' once the connection opens, and a message is parsed and delivered", () => {
  const factory = makeFactory();
  const received: { foo: number }[] = [];
  const statuses: SseConnectionStatus[] = [];
  const client = createSseClient<{ foo: number }>({
    url: "http://backend.test/events/stream",
    onMessage: (data) => received.push(data),
    onStatusChange: (s) => statuses.push(s),
    createEventSource: factory.create,
  });

  factory.instances[0].onopen?.();
  assert.equal(client.status(), "open");
  assert.deepEqual(statuses, ["open"]);

  factory.instances[0].onmessage?.({ data: JSON.stringify({ foo: 42 }) });
  assert.deepEqual(received, [{ foo: 42 }]);

  client.stop();
});

test("on connection error, schedules a reconnect and moves to 'reconnecting'", () => {
  const factory = makeFactory();
  const scheduler = makeFakeScheduler();
  const errorLog = captureConsoleError();
  try {
    const client = createSseClient<unknown>({
      url: "http://backend.test/events/stream",
      onMessage: () => {},
      createEventSource: factory.create,
      scheduleTimeout: scheduler.scheduleTimeout,
      clearScheduledTimeout: scheduler.clearScheduledTimeout,
      baseDelayMs: 1000,
    });

    factory.instances[0].onerror?.(new Error("simulated failure"));

    assert.equal(client.status(), "reconnecting");
    assert.equal(scheduler.scheduled.length, 1);
    assert.equal(scheduler.scheduled[0].delayMs, 1000); // base delay for the first retry
    assert.equal(factory.instances[0].closed, true, "the failed connection must be closed");

    scheduler.runNext();
    assert.equal(factory.instances.length, 2, "the scheduled reconnect must open a new connection");

    client.stop();
  } finally {
    errorLog.restore();
  }
});

test("backoff delay doubles on each successive failure, up to maxDelayMs", () => {
  const factory = makeFactory();
  const scheduler = makeFakeScheduler();
  const errorLog = captureConsoleError();
  try {
    const client = createSseClient<unknown>({
      url: "http://backend.test/events/stream",
      onMessage: () => {},
      createEventSource: factory.create,
      scheduleTimeout: scheduler.scheduleTimeout,
      clearScheduledTimeout: scheduler.clearScheduledTimeout,
      baseDelayMs: 1000,
      maxDelayMs: 5000,
      maxReconnectAttempts: 10,
    });

    factory.instances[0].onerror?.(new Error("fail 1"));
    assert.equal(scheduler.scheduled[0].delayMs, 1000);
    scheduler.runNext();

    factory.instances[1].onerror?.(new Error("fail 2"));
    assert.equal(scheduler.scheduled[0].delayMs, 2000);
    scheduler.runNext();

    factory.instances[2].onerror?.(new Error("fail 3"));
    assert.equal(scheduler.scheduled[0].delayMs, 4000);
    scheduler.runNext();

    factory.instances[3].onerror?.(new Error("fail 4"));
    assert.equal(scheduler.scheduled[0].delayMs, 5000, "must be capped at maxDelayMs, not 8000");

    client.stop();
  } finally {
    errorLog.restore();
  }
});

test("gives up after maxReconnectAttempts and reports status 'closed'", () => {
  const factory = makeFactory();
  const scheduler = makeFakeScheduler();
  const errorLog = captureConsoleError();
  try {
    const client = createSseClient<unknown>({
      url: "http://backend.test/events/stream",
      onMessage: () => {},
      createEventSource: factory.create,
      scheduleTimeout: scheduler.scheduleTimeout,
      clearScheduledTimeout: scheduler.clearScheduledTimeout,
      baseDelayMs: 10,
      maxReconnectAttempts: 2,
    });

    factory.instances[0].onerror?.(new Error("fail 1"));
    scheduler.runNext(); // -> instance #2
    factory.instances[1].onerror?.(new Error("fail 2"));
    scheduler.runNext(); // -> instance #3
    factory.instances[2].onerror?.(new Error("fail 3")); // exceeds maxReconnectAttempts

    assert.equal(client.status(), "closed");
    assert.equal(scheduler.scheduled.length, 0, "no further reconnect should be scheduled once given up");
    assert.equal(factory.instances.length, 3, "initial attempt + 2 retries = 3 connections total");
  } finally {
    errorLog.restore();
  }
});

test("a successful reopen resets the retry counter, so the next failure backs off from the base delay again", () => {
  const factory = makeFactory();
  const scheduler = makeFakeScheduler();
  const errorLog = captureConsoleError();
  try {
    const client = createSseClient<unknown>({
      url: "http://backend.test/events/stream",
      onMessage: () => {},
      createEventSource: factory.create,
      scheduleTimeout: scheduler.scheduleTimeout,
      clearScheduledTimeout: scheduler.clearScheduledTimeout,
      baseDelayMs: 1000,
    });

    factory.instances[0].onerror?.(new Error("fail 1"));
    assert.equal(scheduler.scheduled[0].delayMs, 1000);
    scheduler.runNext();

    factory.instances[1].onopen?.(); // recovers
    assert.equal(client.status(), "open");

    factory.instances[1].onerror?.(new Error("fail again"));
    assert.equal(scheduler.scheduled[0].delayMs, 1000, "backoff must restart from the base delay after a successful reopen");

    client.stop();
  } finally {
    errorLog.restore();
  }
});

test("stop() cancels a pending reconnect and never opens another connection", () => {
  const factory = makeFactory();
  const scheduler = makeFakeScheduler();
  const errorLog = captureConsoleError();
  try {
    const client = createSseClient<unknown>({
      url: "http://backend.test/events/stream",
      onMessage: () => {},
      createEventSource: factory.create,
      scheduleTimeout: scheduler.scheduleTimeout,
      clearScheduledTimeout: scheduler.clearScheduledTimeout,
    });

    factory.instances[0].onerror?.(new Error("fail"));
    assert.equal(scheduler.scheduled.length, 1);

    client.stop();
    assert.equal(client.status(), "closed");

    scheduler.runNext(); // simulates a timer that had already fired
    assert.equal(factory.instances.length, 1, "a cancelled reconnect must not open a new connection");
  } finally {
    errorLog.restore();
  }
});

test("stop() closes the current open connection, and further events on it are ignored", () => {
  const factory = makeFactory();
  const received: unknown[] = [];
  const client = createSseClient<unknown>({
    url: "http://backend.test/events/stream",
    onMessage: (data) => received.push(data),
    createEventSource: factory.create,
  });

  factory.instances[0].onopen?.();
  client.stop();

  assert.equal(factory.instances[0].closed, true);
  assert.equal(client.status(), "closed");

  // A stray error firing after stop() (e.g. a queued microtask) must
  // be a safe no-op — no reconnect, no status change.
  const errorLog = captureConsoleError();
  try {
    factory.instances[0].onerror?.(new Error("late error after stop"));
    assert.equal(factory.instances.length, 1);
    assert.equal(client.status(), "closed");
  } finally {
    errorLog.restore();
  }
});

test("repeated failures before a successful reopen only log one console error, not one per attempt", () => {
  const factory = makeFactory();
  const scheduler = makeFakeScheduler();
  const errorLog = captureConsoleError();
  try {
    const client = createSseClient<unknown>({
      url: "http://backend.test/events/stream",
      onMessage: () => {},
      createEventSource: factory.create,
      scheduleTimeout: scheduler.scheduleTimeout,
      clearScheduledTimeout: scheduler.clearScheduledTimeout,
      baseDelayMs: 10,
      maxReconnectAttempts: 5,
    });

    factory.instances[0].onerror?.(new Error("fail 1"));
    scheduler.runNext();
    factory.instances[1].onerror?.(new Error("fail 2"));
    scheduler.runNext();
    factory.instances[2].onerror?.(new Error("fail 3"));

    assert.equal(errorLog.calls.length, 1, "a lost-connection episode should log exactly once, however many retries it takes");
    client.stop();
  } finally {
    errorLog.restore();
  }
});

test("a malformed message is caught, does not crash the client, and warns only once", () => {
  const factory = makeFactory();
  const received: unknown[] = [];
  const errorLog = captureConsoleError();
  try {
    const client = createSseClient<unknown>({
      url: "http://backend.test/events/stream",
      onMessage: (data) => received.push(data),
      createEventSource: factory.create,
    });

    factory.instances[0].onopen?.();
    assert.doesNotThrow(() => {
      factory.instances[0].onmessage?.({ data: "not valid json" });
      factory.instances[0].onmessage?.({ data: "still not valid json" });
    });
    assert.equal(received.length, 0);
    assert.equal(errorLog.calls.length, 1, "a run of malformed messages should warn only once");

    factory.instances[0].onmessage?.({ data: JSON.stringify({ ok: true }) });
    assert.deepEqual(received, [{ ok: true }]);

    client.stop();
  } finally {
    errorLog.restore();
  }
});

test("a synchronous failure creating the very first connection is handled safely and schedules a retry", () => {
  const scheduler = makeFakeScheduler();
  const errorLog = captureConsoleError();
  try {
    let calls = 0;
    const client = createSseClient<unknown>({
      url: "http://backend.test/events/stream",
      onMessage: () => {},
      createEventSource: () => {
        calls += 1;
        throw new Error("EventSource unavailable");
      },
      scheduleTimeout: scheduler.scheduleTimeout,
      clearScheduledTimeout: scheduler.clearScheduledTimeout,
      baseDelayMs: 10,
      maxReconnectAttempts: 3,
    });

    assert.equal(calls, 1);
    assert.equal(client.status(), "reconnecting");
    assert.equal(scheduler.scheduled.length, 1);

    client.stop();
  } finally {
    errorLog.restore();
  }
});
