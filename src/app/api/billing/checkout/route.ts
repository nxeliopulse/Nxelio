/**
 * POST /api/billing/checkout
 * Creates a Chargebee hosted checkout page and returns the redirect URL.
 * Stripe is the payment gateway inside Chargebee — no Stripe calls here.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chargebee, CHARGEBEE_PRICE_IDS } from "@/lib/chargebee";
import type { BillingInterval, PlanId } from "@/lib/queries/subscriptions";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get workspace + current subscription
  const [{ data: profile }, { data: sub }] = await Promise.all([
    supabase.from("users").select("workspace_id, full_name").eq("user_id", user.id).single(),
    supabase.from("subscriptions")
      .select("chargebee_customer_id, chargebee_subscription_id, plan_id")
      .single(),
  ]);

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  const { planId, billingInterval } = (await req.json()) as {
    planId: PlanId;
    billingInterval: BillingInterval;
  };

  const itemPriceId = CHARGEBEE_PRICE_IDS[planId]?.[billingInterval];
  if (!itemPriceId) {
    return NextResponse.json({ error: "Invalid plan or interval" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const successUrl = `${appUrl}/billing?checkout=success`;
  const cancelUrl  = `${appUrl}/billing?checkout=canceled`;

  const cb = chargebee();

  try {
    let result: { hosted_page: { url: string; id: string } };

    if (sub?.chargebee_subscription_id) {
      // Existing subscriber — upgrade/downgrade
      result = await cb.hosted_page
        .checkout_existing_for_items({
          subscription: { id: sub.chargebee_subscription_id },
          subscription_items: [{ item_price_id: itemPriceId, quantity: 1 }],
          redirect_url:        successUrl,
          cancel_url:          cancelUrl,
        })
        .request();
    } else {
      // New subscriber — create customer + subscription
      result = await cb.hosted_page
        .checkout_new_for_items({
          subscription_items: [{ item_price_id: itemPriceId, quantity: 1 }],
          customer: {
            id:    profile.workspace_id, // use workspace_id as Chargebee customer id
            email: user.email,
            ...(profile.full_name ? { first_name: profile.full_name.split(" ")[0], last_name: profile.full_name.split(" ").slice(1).join(" ") } : {}),
          },
          redirect_url: successUrl,
          cancel_url:   cancelUrl,
          // Pass workspace_id via customer.cf_workspace_id custom field in Chargebee
          // (add a "cf_workspace_id" customer custom field in Chargebee dashboard)

        })
        .request();
    }

    return NextResponse.json({ url: result.hosted_page.url });
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
