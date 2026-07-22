/**
 * GET /checkout-return?id=<hostedPageId>
 *
 * Chargebee's success redirect lands here. We sync the subscription
 * server-side (so the DB row exists before AppLayout's getSubscription()
 * runs) then send the user to the dashboard.
 *
 * This fixes the bug where the SubscriptionGate kept showing even after a
 * successful checkout, because the old flow redirected to /billing where
 * AppLayout ran before the client-side sync could fire.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chargebee, PRICE_ID_TO_PLAN, PLAN_CREDITS, PLAN_LEADS } from "@/lib/chargebee";
import { syncSubscriptionFromChargebee } from "@/lib/queries/subscriptions";
import { finalizePendingPromotion } from "@/lib/queries/promotions";
import type { PlanId, BillingInterval } from "@/lib/queries/subscriptions";

function mapStatus(s: string): "trialing" | "active" | "past_due" | "canceled" {
  switch (s) {
    case "in_trial":    return "trialing";
    case "cancelled":   return "canceled";
    case "paused":      return "past_due";
    default:            return "active";
  }
}

export async function GET(req: NextRequest) {
  const origin       = new URL(req.url).origin;
  const hostedPageId = new URL(req.url).searchParams.get("id");

  // No hosted page ID → just send to dashboard (webhook may have already synced)
  if (!hostedPageId) {
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

    if (hp.state === "succeeded" && hp.content?.subscription) {
      const cbSub      = hp.content.subscription;
      const cbCustomer = hp.content.customer;
      const itemPriceId = cbSub.subscription_items?.[0]?.item_price_id ?? "";
      const parsed      = PRICE_ID_TO_PLAN[itemPriceId];

      if (parsed) {
        const now = new Date();
        await syncSubscriptionFromChargebee({
          workspaceId:              profile.workspace_id,
          planId:                   parsed.planId as PlanId,
          billingInterval:          parsed.interval as BillingInterval,
          status:                   mapStatus(cbSub.status),
          creditsTotal:             PLAN_CREDITS[parsed.planId] ?? 0,
          leadsTotal:               PLAN_LEADS[parsed.planId] ?? 0,
          currentPeriodStart:       cbSub.current_term_start
                                      ? new Date(cbSub.current_term_start * 1000) : now,
          currentPeriodEnd:         cbSub.current_term_end
                                      ? new Date(cbSub.current_term_end * 1000)
                                      : new Date(now.getTime() + 30 * 86_400_000),
          trialEndsAt:              cbSub.trial_end
                                      ? new Date(cbSub.trial_end * 1000) : null,
          chargebeeCustomerId:      cbCustomer?.id ?? profile.workspace_id,
          chargebeeSubscriptionId:  cbSub.id,
          chargebeePlanId:          itemPriceId,
        });

        await finalizePendingPromotion(profile.workspace_id, {
          hostedPageId: hostedPageId,
          chargebeeSubscriptionId: cbSub.id,
        });
      }
    }
  } catch (err) {
    // Sync failed — log and continue. The Chargebee webhook will reconcile.
    console.error("[checkout-return] sync error:", err);
  }

  // Subscription is now in the DB → AppLayout will see it → dashboard renders
  return NextResponse.redirect(`${origin}/dashboard?welcome=1`);
}
