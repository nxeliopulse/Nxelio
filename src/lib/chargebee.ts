/**
 * Chargebee singleton client (server-only).
 * Stripe is connected inside Chargebee as the payment gateway —
 * we never call Stripe directly; all billing flows go through Chargebee.
 */
import { ChargeBee } from "chargebee-typescript";

// Plan item-price IDs as configured in your Chargebee dashboard
// (Product Catalog → Items → each item's price IDs).
export const CHARGEBEE_PRICE_IDS: Record<string, Record<string, string>> = {
  basic:   { monthly: "basic-monthly-USD",   annual: "basic-yearly-USD"   },
  starter: { monthly: "starter-monthly-USD", annual: "starter-yearly-USD" },
  pro:     { monthly: "pro-monthly-USD",     annual: "pro-yearly-USD"     },
};

// Reverse map: Chargebee price ID → { planId, interval }
export const PRICE_ID_TO_PLAN: Record<string, { planId: string; interval: string }> = {};
for (const [planId, intervals] of Object.entries(CHARGEBEE_PRICE_IDS)) {
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

function buildChargebeeClient() {
  const site   = process.env.CHARGEBEE_SITE;
  const apiKey = process.env.CHARGEBEE_API_KEY;

  if (!site || !apiKey) {
    throw new Error("Missing CHARGEBEE_SITE or CHARGEBEE_API_KEY env var");
  }

  const cb = new ChargeBee();
  cb.configure({ site, api_key: apiKey });
  return cb;
}

// Lazily created so build-time imports don't blow up when env vars aren't set.
let _client: ChargeBee | null = null;
export function chargebee(): ChargeBee {
  if (!_client) _client = buildChargebeeClient();
  return _client;
}
