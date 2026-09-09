import test from "node:test";
import assert from "node:assert/strict";
import {
  RECONCILE_STATUSES,
  isReconcilable,
  hasPeriodAdvanced,
  shouldRefillCycle,
  stripeCustomerIdOf,
  resolvePlanFromPriceId,
} from "../src/lib/subscription-reconcile-rules.ts";

// ── Which rows the reconciler is allowed to touch ───────────────────────────

test("only active, trialing and past_due are reconciled", () => {
  assert.deepEqual([...RECONCILE_STATUSES], ["active", "trialing", "past_due"]);
});

test("a CANCELED subscription is never reconciled — it is meant to sit in the past", () => {
  // The whole point: a background job must not revive a cancellation.
  assert.equal(isReconcilable("canceled"), false);
  assert.equal(RECONCILE_STATUSES.includes("canceled"), false);
});

test("isReconcilable accepts every listed status and rejects anything else", () => {
  for (const s of RECONCILE_STATUSES) assert.equal(isReconcilable(s), true, s);
  for (const s of ["canceled", "cancelled", "none", "", "ACTIVE", "paused"]) {
    assert.equal(isReconcilable(s), false, s);
  }
});

// ── hasPeriodAdvanced — the regression that caused hourly credit refills ────

test("REGRESSION: the same instant in Postgres and JS spelling is NOT 'advanced'", () => {
  // Postgres: "2026-09-08T05:05:12+00:00"
  // JS:       "2026-09-08T05:05:12.000Z"
  // A string comparison of these reaches "." vs "+", calls the Stripe value
  // greater, and refills the customer's credits every hour forever.
  const stored = "2026-09-08T05:05:12+00:00";
  const stripeSame = new Date(stored);
  assert.equal(hasPeriodAdvanced(stripeSame, stored), false);
  // and prove the naive version really would have been wrong:
  assert.equal(stripeSame.toISOString() > stored, true, "string compare is the trap");
});

test("hasPeriodAdvanced: a genuinely later Stripe period counts as advanced", () => {
  assert.equal(
    hasPeriodAdvanced(new Date("2026-10-08T05:05:12Z"), "2026-09-08T05:05:12+00:00"),
    true
  );
});

test("hasPeriodAdvanced: an EARLIER Stripe period is not advanced", () => {
  assert.equal(
    hasPeriodAdvanced(new Date("2026-08-08T05:05:12Z"), "2026-09-08T05:05:12+00:00"),
    false
  );
});

test("hasPeriodAdvanced: one second later still counts", () => {
  assert.equal(
    hasPeriodAdvanced(new Date("2026-09-08T05:05:13Z"), "2026-09-08T05:05:12+00:00"),
    true
  );
});

test("hasPeriodAdvanced: differing offsets for one instant are equal, not advanced", () => {
  // 05:05:12+00:00 and 10:35:12+05:30 are the same moment.
  assert.equal(
    hasPeriodAdvanced(new Date("2026-09-08T05:05:12Z"), "2026-09-08T10:35:12+05:30"),
    false
  );
});

test("hasPeriodAdvanced: no stored period means anything from Stripe is newer", () => {
  for (const empty of [null, undefined, ""]) {
    assert.equal(hasPeriodAdvanced(new Date("2026-09-08T00:00:00Z"), empty), true, String(empty));
  }
});

test("hasPeriodAdvanced: an unparseable stored value is treated as missing", () => {
  assert.equal(hasPeriodAdvanced(new Date("2026-09-08T00:00:00Z"), "not-a-date"), true);
});

test("hasPeriodAdvanced: an invalid Stripe date never triggers a sync", () => {
  // Fails safe — a bad value from Stripe must not look like a renewal.
  assert.equal(hasPeriodAdvanced(new Date("nonsense"), "2026-09-08T05:05:12+00:00"), false);
});

test("hasPeriodAdvanced accepts a Date for the stored side too", () => {
  const d = new Date("2026-09-08T05:05:12Z");
  assert.equal(hasPeriodAdvanced(new Date("2026-10-08T05:05:12Z"), d), true);
  assert.equal(hasPeriodAdvanced(d, d), false);
});

// ── shouldRefillCycle — never hand out credits for an unpaid month ──────────

test("shouldRefillCycle: only an ADVANCED and ACTIVE subscription is refilled", () => {
  assert.equal(shouldRefillCycle(true, "active"), true);
});

test("shouldRefillCycle: a period that did not move is never refilled", () => {
  for (const s of ["active", "trialing", "past_due", "canceled"]) {
    assert.equal(shouldRefillCycle(false, s), false, s);
  }
});

test("shouldRefillCycle: past_due must NOT be refilled — the cycle was not paid", () => {
  assert.equal(shouldRefillCycle(true, "past_due"), false);
});

test("shouldRefillCycle: trialing must NOT be refilled by the reconciler", () => {
  assert.equal(shouldRefillCycle(true, "trialing"), false);
});

test("shouldRefillCycle: canceled is never refilled", () => {
  assert.equal(shouldRefillCycle(true, "canceled"), false);
});

// ── Stripe shape helpers ───────────────────────────────────────────────────

test("stripeCustomerIdOf handles both the id string and the expanded object", () => {
  assert.equal(stripeCustomerIdOf("cus_abc123"), "cus_abc123");
  assert.equal(stripeCustomerIdOf({ id: "cus_abc123" }), "cus_abc123");
});

test("resolvePlanFromPriceId maps a known price to its plan and interval", () => {
  const map = { price_pro_m: { planId: "pro", interval: "monthly" } };
  assert.deepEqual(resolvePlanFromPriceId("price_pro_m", map), {
    planId: "pro", billingInterval: "monthly", priceId: "price_pro_m",
  });
});

test("resolvePlanFromPriceId returns null for a retired price rather than guessing", () => {
  // The caller then syncs dates only. Guessing "basic" here would overwrite a
  // real customer's credits_total with the wrong allowance.
  const map = { price_pro_m: { planId: "pro", interval: "monthly" } };
  assert.equal(resolvePlanFromPriceId("price_retired_2024", map), null);
});

test("resolvePlanFromPriceId returns null for a missing or blank price id", () => {
  const map = { price_pro_m: { planId: "pro", interval: "monthly" } };
  for (const v of [null, undefined, ""]) {
    assert.equal(resolvePlanFromPriceId(v, map), null, String(v));
  }
});

test("resolvePlanFromPriceId returns null against an empty price map", () => {
  // What an unconfigured or wrong-Stripe-mode deployment looks like.
  assert.equal(resolvePlanFromPriceId("price_pro_m", {}), null);
});
