/**
 * POST /api/billing/cancel
 *
 * Schedules cancellation at the end of the current billing period —
 * calls Stripe directly rather than redirecting to the hosted Customer
 * Portal, so it doesn't depend on the Portal's "default configuration"
 * being set up in the Stripe Dashboard for this mode (test vs. live),
 * which is a real, easy-to-hit failure mode in a fresh sandbox account.
 *
 * Syncs the local `subscriptions` row immediately after the Stripe call
 * (same pattern as the checkout route's upgrade path) instead of waiting
 * on the webhook, so the UI reflects the change even if `stripe listen`
 * isn't running locally.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe, PLAN_CREDITS, PLAN_LEADS } from "@/lib/stripe";
import { syncSubscriptionFromStripe } from "@/lib/queries/subscriptions";
import { mapStripeStatus } from "@/lib/queries/subscription-types";
import type { PlanId, BillingInterval } from "@/lib/queries/subscriptions";

export async function POST(_req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: profile }, { data: sub }] = await Promise.all([
    supabase.from("users").select("workspace_id").eq("user_id", user.id).single(),
    supabase.from("subscriptions")
      .select("stripe_subscription_id, stripe_customer_id, status, plan_id, billing_interval, cancel_at_period_end")
      .single(),
  ]);

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 400 });
  if (!sub?.stripe_subscription_id) {
    return NextResponse.json({ error: "No billing account found. Please subscribe to a plan first." }, { status: 400 });
  }
  if (sub.status === "canceled") {
    return NextResponse.json({ error: "This subscription is already canceled." }, { status: 400 });
  }
  if (sub.cancel_at_period_end) {
    return NextResponse.json({ error: "Cancellation is already scheduled." }, { status: 400 });
  }

  try {
    const updated = await stripe().subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: true });
    const item = updated.items.data[0];
    const planId = sub.plan_id as PlanId;

    await syncSubscriptionFromStripe({
      workspaceId:          profile.workspace_id,
      planId,
      billingInterval:      sub.billing_interval as BillingInterval,
      status:               mapStripeStatus(updated.status),
      creditsTotal:         PLAN_CREDITS[planId] ?? PLAN_CREDITS.basic,
      leadsTotal:           PLAN_LEADS[planId] ?? 0,
      currentPeriodStart:   new Date(item.current_period_start * 1000),
      currentPeriodEnd:     new Date(item.current_period_end * 1000),
      trialEndsAt:          updated.trial_end ? new Date(updated.trial_end * 1000) : null,
      stripeCustomerId:     sub.stripe_customer_id ?? String(updated.customer),
      stripeSubscriptionId: updated.id,
      stripePriceId:        item.price.id,
      cancelAtPeriodEnd:    updated.cancel_at_period_end,
      canceledAt:           updated.canceled_at ? new Date(updated.canceled_at * 1000) : null,
    });

    return NextResponse.json({
      ok: true,
      cancelAtPeriodEnd: updated.cancel_at_period_end,
      currentPeriodEnd: new Date(item.current_period_end * 1000).toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[billing/cancel]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
