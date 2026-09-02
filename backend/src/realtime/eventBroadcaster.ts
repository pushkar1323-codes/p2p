import type { ContractEventUpdate } from "./types.ts";

/**
 * The minimal capability a broadcaster needs from a connected client:
 * something it can write an SSE text frame to. Deliberately *not*
 * Express's `Response` type — Express's `Response.write` satisfies
 * this structurally, but keeping the interface this narrow means the
 * broadcaster has no dependency on Express (or on anything
 * frontend-specific) and can be exercised in tests with a trivial fake
 * sink, no HTTP server required.
 */
export interface SseSink {
  write(chunk: string): void;
}

export interface EventBroadcaster {
  /** Registers a connected client so future `broadcast()` calls reach it. */
  subscribe(sink: SseSink): void;
  /** Removes a client (e.g. once its connection closes). Safe to call for a sink that was never or is no longer subscribed. */
  unsubscribe(sink: SseSink): void;
  /** Sends one update to every currently-subscribed client. */
  broadcast(update: ContractEventUpdate): void;
  /** Number of currently-subscribed clients. Mainly for tests/diagnostics. */
  clientCount(): number;
}

function toSseFrame(update: ContractEventUpdate): string {
  // A named `event:` line (rather than the default "message") lets a
  // client's EventSource listen with `addEventListener("contract-event", ...)`
  // if it wants to, without having to branch on `update.type` itself.
  return `event: contract-event\ndata: ${JSON.stringify(update)}\n\n`;
}

/**
 * Creates a fresh, isolated broadcaster with its own client set.
 * Deliberately a factory, not only a singleton — same reasoning as
 * `db/client.ts`'s `createDbClient`: tests need an isolated instance
 * that doesn't share state with other tests or with the process-wide
 * singleton below.
 */
export function createEventBroadcaster(): EventBroadcaster {
  const clients = new Set<SseSink>();

  return {
    subscribe(sink) {
      clients.add(sink);
    },
    unsubscribe(sink) {
      clients.delete(sink);
    },
    broadcast(update) {
      const frame = toSseFrame(update);
      for (const sink of clients) {
        try {
          sink.write(frame);
        } catch (err) {
          // A write failing means this client's connection is already
          // gone (or going). Drop it rather than letting one bad
          // client stop the update from reaching everyone else, and
          // rather than silently treating the failure as success.
          console.error("Failed to write an SSE update to a client; removing it:", err);
          clients.delete(sink);
        }
      }
    },
    clientCount() {
      return clients.size;
    },
  };
}

let singleton: EventBroadcaster | null = null;

/**
 * The process-wide broadcaster, created lazily on first use — same
 * lazy-singleton convention as `db/client.ts`'s `getDb()`. This is
 * what the real `/events/stream` route and `processContractEvent`
 * both use by default in the running app so they share one client
 * set; tests instead create isolated instances via
 * `createEventBroadcaster()` and inject them explicitly.
 */
export function getEventBroadcaster(): EventBroadcaster {
  if (!singleton) {
    singleton = createEventBroadcaster();
  }
  return singleton;
}
