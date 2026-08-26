/**
 * POST /api/billing/resume
 *
 * Undoes a scheduled cancellation (the "Resume subscription" action) —
 * the undo half of /api/billing/cancel, which didn't exist before this
 * pass despite cancel_at_period_end being a normal, reversible-until-the-
 * period-ends Stripe state.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
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
    return NextResponse.json({ error: "No billing account found." }, { status: 400 });
  }
  if (!sub.cancel_at_period_end) {
    return NextResponse.json({ error: "This subscription isn't scheduled to cancel." }, { status: 400 });
  }

  try {
    const updated = await stripe().subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: false });
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

    // If this workspace had a cancellation ticket that was actually cancelled,
    // reflect the reversal in the admin panel — otherwise it would show
    // "Cancelled" forever even though the subscription is active again.
    const admin = createAdminClient();
    await admin
      .from("cancellation_requests")
      .update({ status: "reactivated", resolved_at: new Date().toISOString() })
      .eq("workspace_id", profile.workspace_id)
      .eq("status", "cancelled");

    return NextResponse.json({ ok: true, cancelAtPeriodEnd: updated.cancel_at_period_end });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[billing/resume]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
