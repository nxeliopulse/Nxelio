import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPriceIdsMatchMode,
  TEST_PRICE_IDS,
  STRIPE_PRICE_IDS,
  PRICE_ID_TO_PLAN,
  PLAN_CREDITS,
  PLAN_LEADS,
} from "../src/lib/stripe.ts";

const PLANS = ["basic", "starter", "pro"];
const INTERVALS = ["monthly", "annual"];

// A fully-populated live price map (shape-identical to STRIPE_PRICE_IDS, but
// with no value equal to a test-mode fallback).
const LIVE_PRICE_IDS = {
  basic: { monthly: "price_live_basic_m", annual: "price_live_basic_a" },
  starter: { monthly: "price_live_starter_m", annual: "price_live_starter_a" },
  pro: { monthly: "price_live_pro_m", annual: "price_live_pro_a" },
};

test("a test-mode key is always allowed, even with test price IDs", () => {
  assert.doesNotThrow(() => assertPriceIdsMatchMode("sk_test_abc", TEST_PRICE_IDS));
});

test("a live key with fully-configured live price IDs is allowed", () => {
  assert.doesNotThrow(() => assertPriceIdsMatchMode("sk_live_abc", LIVE_PRICE_IDS));
});

test("a live key against the test fallbacks throws", () => {
  assert.throws(() => assertPriceIdsMatchMode("sk_live_abc", TEST_PRICE_IDS), /live key/i);
});

test("the live-key error names every plan/interval still on a test ID", () => {
  try {
    assertPriceIdsMatchMode("sk_live_abc", TEST_PRICE_IDS);
    assert.fail("expected a throw");
  } catch (err) {
    for (const plan of PLANS) {
      for (const interval of INTERVALS) {
        assert.ok(
          err.message.includes(`${plan}/${interval}`),
          `error should name ${plan}/${interval}: ${err.message}`
        );
      }
    }
  }
});

test("a live key throws when even ONE price is left on a test ID", () => {
  const partial = {
    ...LIVE_PRICE_IDS,
    pro: { monthly: LIVE_PRICE_IDS.pro.monthly, annual: TEST_PRICE_IDS.pro.annual },
  };
  try {
    assertPriceIdsMatchMode("sk_live_abc", partial);
    assert.fail("expected a throw");
  } catch (err) {
    assert.ok(err.message.includes("pro/annual"), err.message);
    // ...and does not falsely accuse the correctly-configured ones
    assert.ok(!err.message.includes("basic/monthly"), err.message);
  }
});

test("the error tells you which env vars to set", () => {
  try {
    assertPriceIdsMatchMode("sk_live_abc", TEST_PRICE_IDS);
    assert.fail("expected a throw");
  } catch (err) {
    assert.match(err.message, /STRIPE_PRICE_/);
  }
});

// ── Catalog integrity (guards the webhook's price → plan resolution) ──

// Regression guard for the env-var refactor: with none of the six
// STRIPE_PRICE_* vars set (the current state of local dev and of the
// existing test-mode deployments), the resolved catalog must still be
// byte-identical to the previously-hardcoded test IDs.
test("with no env overrides, the catalog is unchanged from the test IDs", () => {
  const anyOverride = PLANS.some((p) =>
    INTERVALS.some((i) => process.env[`STRIPE_PRICE_${p.toUpperCase()}_${i.toUpperCase()}`])
  );
  if (anyOverride) return; // env is deliberately overridden here; nothing to assert
  assert.deepEqual(STRIPE_PRICE_IDS, TEST_PRICE_IDS);
});

test("STRIPE_PRICE_IDS has every plan and interval", () => {
  for (const plan of PLANS) {
    for (const interval of INTERVALS) {
      const id = STRIPE_PRICE_IDS[plan]?.[interval];
      assert.ok(typeof id === "string" && id.length > 0, `missing ${plan}/${interval}`);
    }
  }
});

test("every price ID is unique — a collision would misroute a plan", () => {
  const all = PLANS.flatMap((p) => INTERVALS.map((i) => STRIPE_PRICE_IDS[p][i]));
  assert.equal(new Set(all).size, all.length, "duplicate price ID across plans/intervals");
});

test("PRICE_ID_TO_PLAN round-trips every configured price", () => {
  for (const plan of PLANS) {
    for (const interval of INTERVALS) {
      const id = STRIPE_PRICE_IDS[plan][interval];
      assert.deepEqual(PRICE_ID_TO_PLAN[id], { planId: plan, interval }, `bad reverse map for ${id}`);
    }
  }
});

test("every plan has credits and leads defined", () => {
  for (const plan of PLANS) {
    assert.equal(typeof PLAN_CREDITS[plan], "number", `no credits for ${plan}`);
    assert.equal(typeof PLAN_LEADS[plan], "number", `no leads for ${plan}`);
  }
});
