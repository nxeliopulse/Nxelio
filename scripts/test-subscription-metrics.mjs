import test from "node:test";
import assert from "node:assert/strict";
import { isLowBalance, trialDaysLeft, isLowOnLeads, totalLeadsAvailable, mapStripeStatus } from "../src/lib/queries/subscription-types.ts";

function baseSub(overrides = {}) {
  return {
    id: "sub_1",
    workspace_id: "ws_1",
    plan_id: "basic",
    billing_interval: "monthly",
    status: "active",
    trial_ends_at: null,
    current_period_start: new Date().toISOString(),
    current_period_end: new Date().toISOString(),
    credits_remaining: 100,
    credits_total: 400,
    leads_remaining: 100,
    leads_total: 1000,
    low_balance_notified_at: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_price_id: null,
    cancel_at_period_end: false,
    canceled_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

test("isLowBalance: true at or below 10% remaining, false above", () => {
  assert.equal(isLowBalance(baseSub({ credits_total: 400, credits_remaining: 40 })), true); // exactly 10%
  assert.equal(isLowBalance(baseSub({ credits_total: 400, credits_remaining: 41 })), false);
  assert.equal(isLowBalance(baseSub({ credits_total: 400, credits_remaining: 0 })), true);
});

test("isLowBalance: never low when the plan has zero total credits", () => {
  assert.equal(isLowBalance(baseSub({ credits_total: 0, credits_remaining: 0 })), false);
});

test("isLowOnLeads: true at or below 10% remaining, false above", () => {
  assert.equal(isLowOnLeads(baseSub({ leads_total: 1000, leads_remaining: 100 })), true); // exactly 10%
  assert.equal(isLowOnLeads(baseSub({ leads_total: 1000, leads_remaining: 101 })), false);
});

test("isLowOnLeads: never low when the plan has zero total leads (e.g. Basic)", () => {
  assert.equal(isLowOnLeads(baseSub({ leads_total: 0, leads_remaining: 0 })), false);
});

test("totalLeadsAvailable: returns leads_remaining as-is", () => {
  assert.equal(totalLeadsAvailable(baseSub({ leads_remaining: 42 })), 42);
});

test("trialDaysLeft: 0 when status isn't trialing, even with a future trial_ends_at", () => {
  const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
  assert.equal(trialDaysLeft(baseSub({ status: "active", trial_ends_at: future })), 0);
});

test("trialDaysLeft: 0 when trialing but trial_ends_at is null", () => {
  assert.equal(trialDaysLeft(baseSub({ status: "trialing", trial_ends_at: null })), 0);
});

test("trialDaysLeft: 0 when the trial end date is already in the past", () => {
  const past = new Date(Date.now() - 86_400_000).toISOString();
  assert.equal(trialDaysLeft(baseSub({ status: "trialing", trial_ends_at: past })), 0);
});

test("trialDaysLeft: rounds up to whole days remaining for a future trial end", () => {
  const in5Days = new Date(Date.now() + 5 * 86_400_000).toISOString();
  assert.equal(trialDaysLeft(baseSub({ status: "trialing", trial_ends_at: in5Days })), 5);
});

test("mapStripeStatus: maps every real Stripe subscription status", () => {
  assert.equal(mapStripeStatus("trialing"), "trialing");
  assert.equal(mapStripeStatus("active"), "active");
  assert.equal(mapStripeStatus("canceled"), "canceled");
});

test("mapStripeStatus: past_due/unpaid/incomplete/incomplete_expired all collapse to past_due", () => {
  // This is the exact set of statuses where the two old duplicated
  // mapStatus() copies (webhook/route.ts vs checkout-return/route.ts) had
  // silently diverged — incomplete/incomplete_expired fell through to
  // "active" in one copy and "past_due" in the other. Locking in the
  // correct, single mapping here.
  assert.equal(mapStripeStatus("past_due"), "past_due");
  assert.equal(mapStripeStatus("unpaid"), "past_due");
  assert.equal(mapStripeStatus("incomplete"), "past_due");
  assert.equal(mapStripeStatus("incomplete_expired"), "past_due");
});

test("mapStripeStatus: unrecognized statuses fall back to active rather than throwing", () => {
  assert.equal(mapStripeStatus("paused"), "active");
  assert.equal(mapStripeStatus("some_future_stripe_status"), "active");
});
