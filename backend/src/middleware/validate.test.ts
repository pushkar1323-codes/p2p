import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { validate } from "./validate.ts";
import { AppError } from "../errors/AppError.ts";

const dummySchema = z.object({
  amount: z.coerce.number().positive(),
});

function fakeReq(body: unknown): Request {
  return { body } as unknown as Request;
}

function fakeRes(): Response {
  return {} as Response;
}

function capturingNext(): { next: NextFunction; calls: unknown[] } {
  const calls: unknown[] = [];
  const next = ((arg?: unknown) => {
    calls.push(arg);
  }) as NextFunction;
  return { next, calls };
}

test("validate() calls next() with no argument and replaces req.body on success", () => {
  const req = fakeReq({ amount: "10" });
  const { next, calls } = capturingNext();

  validate("body", dummySchema)(req, fakeRes(), next);

  assert.equal(calls.length, 1);
  assert.equal(calls[0], undefined);
  // req.body is replaced with the parsed/coerced value.
  assert.deepEqual(req.body, { amount: 10 });
});

test("validate() calls next(AppError) with a 422 and per-field details on failure", () => {
  const req = fakeReq({ amount: -5 });
  const { next, calls } = capturingNext();

  validate("body", dummySchema)(req, fakeRes(), next);

  assert.equal(calls.length, 1);
  const err = calls[0];
  assert.ok(err instanceof AppError);
  assert.equal(err.statusCode, 422);
  assert.equal(err.code, "VALIDATION_ERROR");
  assert.ok(Array.isArray(err.details));
  assert.equal((err.details as unknown[]).length, 1);
});

test("validate() rejects a missing required field", () => {
  const req = fakeReq({});
  const { next, calls } = capturingNext();

  validate("body", dummySchema)(req, fakeRes(), next);

  const err = calls[0];
  assert.ok(err instanceof AppError);
  assert.equal(err.statusCode, 422);
});

// ---------------------------------------------------------------------
// Express 5 regression: req.query is a getter-only accessor (computed
// from the parsed URL) on a real Express/Node request, with no setter —
// a plain `req.query = result.data` throws
// "TypeError: Cannot set property query of #<IncomingMessage> which has
// only a getter". The `fakeReq()` helper above uses a plain object,
// whose `body`/`query` properties are ordinary writable properties, so
// it can never reproduce this — these tests build a `req` whose `query`
// is specifically a getter-only accessor (same shape Express 5 uses,
// including `configurable: true`) to prove the fix actually works
// against that shape, not just against a plain object.
// ---------------------------------------------------------------------

function fakeReqWithGetterOnlyQuery(query: unknown): Request {
  const req = {} as Request;
  Object.defineProperty(req, "query", {
    get: () => query,
    configurable: true,
    enumerable: true,
  });
  return req;
}

const querySchema = z.object({
  limit: z.coerce.number().optional(),
  contractId: z.string().optional(),
});

test("validate('query', ...) does not throw when req.query is a getter-only accessor (Express 5)", () => {
  const req = fakeReqWithGetterOnlyQuery({ limit: "5" });
  const { next, calls } = capturingNext();

  assert.doesNotThrow(() => validate("query", querySchema)(req, fakeRes(), next));

  assert.equal(calls.length, 1);
  assert.equal(calls[0], undefined);
});

test("validate('query', ...) actually replaces a getter-only req.query with the parsed/coerced value", () => {
  const req = fakeReqWithGetterOnlyQuery({ limit: "5", contractId: "CTEST" });
  const { next } = capturingNext();

  validate("query", querySchema)(req, fakeRes(), next);

  // Confirms the override actually took effect (not just "didn't
  // throw") — req.query must now read back the parsed value, with
  // `limit` coerced from the string "5" to the number 5.
  assert.deepEqual(req.query, { limit: 5, contractId: "CTEST" });
});

test("validate('query', ...) still reports validation failures when req.query is a getter-only accessor", () => {
  const req = fakeReqWithGetterOnlyQuery({ limit: "not-a-number" });
  const { next, calls } = capturingNext();

  validate("query", querySchema)(req, fakeRes(), next);

  const err = calls[0];
  assert.ok(err instanceof AppError);
  assert.equal(err.statusCode, 422);
});
