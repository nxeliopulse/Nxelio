/**
 * POST /api/billing/checkout
 * New subscribers get a Stripe Checkout Session URL to redirect to.
 * Existing subscribers upgrading are updated directly via the Stripe API
 * (proration, no redirect needed) and immediately synced to our DB.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe, STRIPE_PRICE_IDS, PLAN_CREDITS, PLAN_LEADS } from "@/lib/stripe";
import { startPromoRedemption, attachCheckoutSessionToRedemption, finalizePendingPromotion } from "@/lib/queries/promotions";
import { syncSubscriptionFromStripe } from "@/lib/queries/subscriptions";
import type { BillingInterval, PlanId } from "@/lib/queries/subscriptions";

const PLAN_ORDER: Record<string, number> = { basic: 0, starter: 1, pro: 2 };

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get workspace + current subscription
  const [{ data: profile }, { data: sub }] = await Promise.all([
    supabase.from("users").select("workspace_id, full_name").eq("user_id", user.id).single(),
    supabase.from("subscriptions")
      .select("stripe_customer_id, stripe_subscription_id, plan_id")
      .single(),
  ]);

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  const { planId, billingInterval, promoCode } = (await req.json()) as {
    planId: PlanId;
    billingInterval: BillingInterval;
    promoCode?: string;
  };

  const priceId = STRIPE_PRICE_IDS[planId]?.[billingInterval];
  if (!priceId) {
    return NextResponse.json({ error: "Invalid plan or interval" }, { status: 400 });
  }

  // Downgrades aren't offered — block them here too, not just in the UI,
  // so this can't be bypassed by calling the API directly.
  if (sub?.plan_id && PLAN_ORDER[planId] < PLAN_ORDER[sub.plan_id]) {
    return NextResponse.json({ error: "Downgrades aren't available. Please contact support if you need to change to a lower plan." }, { status: 400 });
  }

  // Validate + reserve the promo code BEFORE touching Stripe at all — fail
  // fast with no wasted API call and no lingering redemption row on a bad code.
  let promo: Awaited<ReturnType<typeof startPromoRedemption>> | null = null;
  if (promoCode?.trim()) {
    promo = await startPromoRedemption(profile.workspace_id, promoCode, planId);
    if (!promo.ok) {
      return NextResponse.json({ error: promo.error ?? "Invalid promo code" }, { status: 400 });
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  // /checkout-return syncs the subscription server-side before redirecting to
  // /dashboard, so AppLayout's getSubscription() sees the row and the gate
  // never reappears after a successful checkout.
  const successUrl = `${appUrl}/checkout-return?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl  = `${appUrl}/billing?checkout=canceled`;

  // Prefer the customer-facing Promotion Code (what Stripe's discounts param
  // expects for a code a customer would type); fall back to the raw Coupon.
  const discounts = promo?.stripePromotionCodeId
    ? [{ promotion_code: promo.stripePromotionCodeId }]
    : promo?.stripeCouponId
      ? [{ coupon: promo.stripeCouponId }]
      : undefined;

  try {
    const sc = stripe();

    if (sub?.stripe_subscription_id) {
      // Existing subscriber — upgrade only (downgrades are blocked above).
      // Stripe doesn't need a redirect for this: update the subscription's
      // price directly with proration, then sync our DB immediately so the
      // credit/lead bump is instant rather than waiting on the webhook.
      const current = await sc.subscriptions.retrieve(sub.stripe_subscription_id);
      const itemId = current.items.data[0]?.id;

      const updated = await sc.subscriptions.update(sub.stripe_subscription_id, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: "create_prorations",
        ...(discounts ? { discounts } : {}),
      });

      await syncSubscriptionFromStripe({
        workspaceId:          profile.workspace_id,
        planId,
        billingInterval,
        status:               updated.status === "trialing" ? "trialing" : "active",
        creditsTotal:         PLAN_CREDITS[planId] ?? 0,
        leadsTotal:           PLAN_LEADS[planId] ?? 0,
        currentPeriodStart:   new Date(updated.items.data[0].current_period_start * 1000),
        currentPeriodEnd:     new Date(updated.items.data[0].current_period_end * 1000),
        stripeCustomerId:     sub.stripe_customer_id ?? String(updated.customer),
        stripeSubscriptionId: updated.id,
        stripePriceId:        priceId,
        // An upgrade implies the subscription isn't scheduled to cancel —
        // reflect Stripe's own fields either way rather than assuming.
        cancelAtPeriodEnd:    updated.cancel_at_period_end,
        canceledAt:           updated.canceled_at ? new Date(updated.canceled_at * 1000) : null,
      });

      if (promo?.redemptionId) {
        await finalizePendingPromotion(profile.workspace_id, { stripeSubscriptionId: updated.id });
      }

      return NextResponse.json({ url: `${appUrl}/billing?upgraded=1` });
    }

    // New subscriber — Stripe Checkout creates the customer + subscription.
    // managed_payments is disabled here to match the "Pick what you need"
    // choice made in the Stripe dashboard setup — Managed Payments otherwise
    // requires a tax code on every product and adds a 3.5% surcharge we don't want.
    //
    // Only Basic advertises a free trial (see the `trial` field on PLANS in
    // subscription-gate.tsx) — none of the 6 Stripe Prices have
    // trial_period_days configured on the Price itself, so without this the
    // card is charged in full immediately regardless of plan. Set it per
    // checkout session instead of relying on Price-level config.
    const trialDays = planId === "basic" ? 7 : undefined;
    const session = await sc.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { workspace_id: profile.workspace_id },
      subscription_data: {
        metadata: { workspace_id: profile.workspace_id },
        ...(trialDays ? { trial_period_days: trialDays } : {}),
      },
      managed_payments: { enabled: false },
      ...(discounts ? { discounts } : {}),
    });

    if (promo?.redemptionId && session.id) {
      await attachCheckoutSessionToRedemption(promo.redemptionId, session.id);
    }

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null
        ? JSON.stringify(err)
        : String(err);
    console.error("[billing/checkout]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
