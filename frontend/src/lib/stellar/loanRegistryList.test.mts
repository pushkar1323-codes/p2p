import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loanIdsToFetch,
  aggregateLoanListResults,
  filterLoansByBorrower,
  MAX_LOANS_TO_LIST,
} from "./loanRegistryList.ts";
import type { LoanRequest } from "./loanRegistry.ts";

function loan(loanId: number, borrower: string, status: LoanRequest["status"] = "Open"): LoanRequest {
  return { loanId, borrower, amount: BigInt(100), status };
}

// --- loanIdsToFetch ---------------------------------------------------------

test("loanIdsToFetch returns [] for a zero or negative count", () => {
  assert.deepEqual(loanIdsToFetch(0), []);
  assert.deepEqual(loanIdsToFetch(-5), []);
});

test("loanIdsToFetch returns [] for a non-finite count", () => {
  assert.deepEqual(loanIdsToFetch(NaN), []);
  assert.deepEqual(loanIdsToFetch(Infinity), []);
});

test("loanIdsToFetch returns the full 1-based range, newest first, when under the cap", () => {
  assert.deepEqual(loanIdsToFetch(1), [1]);
  assert.deepEqual(loanIdsToFetch(5), [5, 4, 3, 2, 1]);
});

test("loanIdsToFetch truncates a fractional count", () => {
  assert.deepEqual(loanIdsToFetch(3.9), [3, 2, 1]);
});

test("loanIdsToFetch caps at max, keeping the newest ids", () => {
  assert.deepEqual(loanIdsToFetch(10, 3), [10, 9, 8]);
});

test("loanIdsToFetch defaults its cap to MAX_LOANS_TO_LIST", () => {
  const ids = loanIdsToFetch(MAX_LOANS_TO_LIST + 50);
  assert.equal(ids.length, MAX_LOANS_TO_LIST);
  assert.equal(ids[0], MAX_LOANS_TO_LIST + 50);
  assert.equal(ids[ids.length - 1], 51);
});

// --- aggregateLoanListResults ------------------------------------------------

test("aggregateLoanListResults returns all loans when every read succeeds", () => {
  const ids = [3, 2, 1];
  const results: PromiseSettledResult<LoanRequest>[] = [
    { status: "fulfilled", value: loan(3, "GBORROWER3") },
    { status: "fulfilled", value: loan(2, "GBORROWER2") },
    { status: "fulfilled", value: loan(1, "GBORROWER1") },
  ];
  const outcome = aggregateLoanListResults(ids, results);
  assert.deepEqual(outcome.failedIds, []);
  assert.equal(outcome.loans.length, 3);
  assert.deepEqual(outcome.loans.map((l) => l.loanId), [3, 2, 1]);
});

test("aggregateLoanListResults collects failed ids without dropping successful ones", () => {
  const ids = [3, 2, 1];
  const results: PromiseSettledResult<LoanRequest>[] = [
    { status: "fulfilled", value: loan(3, "GBORROWER3") },
    { status: "rejected", reason: { code: "NETWORK_ERROR", message: "boom" } },
    { status: "fulfilled", value: loan(1, "GBORROWER1") },
  ];
  const outcome = aggregateLoanListResults(ids, results);
  assert.deepEqual(outcome.failedIds, [2]);
  assert.deepEqual(outcome.loans.map((l) => l.loanId), [3, 1]);
});

test("aggregateLoanListResults handles an empty input", () => {
  const outcome = aggregateLoanListResults([], []);
  assert.deepEqual(outcome, { loans: [], failedIds: [] });
});

// --- filterLoansByBorrower ---------------------------------------------------

test("filterLoansByBorrower keeps only loans created by the given address", () => {
  const loans = [loan(1, "GALICE"), loan(2, "GBOB"), loan(3, "GALICE")];
  const result = filterLoansByBorrower(loans, "GALICE");
  assert.deepEqual(result.map((l) => l.loanId), [1, 3]);
});

test("filterLoansByBorrower returns [] when address is null", () => {
  const loans = [loan(1, "GALICE")];
  assert.deepEqual(filterLoansByBorrower(loans, null), []);
});

test("filterLoansByBorrower returns [] when nothing matches", () => {
  const loans = [loan(1, "GALICE")];
  assert.deepEqual(filterLoansByBorrower(loans, "GCAROL"), []);
});
