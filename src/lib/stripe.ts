/**
 * Stripe singleton client (server-only).
 */
import Stripe from "stripe";

// Plan price IDs as configured in your Stripe dashboard
// (Product catalog → each product's Monthly/Yearly price).
//
// A Stripe Price object belongs to ONE mode — a test-mode price_… does not
// exist in live mode and vice versa. So these are read from env first, with
// the existing test-mode IDs as the fallback: switching an environment to
// live is a config change (set the six vars below), never a code edit.
// See assertPriceIdsMatchMode() for the guard that stops a live key from
// silently running against these test fallbacks.
export const TEST_PRICE_IDS: Record<string, Record<string, string>> = {
  basic:   { monthly: "price_1TwhzACRKbhmPQVVA1kOwaAT", annual: "price_1TwiGNCRKbhmPQVV9IMpDS5b" },
  starter: { monthly: "price_1TxMCLCRKbhmPQVVLqm7C8wB", annual: "price_1TxMDGCRKbhmPQVVepAnhyPm" },
  pro:     { monthly: "price_1TxMDyCRKbhmPQVVeVUe7cPB", annual: "price_1TxMERCRKbhmPQVVtuXpQ9BJ" },
};

export const STRIPE_PRICE_IDS: Record<string, Record<string, string>> = {
  basic: {
    monthly: process.env.STRIPE_PRICE_BASIC_MONTHLY || TEST_PRICE_IDS.basic.monthly,
    annual: process.env.STRIPE_PRICE_BASIC_ANNUAL || TEST_PRICE_IDS.basic.annual,
  },
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || TEST_PRICE_IDS.starter.monthly,
    annual: process.env.STRIPE_PRICE_STARTER_ANNUAL || TEST_PRICE_IDS.starter.annual,
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || TEST_PRICE_IDS.pro.monthly,
    annual: process.env.STRIPE_PRICE_PRO_ANNUAL || TEST_PRICE_IDS.pro.annual,
  },
};

/**
 * Refuses to run a live secret key against the test-mode price fallbacks.
 *
 * Without this the failure is silent and expensive: Checkout rejects the
 * unknown price outright, and if a subscription did reach the webhook,
 * resolvePlan() can't match the price ID, so the account is marked
 * subscribed but never receives its plan, credits, or leads — a paying
 * customer with an empty workspace. Failing loudly at the first Stripe call
 * is strictly better than that.
 */
export function assertPriceIdsMatchMode(
  apiKey: string,
  priceIds: Record<string, Record<string, string>> = STRIPE_PRICE_IDS
): void {
  if (!apiKey.startsWith("sk_live_")) return;

  const stillTest = Object.entries(priceIds).flatMap(([planId, intervals]) =>
    Object.entries(intervals)
      .filter(([interval, priceId]) => priceId === TEST_PRICE_IDS[planId]?.[interval])
      .map(([interval]) => `${planId}/${interval}`)
  );

  if (stillTest.length > 0) {
    throw new Error(
      `STRIPE_SECRET_KEY is a live key, but these plans still use test-mode price IDs: ${stillTest.join(", ")}. ` +
        "Create the matching Prices in Stripe live mode and set STRIPE_PRICE_<PLAN>_<MONTHLY|ANNUAL> for each."
    );
  }
}

// Reverse map: Stripe price ID → { planId, interval }
export const PRICE_ID_TO_PLAN: Record<string, { planId: string; interval: string }> = {};
for (const [planId, intervals] of Object.entries(STRIPE_PRICE_IDS)) {
  for (const [interval, priceId] of Object.entries(intervals)) {
    PRICE_ID_TO_PLAN[priceId] = { planId, interval };
  }
}

// Credits granted per plan (must match subscription_plans.credits_per_cycle)
export const PLAN_CREDITS: Record<string, number> = {
  basic: 400, starter: 1400, pro: 2400,
};

// AI-discovered leads granted per plan (must match subscription_plans.leads_per_cycle)
export const PLAN_LEADS: Record<string, number> = {
  basic: 0, starter: 1000, pro: 2000,
};

function buildStripeClient() {
  const apiKey = process.env.STRIPE_SECRET_KEY;

  if (!apiKey) {
    throw new Error("Missing STRIPE_SECRET_KEY env var");
  }

  assertPriceIdsMatchMode(apiKey);

  return new Stripe(apiKey);
}

// Lazily created so build-time imports don't blow up when env vars aren't set.
let _client: Stripe | null = null;
export function stripe(): Stripe {
  if (!_client) _client = buildStripeClient();
  return _client;
}
