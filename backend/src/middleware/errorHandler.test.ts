import { test } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { errorHandler, notFoundHandler } from "./errorHandler.ts";
import { AppError } from "../errors/AppError.ts";

test("errorHandler responds with an AppError's own status/code/message/details", () => {
  const captured: { status?: number; body?: unknown } = {};
  const trackingRes = {
    status(code: number) {
      captured.status = code;
      return trackingRes;
    },
    json(payload: unknown) {
      captured.body = payload;
      return trackingRes;
    },
  } as unknown as Response;

  const err = AppError.validationFailed("bad input", [{ path: "x", message: "required" }]);
  errorHandler(err, {} as Request, trackingRes, (() => {}) as NextFunction);

  assert.equal(captured.status, 422);
  assert.deepEqual(captured.body, {
    error: {
      code: "VALIDATION_ERROR",
      message: "bad input",
      details: [{ path: "x", message: "required" }],
    },
  });
});

test("errorHandler responds with a generic safe 500 for a non-AppError, without leaking its message", () => {
  const captured: { status?: number; body?: unknown } = {};
  const trackingRes = {
    status(code: number) {
      captured.status = code;
      return trackingRes;
    },
    json(payload: unknown) {
      captured.body = payload;
      return trackingRes;
    },
  } as unknown as Response;

  const originalError = new Error("leaked internal detail: db password xyz");
  errorHandler(originalError, {} as Request, trackingRes, (() => {}) as NextFunction);

  assert.equal(captured.status, 500);
  const body = captured.body as { error: { code: string; message: string } };
  assert.equal(body.error.code, "INTERNAL_ERROR");
  assert.doesNotMatch(body.error.message, /db password/);
});

test("notFoundHandler forwards a 404 AppError naming the unmatched method/path", () => {
  const req = { method: "GET", path: "/nope" } as Request;
  let forwarded: unknown;
  const next = ((arg?: unknown) => {
    forwarded = arg;
  }) as NextFunction;

  notFoundHandler(req, {} as Response, next);

  assert.ok(forwarded instanceof AppError);
  assert.equal(forwarded.statusCode, 404);
  assert.match(forwarded.message, /GET \/nope/);
});
