/**
 * Loan listing: pure helpers (FCP-02).
 *
 * `loan_registry` has no batch-read entrypoint — only
 * `get_loan_count()` and `get_loan_request(loan_id)` for one id at a
 * time (L2-P05). "Browse Loans"/"My Loans" are therefore a real
 * client-side scan: read the count, then read every id in
 * `1..=count` (loan ids are 1-based — `create_loan_request` sets
 * `next_loan_id = loan_count + 1` starting from `loan_count = 0`, see
 * `contracts/loan_registry/src/lib.rs`). This is not a stand-in for a
 * future backend index (see `docs/CURRENT_STATUS.md`'s FCP audit —
 * no such index/query endpoint exists yet); it is the genuine,
 * honest way to list "all loans" using only what's actually deployed
 * today.
 *
 * Kept framework/SDK-free (no `@stellar/stellar-sdk`, no React) so
 * the id-range and result-aggregation logic can be unit tested
 * directly — same established pattern as `contractReadState.ts`. The
 * actual async fetching lives in `hooks/useLoanRegistryList.ts`.
 */

import type { LoanRequest } from "./loanRegistry";

/**
 * Upper bound on how many individual `get_loan_request` reads Browse
 * Loans/My Loans will issue for one load, regardless of how large
 * `get_loan_count()` reports. Protects against a very large count
 * turning one page load into an unbounded number of RPC calls; the
 * most *recent* loans are kept (highest ids), since those are the
 * ones a marketplace view is most useful for.
 */
export const MAX_LOANS_TO_LIST = 200;

/**
 * The 1-based loan ids to fetch for a given `get_loan_count()`
 * result, newest-first (highest id first) and capped at `max`.
 * Returns `[]` for a non-positive/non-finite count.
 */
export function loanIdsToFetch(count: number, max: number = MAX_LOANS_TO_LIST): number[] {
  if (!Number.isFinite(count) || count <= 0) return [];
  const total = Math.max(0, Math.min(Math.trunc(count), Math.trunc(max)));
  const highestId = Math.trunc(count);
  const ids: number[] = [];
  for (let id = highestId; id > highestId - total; id--) {
    ids.push(id);
  }
  return ids;
}

export interface LoanListOutcome {
  /** Loans that were successfully read, in the order `ids` was fetched (newest-first). */
  loans: LoanRequest[];
  /**
   * Ids that were requested but individually failed to load — a soft,
   * partial failure. The rest of the list is still shown; the caller
   * is expected to surface this honestly (e.g. "3 loans could not be
   * loaded") rather than silently dropping them or failing the whole
   * list over a handful of bad reads.
   */
  failedIds: number[];
}

/**
 * Combines the `ids` a list load requested with the
 * `PromiseSettledResult`s of fetching each one (via
 * `Promise.allSettled`) into a `LoanListOutcome`. Pure — takes the
 * settled results rather than performing the fetch itself, so this
 * can be tested with plain arrays.
 */
export function aggregateLoanListResults(
  ids: number[],
  results: PromiseSettledResult<LoanRequest>[]
): LoanListOutcome {
  const loans: LoanRequest[] = [];
  const failedIds: number[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      loans.push(result.value);
    } else {
      failedIds.push(ids[index]);
    }
  });
  return { loans, failedIds };
}

/**
 * Loans created by `address` — the entire "My Loans" filter. A plain
 * `Array.prototype.filter`, extracted as its own pure function only
 * so it has one obvious place to test and reuse, rather than being
 * duplicated inline.
 */
export function filterLoansByBorrower(loans: LoanRequest[], address: string | null): LoanRequest[] {
  if (!address) return [];
  return loans.filter((loan) => loan.borrower === address);
}
