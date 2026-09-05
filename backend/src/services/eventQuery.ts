import { and, desc, eq, lt, type SQL } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { getDb } from "../db/client.ts";
import { contractEvents } from "../db/schema.ts";

/** Default rows returned when `limit` isn't specified. */
export const DEFAULT_EVENT_QUERY_LIMIT = 50;
/** Hard ceiling on rows returned in one call, regardless of what's requested. */
export const MAX_EVENT_QUERY_LIMIT = 100;

export interface EventQueryFilters {
  contractId?: string;
  eventType?: string;
  network?: string;
  /** Requested row limit — clamped into `[1, MAX_EVENT_QUERY_LIMIT]` by `resolveEventQueryLimit`. */
  limit?: number;
  /** Pagination cursor: only rows with `id` strictly less than this (rows are newest-`id`-first). */
  beforeId?: number;
}

export interface QueriedContractEvent {
  id: number;
  transactionHash: string;
  contractId: string;
  network: string;
  eventType: string;
  ledgerSequence: number | null;
  payload: unknown;
  createdAt: Date;
}

/**
 * Clamps an arbitrary requested limit into `[1, MAX_EVENT_QUERY_LIMIT]`,
 * defaulting to `DEFAULT_EVENT_QUERY_LIMIT` when absent or not a finite
 * number. Pure — extracted so the clamping rule itself is directly
 * unit-testable without a database, same reasoning as
 * `contractReadState.ts`/`loanRegistryList.ts` on the frontend.
 */
export function resolveEventQueryLimit(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_EVENT_QUERY_LIMIT;
  return Math.min(MAX_EVENT_QUERY_LIMIT, Math.max(1, Math.trunc(requested)));
}

/**
 * Reads persisted contract events (`contract_events`), newest first,
 * optionally filtered by `contractId`/`eventType`/`network` and
 * paginated via `beforeId`. This is the query side of the same table
 * `processContractEvent` (`eventProcessing.ts`) writes to — the
 * "minimal real backend history API" FCP-03 asks for, over data that
 * was genuinely persisted, not synthesized here.
 */
export async function queryContractEvents(
  filters: EventQueryFilters,
  db?: Database,
): Promise<QueriedContractEvent[]> {
  const database = db ?? getDb().db;
  const limit = resolveEventQueryLimit(filters.limit);

  const conditions: SQL[] = [];
  if (filters.contractId) conditions.push(eq(contractEvents.contractId, filters.contractId));
  if (filters.eventType) conditions.push(eq(contractEvents.eventType, filters.eventType));
  if (filters.network) conditions.push(eq(contractEvents.network, filters.network));
  if (filters.beforeId !== undefined) conditions.push(lt(contractEvents.id, filters.beforeId));

  return database
    .select()
    .from(contractEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(contractEvents.id))
    .limit(limit);
}
