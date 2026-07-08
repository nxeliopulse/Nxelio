/**
 * POST /api/billing/sync-checkout
 * Called immediately after Chargebee checkout success redirect.
 * Retrieves the hosted page from Chargebee and syncs the subscription to DB.
 * This is necessary on localhost (where Chargebee webhook can't fire).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chargebee, PRICE_ID_TO_PLAN, PLAN_CREDITS } from "@/lib/chargebee";
import { syncSubscriptionFromChargebee } from "@/lib/queries/subscriptions";
import type { PlanId, BillingInterval, SubscriptionStatus } from "@/lib/queries/subscriptions";

function mapChargebeeStatus(s: string): SubscriptionStatus {
  switch (s) {
    case "in_trial":      return "trialing";
    case "active":        return "active";
    case "future":        return "active";
    case "non_renewing":  return "active";
    case "paused":        return "past_due";
    case "cancelled":     return "canceled";
    default:              return "active";
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { hostedPageId } = (await req.json()) as { hostedPageId?: string };
  if (!hostedPageId) {
    return NextResponse.json({ error: "Missing hostedPageId" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  try {
    const cb = chargebee();
    const result = await cb.hosted_page.retrieve(hostedPageId).request();
    const hp = result.hosted_page as {
      state: string;
      content?: {
        subscription?: {
          id: string;
          status: string;
          current_term_start?: number;
          current_term_end?: number;
          trial_end?: number | null;
          subscription_items?: Array<{ item_price_id: string }>;
        };
        customer?: { id: string };
      };
    };

    if (hp.state !== "succeeded") {
      return NextResponse.json({ error: "Checkout not completed", state: hp.state }, { status: 400 });
    }

    const cbSub = hp.content?.subscription;
    const cbCustomer = hp.content?.customer;

    if (!cbSub) {
      return NextResponse.json({ error: "No subscription in hosted page content" }, { status: 400 });
    }

    const itemPriceId = cbSub.subscription_items?.[0]?.item_price_id ?? "";
    const parsed = PRICE_ID_TO_PLAN[itemPriceId];

    if (!parsed) {
      return NextResponse.json({ error: `Unknown price ID: ${itemPriceId}` }, { status: 400 });
    }

    const { planId, interval } = parsed;
    const creditsTotal = PLAN_CREDITS[planId] ?? 0;
    const planName = planId.charAt(0).toUpperCase() + planId.slice(1);

    const now = new Date();
    const periodStart = cbSub.current_term_start
      ? new Date(cbSub.current_term_start * 1000)
      : now;
    const periodEnd = cbSub.current_term_end
      ? new Date(cbSub.current_term_end * 1000)
      : new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

    await syncSubscriptionFromChargebee({
      workspaceId:              profile.workspace_id,
      planId:                   planId as PlanId,
      billingInterval:          interval as BillingInterval,
      status:                   mapChargebeeStatus(cbSub.status ?? "active"),
      creditsTotal,
      currentPeriodStart:       periodStart,
      currentPeriodEnd:         periodEnd,
      trialEndsAt:              cbSub.trial_end ? new Date(cbSub.trial_end * 1000) : null,
      chargebeeCustomerId:      cbCustomer?.id ?? profile.workspace_id,
      chargebeeSubscriptionId:  cbSub.id,
      chargebeePlanId:          itemPriceId,
    });

    return NextResponse.json({ ok: true, planId, planName, creditsTotal });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[billing/sync-checkout]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
