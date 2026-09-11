/**
 * Bounded post-registration retry policy: call `refresh` once; if it
 * still resolves `false`, wait `delayMs` and call it exactly one more
 * time, then stop. Used by `LoanRequestActions.tsx` right after a
 * `RegisterWalletAction` registration attempt (success or failure —
 * see that component's own comment on why `onRegistered` fires
 * either way).
 *
 * Exists for one specific, real, non-bug scenario: brief
 * read-after-write lag on a public Testnet RPC endpoint immediately
 * after ledger close, right after a write the app itself already
 * treated as genuinely confirmed (see `eligibilityRegistry.ts`'s
 * `register()` — it requires `resolveConfirmedTxHash`/
 * `resolveOkResult` to both agree before resolving at all, not merely
 * "signed" or "submitted"). Deliberately bounded to exactly one
 * retry: unbounded/repeated retrying here would instead quietly mask
 * a real configuration problem (e.g. the app pointed at a different
 * Eligibility Registry deployment than the one just written to) as if
 * it were merely slow.
 *
 * Deliberately kept in its own file with zero imports (no React, no
 * `@/` aliases, no `@stellar/stellar-sdk`): this project's test
 * script (`node --test`) resolves plain relative imports directly
 * against the filesystem, with no bundler and no `@/` alias/`paths`
 * support — pulling in `useIsBorrowerEligible.ts` (which imports
 * `eligibilityRegistry.ts`, which imports `@stellar/stellar-sdk` via
 * an `@/` alias) from a test file breaks module resolution outright
 * (confirmed: `ERR_MODULE_NOT_FOUND` for `@stellar/stellar-sdk`,
 * which then cascades into unrelated test files failing too, since
 * `node --test` collects/runs files in the same process). This file
 * has no such dependency, so it can be imported directly by both
 * `useIsBorrowerEligible.ts` (for the real hook) and this file's own
 * test (`eligibilityRegistrationFlow.test.mts`, using `node:test`'s
 * built-in fake timers).
 */
export async function retryEligibilityRefreshOnce(
  refresh: () => Promise<boolean>,
  delayMs = 1500
): Promise<void> {
  const eligibleNow = await refresh();
  if (eligibleNow) return;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  await refresh();
}
