import test from "node:test";
import assert from "node:assert/strict";
import { resolveAppGate } from "../src/lib/auth/app-gate-rules.ts";

// The intended flow: signup -> onboarding -> pricing -> Stripe card -> trial.
// These cases pin the ordering, because the bug being fixed was ordering:
// pricing was shown ahead of onboarding for every new signup.

const NEW_SIGNUP = { subscriptionStatus: null, hasSubscription: false, onboardingCompleted: false };
const ONBOARDED_UNPAID = { subscriptionStatus: null, hasSubscription: false, onboardingCompleted: true };
const TRIALING = { subscriptionStatus: "trialing", hasSubscription: true, onboardingCompleted: true };
const ACTIVE = { subscriptionStatus: "active", hasSubscription: true, onboardingCompleted: true };
const CANCELLED = { subscriptionStatus: "canceled", hasSubscription: true, onboardingCompleted: true };

test("a brand-new signup sees ONBOARDING, not pricing — this is the bug being fixed", () => {
  assert.equal(resolveAppGate(NEW_SIGNUP), "onboarding");
});

test("once onboarding is done, the same user sees pricing", () => {
  assert.equal(resolveAppGate(ONBOARDED_UNPAID), "no-subscription");
});

test("after checkout the trial gets into the app", () => {
  assert.equal(resolveAppGate(TRIALING), "allow");
});

test("a normal paying user gets into the app", () => {
  assert.equal(resolveAppGate(ACTIVE), "allow");
});

test("a cancelled subscription sees pricing", () => {
  assert.equal(resolveAppGate(CANCELLED), "cancelled-subscription");
});

test("cancelled beats onboarding — they must not be parked on a gate they have no reason to finish", () => {
  assert.equal(
    resolveAppGate({ subscriptionStatus: "canceled", hasSubscription: true, onboardingCompleted: false }),
    "cancelled-subscription"
  );
});

test("the full intended sequence, in order", () => {
  // 1. signs up, nothing done yet
  assert.equal(resolveAppGate({ subscriptionStatus: null, hasSubscription: false, onboardingCompleted: false }), "onboarding");
  // 2. finishes onboarding -> pricing appears
  assert.equal(resolveAppGate({ subscriptionStatus: null, hasSubscription: false, onboardingCompleted: true }), "no-subscription");
  // 3. picks a plan, pays by card, Stripe webhook writes a trialing row
  assert.equal(resolveAppGate({ subscriptionStatus: "trialing", hasSubscription: true, onboardingCompleted: true }), "allow");
  // 4. trial converts
  assert.equal(resolveAppGate({ subscriptionStatus: "active", hasSubscription: true, onboardingCompleted: true }), "allow");
});

test("mid-flow states Stripe can produce do not bounce a user back to pricing", () => {
  // past_due and unpaid are for dunning to handle, not a reason to hide the
  // product behind a plan picker the user has already bought from.
  for (const status of ["past_due", "unpaid", "incomplete", "paused"]) {
    assert.equal(
      resolveAppGate({ subscriptionStatus: status, hasSubscription: true, onboardingCompleted: true }),
      "allow",
      status
    );
  }
});

test("a cancelled status without a row is not treated as cancelled", () => {
  // Guards the hasSubscription check: null status + no row is a new signup.
  assert.equal(
    resolveAppGate({ subscriptionStatus: "canceled", hasSubscription: false, onboardingCompleted: true }),
    "no-subscription"
  );
});

test("undefined status behaves the same as null", () => {
  assert.equal(
    resolveAppGate({ subscriptionStatus: undefined, hasSubscription: false, onboardingCompleted: false }),
    "onboarding"
  );
});
