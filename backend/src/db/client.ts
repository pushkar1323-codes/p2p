import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.ts";
import { getDbEnv } from "../config/env.ts";

export type Database = NodePgDatabase<typeof schema>;

export interface DbClient {
  db: Database;
  pool: Pool;
  /** Closes the underlying connection pool. Call on shutdown/in tests. */
  close: () => Promise<void>;
}

/**
 * Creates a fresh database client. Takes an explicit connection string
 * when the caller wants to point at a specific database (tests), or
 * falls back to `getDbEnv().DATABASE_URL` (and the other `DB_*`
 * settings) when omitted.
 *
 * Deliberately a factory, not only a singleton: tests need their own
 * isolated client pointed at a test database without touching whatever
 * `DATABASE_URL` happens to be set in the environment.
 */
export function createDbClient(connectionString?: string): DbClient {
  const dbEnv = connectionString ? undefined : getDbEnv();
  const pool = new Pool({
    connectionString: connectionString ?? dbEnv!.DATABASE_URL,
    max: dbEnv?.DB_POOL_MAX,
    ssl: dbEnv?.DB_SSL ? { rejectUnauthorized: false } : undefined,
  });
  const db = drizzle(pool, { schema });

  return {
    db,
    pool,
    close: () => pool.end(),
  };
}

let singleton: DbClient | null = null;

/**
 * The process-wide database client, created lazily from `DATABASE_URL`
 * on first use. Nothing in the current application calls this yet — no
 * route/service uses the database — so importing this module has no
 * effect on app startup until something actually calls `getDb()`.
 */
export function getDb(): DbClient {
  if (!singleton) {
    singleton = createDbClient();
  }
  return singleton;
}
