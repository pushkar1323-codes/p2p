import { test } from "node:test";
import assert from "node:assert/strict";
import { contractEventUpdateToLoanRegistryEvent } from "./loanRegistryRealtime.ts";
import type { ContractEventUpdate } from "./types.ts";

const CONTRACT_ID = "CAKENBWT2237ASCTOZMFOMQTYWYRXQRMVX7N2OYGH67P7YMJFOD2L7YA";

function baseUpdate(overrides: Partial<ContractEventUpdate> = {}): ContractEventUpdate {
  return {
    type: "contract-event",
    transactionHash: "tx1",
    contractId: CONTRACT_ID,
    network: "testnet",
    eventType: "created",
    ledgerSequence: 100,
    payload: { loanId: 5, borrower: "GABCDE", amount: "1000" },
    occurredAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("converts a well-formed 'created' update into a LoanRegistryEvent", () => {
  const event = contractEventUpdateToLoanRegistryEvent(baseUpdate(), CONTRACT_ID);
  assert.deepEqual(event, { kind: "created", loanId: 5, borrower: "GABCDE", amount: BigInt(1000) });
});

test("converts a well-formed 'cancelled' update into a LoanRegistryEvent", () => {
  const event = contractEventUpdateToLoanRegistryEvent(
    baseUpdate({ eventType: "cancelled", payload: { loanId: 5, borrower: "GABCDE" } }),
    CONTRACT_ID,
  );
  assert.deepEqual(event, { kind: "cancelled", loanId: 5, borrower: "GABCDE" });
});

test("accepts a numeric (not string) amount for 'created'", () => {
  const event = contractEventUpdateToLoanRegistryEvent(
    baseUpdate({ payload: { loanId: 1, borrower: "GABCDE", amount: 250 } }),
    CONTRACT_ID,
  );
  assert.deepEqual(event, { kind: "created", loanId: 1, borrower: "GABCDE", amount: BigInt(250) });
});

test("returns null for an update from a different contract", () => {
  const event = contractEventUpdateToLoanRegistryEvent(baseUpdate(), "CSOMEOTHERCONTRACT");
  assert.equal(event, null);
});

test("returns null for an unrecognized eventType", () => {
  const event = contractEventUpdateToLoanRegistryEvent(baseUpdate({ eventType: "funded" }), CONTRACT_ID);
  assert.equal(event, null);
});

test("returns null when the payload is missing entirely", () => {
  const event = contractEventUpdateToLoanRegistryEvent(baseUpdate({ payload: null }), CONTRACT_ID);
  assert.equal(event, null);
});

test("returns null when the payload is not an object", () => {
  const event = contractEventUpdateToLoanRegistryEvent(baseUpdate({ payload: "not-an-object" }), CONTRACT_ID);
  assert.equal(event, null);
});

test("returns null when loanId is missing or not a non-negative integer", () => {
  assert.equal(
    contractEventUpdateToLoanRegistryEvent(baseUpdate({ payload: { borrower: "GABCDE", amount: "1" } }), CONTRACT_ID),
    null,
  );
  assert.equal(
    contractEventUpdateToLoanRegistryEvent(
      baseUpdate({ payload: { loanId: -1, borrower: "GABCDE", amount: "1" } }),
      CONTRACT_ID,
    ),
    null,
  );
  assert.equal(
    contractEventUpdateToLoanRegistryEvent(
      baseUpdate({ payload: { loanId: 1.5, borrower: "GABCDE", amount: "1" } }),
      CONTRACT_ID,
    ),
    null,
  );
});

test("returns null when borrower is missing or empty", () => {
  assert.equal(
    contractEventUpdateToLoanRegistryEvent(baseUpdate({ payload: { loanId: 1, amount: "1" } }), CONTRACT_ID),
    null,
  );
  assert.equal(
    contractEventUpdateToLoanRegistryEvent(
      baseUpdate({ payload: { loanId: 1, borrower: "  ", amount: "1" } }),
      CONTRACT_ID,
    ),
    null,
  );
});

test("returns null for a 'created' update with a missing or non-integer amount", () => {
  assert.equal(
    contractEventUpdateToLoanRegistryEvent(baseUpdate({ payload: { loanId: 1, borrower: "GABCDE" } }), CONTRACT_ID),
    null,
  );
  assert.equal(
    contractEventUpdateToLoanRegistryEvent(
      baseUpdate({ payload: { loanId: 1, borrower: "GABCDE", amount: "not-a-number" } }),
      CONTRACT_ID,
    ),
    null,
  );
  assert.equal(
    contractEventUpdateToLoanRegistryEvent(
      baseUpdate({ payload: { loanId: 1, borrower: "GABCDE", amount: "-5" } }),
      CONTRACT_ID,
    ),
    null,
  );
});
