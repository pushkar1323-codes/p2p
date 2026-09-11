/**
 * Resolves one required config value.
 *
 * Takes the already-looked-up `value` rather than looking it up
 * itself from `name` — this is not just a style choice, it's required
 * for `stellar.ts`'s config values to work in the browser at all.
 * Next.js/Turbopack inlines `NEXT_PUBLIC_*` variables into the client
 * bundle via static text substitution of the literal expression
 * `process.env.NEXT_PUBLIC_X`; it cannot do this for a *dynamic*
 * lookup like `process.env[name]`, since `name` is only known at
 * runtime. A previous version of this function took just `name` and
 * did `process.env[name]` internally — that compiled and worked
 * during SSR/`next build`'s prerender (where `process.env` is Node's
 * real, fully-populated environment object), but silently broke in
 * the actual browser: Turbopack's client polyfill for `process.env`
 * is an empty object for anything it couldn't statically inline, so
 * every dynamic lookup resolved to `undefined` there, regardless of
 * what `.env.local` actually contained — confirmed directly against a
 * real headless-browser bundle for this exact project. Every call
 * site in `stellar.ts` now passes its own literal
 * `process.env.NEXT_PUBLIC_X` expression so Turbopack can see and
 * inline each one individually.
 *
 * Kept in its own file, with no imports and no `process.env` access
 * of its own, specifically so it's directly unit-testable under this
 * project's plain `node --test` runner — `stellar.ts` itself can't be
 * imported from a bare test environment with no env vars set without
 * throwing at module-load time (see `stellarConfig`'s eager
 * computation), the same reason `eligibilityRetry.ts` exists as its
 * own file elsewhere in this project.
 */
export function requireEnv(name: string, value: string | undefined, fallback?: string): string {
  const resolved = value ?? fallback;
  if (!resolved) {
    throw new Error(
      `Missing required environment variable: ${name}. Check your .env file against .env.example.`
    );
  }
  return resolved;
}
