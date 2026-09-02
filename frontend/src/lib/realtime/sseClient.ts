/**
 * Framework-agnostic Server-Sent Events client (L3-P05).
 *
 * Deliberately has no React import at all — same reasoning as
 * `hooks/contractWriteState.ts`: a plain function directly
 * unit-testable with `node:test`, no DOM/EventSource/React Testing
 * Library required. `useContractEventStream` (the thin React hook
 * that wraps this for the app) is what ties it to component
 * lifecycle; this module only knows about connecting, receiving
 * messages, and reconnecting.
 *
 * # Reconnection strategy
 * On a lost/failed connection, reconnects with exponential backoff
 * (`baseDelayMs * 2^attempt`, capped at `maxDelayMs`), up to
 * `maxReconnectAttempts` tries, then gives up and reports status
 * `"closed"` — the caller (and the rest of the app) must keep working
 * either way; this is a best-effort live-sync channel, not something
 * anything else depends on to function.
 *
 * # No duplicate connections
 * Each `createSseClient()` call owns exactly one underlying
 * connection at a time: a reconnect only ever runs after the previous
 * one has been closed, and `stop()` tears down whatever is currently
 * open (or scheduled) before marking the client stopped. Callers
 * (i.e. the hook) are expected to call this once per mount and
 * `stop()` once on unmount, not call it repeatedly without stopping
 * the previous instance first.
 *
 * # Console noise
 * At most one `console.error` is logged per lost-connection episode
 * (reset the moment the connection successfully reopens), not once
 * per retry attempt or per malformed message — a flaky connection
 * retrying five times must not print five errors.
 */

export type SseConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";

/**
 * The minimal structural subset of the browser's `EventSource` this
 * module needs. Not importing the real DOM type keeps this module
 * usable (and testable) outside a browser/jsdom environment.
 */
export interface EventSourceLike {
  close(): void;
  onopen: (() => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
}

export type EventSourceFactory = (url: string) => EventSourceLike;

export interface SseClientOptions<T> {
  url: string;
  /** Called with each successfully-parsed message. */
  onMessage: (data: T) => void;
  /** Called whenever the connection status changes. */
  onStatusChange?: (status: SseConnectionStatus) => void;
  /** Parses one message's raw `data` string. Defaults to `JSON.parse`. */
  parse?: (raw: string) => T;
  /** Defaults to the global `EventSource`. Inject a fake for tests. */
  createEventSource?: EventSourceFactory;
  /** Maximum reconnect attempts before giving up (status becomes "closed"). Default 5. */
  maxReconnectAttempts?: number;
  /** Base delay for exponential backoff, in ms. Default 1000. */
  baseDelayMs?: number;
  /** Cap on backoff delay, in ms. Default 30000. */
  maxDelayMs?: number;
  /** Injectable scheduler, for deterministic tests. Defaults to `setTimeout`. */
  scheduleTimeout?: (fn: () => void, delayMs: number) => unknown;
  /** Injectable canceller matching `scheduleTimeout`. Defaults to `clearTimeout`. */
  clearScheduledTimeout?: (handle: unknown) => void;
}

export interface SseClient {
  status(): SseConnectionStatus;
  /** Cancels any pending reconnect, closes the current connection (if any), and marks the client permanently stopped. Safe to call more than once. */
  stop(): void;
}

const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;

function defaultCreateEventSource(url: string): EventSourceLike {
  if (typeof EventSource === "undefined") {
    throw new Error("EventSource is not available in this environment.");
  }
  return new EventSource(url) as unknown as EventSourceLike;
}

export function createSseClient<T>(options: SseClientOptions<T>): SseClient {
  const {
    url,
    onMessage,
    onStatusChange,
    parse = (raw: string) => JSON.parse(raw) as T,
    createEventSource = defaultCreateEventSource,
    maxReconnectAttempts = DEFAULT_MAX_RECONNECT_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    scheduleTimeout = (fn, delayMs) => setTimeout(fn, delayMs),
    clearScheduledTimeout = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  } = options;

  let source: EventSourceLike | null = null;
  let status: SseConnectionStatus = "connecting";
  let attempts = 0;
  let pendingReconnect: unknown = null;
  let stopped = false;
  // Guards against logging more than once per lost-connection episode
  // (reset back to false on every successful open).
  let hasWarnedThisEpisode = false;

  function setStatus(next: SseConnectionStatus) {
    if (status === next) return;
    status = next;
    onStatusChange?.(next);
  }

  function connect() {
    if (stopped) return;
    setStatus(attempts === 0 ? "connecting" : "reconnecting");

    let es: EventSourceLike;
    try {
      es = createEventSource(url);
    } catch (err) {
      handleFailure(err);
      return;
    }
    source = es;

    es.onopen = () => {
      attempts = 0;
      hasWarnedThisEpisode = false;
      setStatus("open");
    };
    es.onmessage = (ev) => {
      try {
        onMessage(parse(ev.data));
      } catch (err) {
        // A single malformed message must not take the connection
        // down or spam the console.
        if (!hasWarnedThisEpisode) {
          console.error("Failed to parse a real-time update:", err);
          hasWarnedThisEpisode = true;
        }
      }
    };
    es.onerror = (err) => {
      handleFailure(err);
    };
  }

  function handleFailure(err: unknown) {
    if (stopped) return;
    source?.close();
    source = null;

    if (!hasWarnedThisEpisode) {
      console.error("Real-time connection lost:", err);
      hasWarnedThisEpisode = true;
    }

    if (attempts >= maxReconnectAttempts) {
      setStatus("closed");
      return;
    }

    const delay = Math.min(baseDelayMs * 2 ** attempts, maxDelayMs);
    attempts += 1;
    setStatus("reconnecting");
    pendingReconnect = scheduleTimeout(() => {
      pendingReconnect = null;
      connect();
    }, delay);
  }

  connect();

  return {
    status: () => status,
    stop() {
      if (stopped) return;
      stopped = true;
      if (pendingReconnect !== null) {
        clearScheduledTimeout(pendingReconnect);
        pendingReconnect = null;
      }
      source?.close();
      source = null;
      setStatus("closed");
    },
  };
}
