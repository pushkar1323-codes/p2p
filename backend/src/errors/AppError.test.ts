import { test } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "./AppError.ts";

test("AppError carries the status code, code, message, and details given to its constructor", () => {
  const err = new AppError(418, "TEAPOT", "I'm a teapot.", { pot: true });
  assert.equal(err.statusCode, 418);
  assert.equal(err.code, "TEAPOT");
  assert.equal(err.message, "I'm a teapot.");
  assert.deepEqual(err.details, { pot: true });
  assert.ok(err instanceof Error);
});

test("AppError.badRequest produces a 400 BAD_REQUEST", () => {
  const err = AppError.badRequest("bad input");
  assert.equal(err.statusCode, 400);
  assert.equal(err.code, "BAD_REQUEST");
  assert.equal(err.message, "bad input");
});

test("AppError.validationFailed produces a 422 VALIDATION_ERROR with details", () => {
  const details = [{ path: "amount", message: "must be positive" }];
  const err = AppError.validationFailed("invalid request body", details);
  assert.equal(err.statusCode, 422);
  assert.equal(err.code, "VALIDATION_ERROR");
  assert.deepEqual(err.details, details);
});

test("AppError.notFound produces a 404 NOT_FOUND with no details", () => {
  const err = AppError.notFound("no such thing");
  assert.equal(err.statusCode, 404);
  assert.equal(err.code, "NOT_FOUND");
  assert.equal(err.details, undefined);
});
