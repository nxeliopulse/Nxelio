/**
 * Stripe singleton client (server-only).
 */
import Stripe from "stripe";

// Plan price IDs as configured in your Stripe dashboard
// (Product catalog → each product's Monthly/Yearly price).
export const STRIPE_PRICE_IDS: Record<string, Record<string, string>> = {
  basic:   { monthly: "price_1TwhzACRKbhmPQVVA1kOwaAT", annual: "price_1TwiGNCRKbhmPQVV9IMpDS5b" },
  starter: { monthly: "price_1TwiJPCRKbhmPQVVJ8qPQt6C", annual: "price_1TwiK2CRKbhmPQVV42BISuGM" },
  pro:     { monthly: "price_1TwiL4CRKbhmPQVVSQFBYCQf", annual: "price_1TwiLWCRKbhmPQVVaxin5CSm" },
};

// Reverse map: Stripe price ID → { planId, interval }
export const PRICE_ID_TO_PLAN: Record<string, { planId: string; interval: string }> = {};
for (const [planId, intervals] of Object.entries(STRIPE_PRICE_IDS)) {
  for (const [interval, priceId] of Object.entries(intervals)) {
    PRICE_ID_TO_PLAN[priceId] = { planId, interval };
  }
}

// Credits granted per plan (must match subscription_plans.credits_per_cycle)
export const PLAN_CREDITS: Record<string, number> = {
  basic: 200, starter: 300, pro: 1000,
};

// AI-discovered leads granted per plan (must match subscription_plans.leads_per_cycle)
export const PLAN_LEADS: Record<string, number> = {
  basic: 0, starter: 300, pro: 1000,
};

// Lead top-up: one-time purchase, same for every plan.
export const LEAD_TOPUP_PRICE_CENTS = 14900; // $149.00
export const LEAD_TOPUP_LEADS = 1000;

function buildStripeClient() {
  const apiKey = process.env.STRIPE_SECRET_KEY;

  if (!apiKey) {
    throw new Error("Missing STRIPE_SECRET_KEY env var");
  }

  return new Stripe(apiKey);
}

// Lazily created so build-time imports don't blow up when env vars aren't set.
let _client: Stripe | null = null;
export function stripe(): Stripe {
  if (!_client) _client = buildStripeClient();
  return _client;
}
