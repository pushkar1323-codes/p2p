import { z } from "zod";

/**
 * Every environment variable the backend reads, validated once at
 * startup. Keeps configuration centralized and typed rather than reading
 * `process.env.X` ad hoc throughout the codebase — the same approach the
 * frontend takes in `frontend/src/config/stellar.ts`.
 *
 * Intentionally minimal for this foundation task: no database, queue, or
 * external-service configuration yet. Those are introduced only when the
 * task that needs them actually adds them (e.g. `DATABASE_URL` when
 * PostgreSQL is added).
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
