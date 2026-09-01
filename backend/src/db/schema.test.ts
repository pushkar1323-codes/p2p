import { test } from "node:test";
import assert from "node:assert/strict";
import { getTableColumns, getTableName } from "drizzle-orm";
import { blockchainTransactions, contractEvents } from "./schema.ts";

test("blockchainTransactions maps to the blockchain_transactions table", () => {
  assert.equal(getTableName(blockchainTransactions), "blockchain_transactions");
});

test("blockchainTransactions has exactly the required columns", () => {
  const columns = Object.keys(getTableColumns(blockchainTransactions)).sort();
  assert.deepEqual(columns, [
    "actionType",
    "confirmedAt",
    "contractId",
    "createdAt",
    "errorCode",
    "errorMessage",
    "id",
    "network",
    "status",
    "transactionHash",
  ].sort());
});

test("blockchainTransactions.transactionHash is required (not nullable)", () => {
  const columns = getTableColumns(blockchainTransactions);
  assert.equal(columns.transactionHash.notNull, true);
});

test("blockchainTransactions.status is required and constrained to the known lifecycle values", () => {
  const columns = getTableColumns(blockchainTransactions);
  assert.equal(columns.status.notNull, true);
  // enumValues is populated for pg-core text(..., { enum: [...] }) columns.
  assert.deepEqual(columns.status.enumValues, [
    "pending",
    "submitted",
    "confirmed",
    "failed",
    "rejected",
  ]);
});

test("blockchainTransactions optional/nullable columns are not required", () => {
  const columns = getTableColumns(blockchainTransactions);
  for (const key of [
    "actionType",
    "contractId",
    "confirmedAt",
    "errorCode",
    "errorMessage",
  ] as const) {
    assert.equal(columns[key].notNull, false, `${key} should be nullable`);
  }
});

test("contractEvents maps to the contract_events table", () => {
  assert.equal(getTableName(contractEvents), "contract_events");
});

test("contractEvents has exactly the required columns", () => {
  const columns = Object.keys(getTableColumns(contractEvents)).sort();
  assert.deepEqual(columns, [
    "contractId",
    "createdAt",
    "eventType",
    "id",
    "ledgerSequence",
    "network",
    "payload",
    "transactionHash",
  ].sort());
});

test("contractEvents required fields (transactionHash, contractId, network, eventType) are not nullable", () => {
  const columns = getTableColumns(contractEvents);
  for (const key of [
    "transactionHash",
    "contractId",
    "network",
    "eventType",
  ] as const) {
    assert.equal(columns[key].notNull, true, `${key} should be required`);
  }
});

test("contractEvents.ledgerSequence and payload are nullable (not every event has them yet)", () => {
  const columns = getTableColumns(contractEvents);
  assert.equal(columns.ledgerSequence.notNull, false);
  assert.equal(columns.payload.notNull, false);
});
