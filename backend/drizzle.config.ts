import { defineConfig } from "drizzle-kit";

/**
 * Reads DATABASE_URL directly (not via `config/env.ts`'s `getDbEnv()`)
 * because drizzle-kit is a CLI tool that runs outside the application
 * process and shouldn't depend on app-specific validation wiring. A
 * placeholder is used for `generate` (which only needs the schema, not
 * a live connection); `migrate`/`push`/`studio` need a real
 * `DATABASE_URL` set in the environment.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://placeholder/placeholder",
  },
  strict: true,
  verbose: true,
});
