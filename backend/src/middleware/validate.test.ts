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
