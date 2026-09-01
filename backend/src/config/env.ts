import { z } from "zod";

/**
 * Application-level environment variables (not database-related — see
 * `dbEnvSchema`/`getDbEnv` below), validated once at startup. Keeps
 * configuration centralized and typed rather than reading
 * `process.env.X` ad hoc throughout the codebase — the same approach the
 * frontend takes in `frontend/src/config/stellar.ts`.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parses and validates a raw environment-like object. Exported
 * separately from the module-level `env` singleton so tests can validate
 * specific inputs (including invalid ones) without mutating
 * `process.env`.
 */
export function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return result.data;
}

/**
 * The validated configuration for the current process. Reading this
 * (rather than `process.env` directly) anywhere else in the backend
 * guarantees a typed, already-validated value.
 */
export const env: Env = parseEnv(process.env);

/**
 * Database configuration. Kept separate from `env` above and validated
 * lazily (only when `getDbEnv()` is actually called, i.e. only when
 * something imports `db/client.ts`) rather than eagerly at process
 * startup.
 *
 * This is deliberate: no route currently uses the database (this is an
 * infrastructure-only foundation — see `db/schema.ts`), so requiring
 * `DATABASE_URL` at import time would force every existing test, and
 * `npm run dev`, to have a Postgres connection string configured for
 * functionality that doesn't use it yet. Once a real route/service
 * starts using the database, its own startup path calling `getDbEnv()`
 * (via `getDb()`) will validate this and fail fast then.
 */
const dbEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "DATABASE_URL must be a postgres:// or postgresql:// connection string",
    ),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_SSL: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type DbEnv = z.infer<typeof dbEnvSchema>;

/** Parses and validates a raw environment-like object for database config. */
export function parseDbEnv(raw: NodeJS.ProcessEnv): DbEnv {
  const result = dbEnvSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid database configuration: ${issues}`);
  }
  return result.data;
}

let cachedDbEnv: DbEnv | null = null;

/**
 * Returns the validated database configuration, parsing it from
 * `process.env` on first call and caching the result. Throws the same
 * kind of descriptive error as `parseEnv` if `DATABASE_URL` is missing
 * or malformed.
 */
export function getDbEnv(): DbEnv {
  if (!cachedDbEnv) {
    cachedDbEnv = parseDbEnv(process.env);
  }
  return cachedDbEnv;
}
