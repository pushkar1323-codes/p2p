import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLoanRequestView } from "./loanRequestView.ts";

test("resolveLoanRequestView: a disconnected wallet always resolves to 'connect', regardless of eligibility state", () => {
  assert.equal(resolveLoanRequestView(false, "idle", null), "connect");
  assert.equal(resolveLoanRequestView(false, "loading", null), "connect");
  assert.equal(resolveLoanRequestView(false, "loaded", true), "connect");
  assert.equal(resolveLoanRequestView(false, "error", null), "connect");
});

test("resolveLoanRequestView: connected + eligibility status 'idle' resolves to 'loading'", () => {
  assert.equal(resolveLoanRequestView(true, "idle", null), "loading");
});

test("resolveLoanRequestView: connected + eligibility status 'loading' resolves to 'loading'", () => {
  assert.equal(resolveLoanRequestView(true, "loading", null), "loading");
});

test("resolveLoanRequestView: connected + eligibility status 'error' resolves to 'error', even if stale data is present", () => {
  assert.equal(resolveLoanRequestView(true, "error", null), "error");
  assert.equal(resolveLoanRequestView(true, "error", true), "error");
  assert.equal(resolveLoanRequestView(true, "error", false), "error");
});

test("resolveLoanRequestView: connected + not eligible (unregistered) resolves to 'register'", () => {
  assert.equal(resolveLoanRequestView(true, "loaded", false), "register");
});

test("resolveLoanRequestView: connected + not eligible (blocked) also resolves to 'register' — the read is deny-by-default and indistinguishable from unregistered", () => {
  // Same input as the "unregistered" case above, deliberately: the
  // contract's is_borrower_eligible() returns false for both a
  // never-registered wallet and a blocked one (deny-by-default), and
  // this frontend has no separate on-chain read to tell them apart in
  // advance. A blocked wallet only learns why once it actually
  // attempts to register (see RegisterWalletAction's BLOCKED_MESSAGE
  // handling) — a different, already-tested concern from this view
  // decision.
  assert.equal(resolveLoanRequestView(true, "loaded", false), "register");
});

test("resolveLoanRequestView: connected + eligible resolves to 'form'", () => {
  assert.equal(resolveLoanRequestView(true, "loaded", true), "form");
});
