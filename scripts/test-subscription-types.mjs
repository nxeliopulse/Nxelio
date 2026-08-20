import test from "node:test";
import assert from "node:assert/strict";
import { mapStripeStatus, trialDaysLeft } from "../src/lib/queries/subscription-types.ts";

// ── mapStripeStatus ──────────────────────────────────────────────────────────

test("mapStripeStatus: trialing → trialing", () => {
  assert.equal(mapStripeStatus("trialing"), "trialing");
});

test("mapStripeStatus: active → active", () => {
  assert.equal(mapStripeStatus("active"), "active");
});

test("mapStripeStatus: past_due → past_due", () => {
  assert.equal(mapStripeStatus("past_due"), "past_due");
});

test("mapStripeStatus: canceled → canceled", () => {
  assert.equal(mapStripeStatus("canceled"), "canceled");
});

test("mapStripeStatus: incomplete/unpaid map to past_due", () => {
  assert.equal(mapStripeStatus("incomplete"), "past_due");
  assert.equal(mapStripeStatus("unpaid"), "past_due");
  assert.equal(mapStripeStatus("incomplete_expired"), "past_due");
});

test("mapStripeStatus: truly unknown status falls back to active", () => {
  assert.equal(mapStripeStatus(""), "active");
  assert.equal(mapStripeStatus("paused"), "active");
});

// ── trialDaysLeft ────────────────────────────────────────────────────────────

test("trialDaysLeft: non-trialing subscription always returns 0", () => {
  const sub = { status: "active", trial_ends_at: new Date(Date.now() + 86_400_000 * 5).toISOString() };
  assert.equal(trialDaysLeft(sub), 0);
});

test("trialDaysLeft: trialing with no trial_ends_at returns 0", () => {
  assert.equal(trialDaysLeft({ status: "trialing", trial_ends_at: null }), 0);
});

test("trialDaysLeft: expired trial returns 0 (not negative)", () => {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  assert.equal(trialDaysLeft({ status: "trialing", trial_ends_at: yesterday }), 0);
});

test("trialDaysLeft: 3 days remaining returns 3", () => {
  // Use 2.5 days so Math.ceil(2.499...) = 3 — stable regardless of test overhead
  const future = new Date(Date.now() + 86_400_000 * 2.5).toISOString();
  assert.equal(trialDaysLeft({ status: "trialing", trial_ends_at: future }), 3);
});

test("trialDaysLeft: 7 days remaining returns 7", () => {
  // Use 6.5 days so Math.ceil(6.499...) = 7 — stable regardless of test overhead
  const future = new Date(Date.now() + 86_400_000 * 6.5).toISOString();
  assert.equal(trialDaysLeft({ status: "trialing", trial_ends_at: future }), 7);
});
