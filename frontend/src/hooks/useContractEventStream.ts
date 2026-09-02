"use client";

/**
 * useContractEventStream
 *
 * Connects to the backend's `/events/stream` SSE endpoint (L3-P05) for
 * the lifetime of the mounted component and exposes the connection
 * status plus the most recently received `ContractEventUpdate`.
 *
 * All actual connection/reconnection/parsing logic lives in the
 * framework-agnostic, directly-tested `createSseClient`
 * (`lib/realtime/sseClient.ts`) — this hook only wires that into
 * React's mount/unmount lifecycle: exactly one client is created per
 * mount (empty dependency array), and `stop()` is called on unmount so
 * the connection is always cleanly closed rather than left dangling.
 *
 * Consumers must not depend on this ever having data — the connection
 * is best-effort. `status` starts at `"connecting"` and, if the stream
 * is unreachable, eventually settles at `"closed"` after a bounded
 * number of retries (see `sseClient.ts`); the rest of the app must
 * keep working either way.
 */

import { useEffect, useState } from "react";
import { createSseClient, type SseConnectionStatus } from "@/lib/realtime/sseClient";
import { eventsStreamUrl } from "@/config/backend";
import type { ContractEventUpdate } from "@/lib/realtime/types";

export interface UseContractEventStreamResult {
  status: SseConnectionStatus;
  /** The most recently received update, or `null` until the first one arrives. */
  lastUpdate: ContractEventUpdate | null;
}

export function useContractEventStream(): UseContractEventStreamResult {
  const [status, setStatus] = useState<SseConnectionStatus>("connecting");
  const [lastUpdate, setLastUpdate] = useState<ContractEventUpdate | null>(null);

  useEffect(() => {
    const client = createSseClient<ContractEventUpdate>({
      url: eventsStreamUrl(),
      onMessage: setLastUpdate,
      onStatusChange: setStatus,
    });
    return () => client.stop();
  }, []);

  return { status, lastUpdate };
}
