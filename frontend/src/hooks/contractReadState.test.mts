import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contractReadReducer,
  initialContractReadState,
} from "./contractReadState.ts";

test("initial state is idle with no data or error", () => {
  const state = initialContractReadState<number, { code: string }>();
  assert.equal(state.status, "idle");
  assert.equal(state.data, null);
  assert.equal(state.error, null);
});

test("FETCH_START moves to loading and clears any previous data/error", () => {
  const prior = { status: "error" as const, data: null, error: { code: "X" } };
  const next = contractReadReducer(prior, { type: "FETCH_START" });
  assert.equal(next.status, "loading");
  assert.equal(next.data, null);
  assert.equal(next.error, null);
});

test("FETCH_SUCCESS moves to loaded with the given data and clears error", () => {
  const prior = contractReadReducer(initialContractReadState<number, { code: string }>(), {
    type: "FETCH_START",
  });
  const next = contractReadReducer(prior, { type: "FETCH_SUCCESS", data: 42 });
  assert.equal(next.status, "loaded");
  assert.equal(next.data, 42);
  assert.equal(next.error, null);
});

test("FETCH_ERROR moves to error with the given error and clears data", () => {
  const prior = contractReadReducer(initialContractReadState<number, { code: string }>(), {
    type: "FETCH_START",
  });
  const next = contractReadReducer(prior, {
    type: "FETCH_ERROR",
    error: { code: "NETWORK_ERROR" },
  });
  assert.equal(next.status, "error");
  assert.equal(next.data, null);
  assert.deepEqual(next.error, { code: "NETWORK_ERROR" });
});

test("RESET returns to idle from any prior state", () => {
  const loaded = contractReadReducer(initialContractReadState<number, { code: string }>(), {
    type: "FETCH_SUCCESS",
    data: 7,
  });
  const next = contractReadReducer(loaded, { type: "RESET" });
  assert.equal(next.status, "idle");
  assert.equal(next.data, null);
  assert.equal(next.error, null);
});

test("a full loading -> success cycle transitions correctly at each step", () => {
  let state = initialContractReadState<number, { code: string }>();
  assert.equal(state.status, "idle");

  state = contractReadReducer(state, { type: "FETCH_START" });
  assert.equal(state.status, "loading");

  state = contractReadReducer(state, { type: "FETCH_SUCCESS", data: 5 });
  assert.equal(state.status, "loaded");
  assert.equal(state.data, 5);
});

test("a refresh (FETCH_START again) after a loaded state clears the old data while loading", () => {
  let state = contractReadReducer(initialContractReadState<number, { code: string }>(), {
    type: "FETCH_SUCCESS",
    data: 5,
  });
  state = contractReadReducer(state, { type: "FETCH_START" });
  assert.equal(state.status, "loading");
  // Old data is cleared rather than shown stale during a refresh.
  assert.equal(state.data, null);
});
