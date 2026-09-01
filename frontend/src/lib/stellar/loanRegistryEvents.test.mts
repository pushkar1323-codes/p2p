import { test } from "node:test";
import assert from "node:assert/strict";
import { xdr, nativeToScVal, Address, StrKey } from "@stellar/stellar-sdk";
import { extractLoanRegistryEvents } from "./loanRegistryEvents.ts";

const CONTRACT_ID = "CAKENBWT2237ASCTOZMFOMQTYWYRXQRMVX7N2OYGH67P7YMJFOD2L7YA";
const OTHER_CONTRACT_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const BORROWER = "GCCIWTVKZXF4UBD4HOBDUWFQVEFHLH53DL54SUYAQLMYWKHUXTXBCTMF";

/**
 * These fixtures are built with the real `@stellar/stellar-sdk` XDR
 * constructors and round-tripped through actual `toXDR`/`fromXDR`
 * (base64) — the same encode/decode path a live RPC response goes
 * through — rather than hand-rolled mock objects, so a shape mismatch
 * with the real SDK would fail these tests rather than silently pass.
 */
function buildContractEvent(contractId: string, topics: xdr.ScVal[], data: xdr.ScVal): xdr.ContractEvent {
  return new xdr.ContractEvent({
    ext: xdr.ExtensionPoint.v0(),
    contractId: xdr.ContractId.fromXdrObject(StrKey.decodeContract(contractId)),
    type: xdr.ContractEventType.contract,
    body: xdr.ContractEventBody.v0(new xdr.ContractEventV0({ topics, data })),
  });
}

function metaV3WithEvents(events: xdr.ContractEvent[]): xdr.TransactionMeta {
  const sorobanMeta = new xdr.SorobanTransactionMeta({
    ext: xdr.SorobanTransactionMetaExt.v0(),
    events,
    returnValue: nativeToScVal(1, { type: "u64" }),
    diagnosticEvents: [],
  });
  const v3 = new xdr.TransactionMetaV3({
    ext: xdr.ExtensionPoint.v0(),
    txChangesBefore: [],
    operations: [],
    txChangesAfter: [],
    sorobanMeta,
  });
  // Round-trip through real base64 XDR, matching what getTransaction()
  // actually returns, rather than trusting the in-memory object as-is.
  return xdr.TransactionMeta.fromXDR(xdr.TransactionMeta.v3(v3).toXDR("base64"), "base64");
}

function metaV4WithEvents(events: xdr.ContractEvent[]): xdr.TransactionMeta {
  const v4 = new xdr.TransactionMetaV4({
    ext: xdr.ExtensionPoint.v0(),
    txChangesBefore: [],
    operations: [new xdr.OperationMetaV2({ ext: xdr.ExtensionPoint.v0(), changes: [], events })],
    txChangesAfter: [],
    sorobanMeta: new xdr.SorobanTransactionMetaV2({ ext: xdr.SorobanTransactionMetaExt.v0(), returnValue: null }),
    events: [],
    diagnosticEvents: [],
  });
  return xdr.TransactionMeta.fromXDR(xdr.TransactionMeta.v4(v4).toXDR("base64"), "base64");
}

function createdEvent(contractId: string, loanId: number, amount: bigint) {
  return buildContractEvent(
    contractId,
    [nativeToScVal("created", { type: "symbol" }), new Address(BORROWER).toScVal()],
    nativeToScVal([nativeToScVal(loanId, { type: "u64" }), nativeToScVal(amount, { type: "i128" })])
  );
}

function cancelledEvent(contractId: string, loanId: number) {
  return buildContractEvent(
    contractId,
    [nativeToScVal("cancelled", { type: "symbol" }), new Address(BORROWER).toScVal()],
    nativeToScVal(loanId, { type: "u64" })
  );
}

// --- v3 meta shape ------------------------------------------------

test("extracts a created event from v3 meta with loan id, borrower and amount", () => {
  const meta = metaV3WithEvents([createdEvent(CONTRACT_ID, 5, BigInt(1000))]);
  const events = extractLoanRegistryEvents(meta, CONTRACT_ID);
  assert.deepEqual(events, [{ kind: "created", loanId: 5, borrower: BORROWER, amount: BigInt(1000) }]);
});

test("extracts a cancelled event from v3 meta with loan id and borrower", () => {
  const meta = metaV3WithEvents([cancelledEvent(CONTRACT_ID, 7)]);
  const events = extractLoanRegistryEvents(meta, CONTRACT_ID);
  assert.deepEqual(events, [{ kind: "cancelled", loanId: 7, borrower: BORROWER }]);
});

test("v3 meta with no sorobanMeta yields no events, without throwing", () => {
  const v3 = new xdr.TransactionMetaV3({
    ext: xdr.ExtensionPoint.v0(),
    txChangesBefore: [],
    operations: [],
    txChangesAfter: [],
    sorobanMeta: null,
  });
  const meta = xdr.TransactionMeta.v3(v3);
  assert.deepEqual(extractLoanRegistryEvents(meta, CONTRACT_ID), []);
});

// --- v4 meta shape (events live under operations[].events) --------

test("extracts a cancelled event from v4 meta (per-operation events)", () => {
  const meta = metaV4WithEvents([cancelledEvent(CONTRACT_ID, 12)]);
  const events = extractLoanRegistryEvents(meta, CONTRACT_ID);
  assert.deepEqual(events, [{ kind: "cancelled", loanId: 12, borrower: BORROWER }]);
});

// --- filtering ------------------------------------------------------

test("ignores events from a different contract id", () => {
  const meta = metaV3WithEvents([createdEvent(OTHER_CONTRACT_ID, 1, BigInt(500))]);
  assert.deepEqual(extractLoanRegistryEvents(meta, CONTRACT_ID), []);
});

test("ignores an event with an unrecognized topic name", () => {
  const event = buildContractEvent(
    CONTRACT_ID,
    [nativeToScVal("funded", { type: "symbol" }), new Address(BORROWER).toScVal()],
    nativeToScVal(1, { type: "u64" })
  );
  const meta = metaV3WithEvents([event]);
  assert.deepEqual(extractLoanRegistryEvents(meta, CONTRACT_ID), []);
});

test("ignores a malformed created event (wrong data arity)", () => {
  const event = buildContractEvent(
    CONTRACT_ID,
    [nativeToScVal("created", { type: "symbol" }), new Address(BORROWER).toScVal()],
    nativeToScVal(1, { type: "u64" }) // should be a (loan_id, amount) pair, not a scalar
  );
  const meta = metaV3WithEvents([event]);
  assert.deepEqual(extractLoanRegistryEvents(meta, CONTRACT_ID), []);
});

test("returns multiple events in order when more than one is present", () => {
  const meta = metaV3WithEvents([createdEvent(CONTRACT_ID, 1, BigInt(100)), cancelledEvent(CONTRACT_ID, 1)]);
  const events = extractLoanRegistryEvents(meta, CONTRACT_ID);
  assert.equal(events.length, 2);
  assert.equal(events[0].kind, "created");
  assert.equal(events[1].kind, "cancelled");
});
