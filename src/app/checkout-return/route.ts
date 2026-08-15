/**
 * GET /checkout-return?session_id=<checkoutSessionId>
 *
 * Stripe's success redirect lands here. We sync the subscription
 * server-side (so the DB row exists before AppLayout's getSubscription()
 * runs) then send the user to the dashboard.
 *
 * This fixes the bug where the SubscriptionGate kept showing even after a
 * successful checkout, because the old flow redirected to /billing where
 * AppLayout ran before the client-side sync could fire.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe, PRICE_ID_TO_PLAN, PLAN_CREDITS, PLAN_LEADS } from "@/lib/stripe";
import { syncSubscriptionFromStripe } from "@/lib/queries/subscriptions";
import { mapStripeStatus } from "@/lib/queries/subscription-types";
import { finalizePendingPromotion } from "@/lib/queries/promotions";
import type { PlanId, BillingInterval } from "@/lib/queries/subscriptions";
import type Stripe from "stripe";

export async function GET(req: NextRequest) {
  const origin        = new URL(req.url).origin;
  const checkoutSessionId = new URL(req.url).searchParams.get("session_id");

  // No session ID → just send to dashboard (webhook may have already synced)
  if (!checkoutSessionId) {
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const { data: profile } = await supabase
    .from("users")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.redirect(`${origin}/login`);
  }

  // Whether the subscription actually came back trialing — the welcome
  // banner shouldn't claim "your trial is active" if the customer was
  // charged in full (e.g. a plan with no trial, or a Stripe Price missing
  // trial_period_days), so this rides along on the redirect instead of the
  // banner assuming a trial happened just because checkout succeeded.
  let trialing = false;

  try {
    const sc = stripe();
    const session = await sc.checkout.sessions.retrieve(checkoutSessionId, {
      expand: ["subscription"],
    });

    // "no_payment_required" is Stripe's real payment_status for a Checkout
    // Session with nothing due today — exactly the Basic plan's 7-day trial
    // signup. Gating on "paid" alone skipped the immediate sync for every
    // trial signup, the one plan this app actually offers a trial on.
    if ((session.payment_status === "paid" || session.payment_status === "no_payment_required") && session.subscription) {
      const stripeSub    = session.subscription as Stripe.Subscription;
      const stripeCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? profile.workspace_id;
      const priceId       = stripeSub.items.data[0]?.price.id ?? "";
      const parsed         = PRICE_ID_TO_PLAN[priceId];

      if (parsed) {
        const item = stripeSub.items.data[0];
        trialing = stripeSub.status === "trialing";
        await syncSubscriptionFromStripe({
          workspaceId:          profile.workspace_id,
          planId:               parsed.planId as PlanId,
          billingInterval:      parsed.interval as BillingInterval,
          status:               mapStripeStatus(stripeSub.status),
          creditsTotal:         PLAN_CREDITS[parsed.planId] ?? 0,
          leadsTotal:           PLAN_LEADS[parsed.planId] ?? 0,
          currentPeriodStart:   new Date(item.current_period_start * 1000),
          currentPeriodEnd:     new Date(item.current_period_end * 1000),
          trialEndsAt:          stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null,
          stripeCustomerId,
          stripeSubscriptionId: stripeSub.id,
          stripePriceId:        priceId,
          cancelAtPeriodEnd:    stripeSub.cancel_at_period_end,
          canceledAt:           stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null,
        });

        await finalizePendingPromotion(profile.workspace_id, {
          checkoutSessionId,
          stripeSubscriptionId: stripeSub.id,
        });
      }
    }
  } catch (err) {
    // Sync failed — log and continue. The Stripe webhook will reconcile.
    console.error("[checkout-return] sync error:", err);
  }

  // Subscription is now in the DB → AppLayout will see it → dashboard renders
  return NextResponse.redirect(`${origin}/dashboard?welcome=1&trial=${trialing ? "1" : "0"}`);
}
