/**
 * POST /api/billing/webhook
 * Receives Stripe webhook events and keeps our subscriptions table in sync.
 *
 * Security: every payload is signed. Verified with stripe.webhooks.constructEvent()
 * using the raw request body and STRIPE_WEBHOOK_SECRET (the `stripe listen`
 * signing secret locally, or the registered endpoint's secret in production).
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  syncSubscriptionFromStripe,
  resetCycleCredits,
  workspaceByStripeCustomer,
  type PlanId,
  type BillingInterval,
} from "@/lib/queries/subscriptions";
import { mapStripeStatus } from "@/lib/queries/subscription-types";
import { stripe, PRICE_ID_TO_PLAN, PLAN_CREDITS, PLAN_LEADS } from "@/lib/stripe";
import { finalizePendingPromotion } from "@/lib/queries/promotions";
import type Stripe from "stripe";

// Extract our planId + billingInterval from the Stripe subscription's
// price. Returns null when the price isn't in STRIPE_PRICE_IDS — e.g. a
// subscription still on a retired/legacy price from before a pricing
// update. Callers must NOT default this to "basic": doing so previously
// silently downgraded real Pro/Starter subscribers (still correctly
// billing at their original price in Stripe) to Basic-tier credits/
// features on the very next webhook event, purely because the price ID
// wasn't recognized — a real, live bug, not a hypothetical.
function resolvePlan(sub: Stripe.Subscription): { planId: PlanId; billingInterval: BillingInterval; priceId: string } | null {
  const priceId = sub.items.data[0]?.price.id ?? "";
  const mapped = PRICE_ID_TO_PLAN[priceId];
  if (!mapped) return null;
  return { planId: mapped.planId as PlanId, billingInterval: mapped.interval as BillingInterval, priceId };
}

function customerId(sub: Stripe.Subscription): string {
  return typeof sub.customer === "string" ? sub.customer : sub.customer.id;
}

async function resolveWorkspace(sub: Stripe.Subscription): Promise<string | null> {
  // 1. metadata.workspace_id, set at checkout creation (subscription_data.metadata)
  if (sub.metadata?.workspace_id) return sub.metadata.workspace_id;
  // 2. Look up by stored stripe_customer_id
  return workspaceByStripeCustomer(customerId(sub));
}

async function upsertFromSubscription(sub: Stripe.Subscription, checkoutSessionId?: string) {
  const workspaceId = await resolveWorkspace(sub);
  if (!workspaceId) return;

  const resolved = resolvePlan(sub);
  const item = sub.items.data[0];

  if (!resolved) {
    // Unrecognized price (legacy/retired) — sync status/dates/cancellation
    // only. Never touch plan_id/credits_total/leads_total here: we don't
    // know what plan this price maps to, so guessing "basic" would corrupt
    // a real paying customer's entitlements. Logged loudly so this is
    // visible and the subscription can be migrated to a current price.
    console.error(
      `[billing/webhook] Unrecognized Stripe price "${item?.price.id}" on subscription ${sub.id} ` +
      `(workspace ${workspaceId}) — likely a retired/legacy price. Plan/credits left untouched; ` +
      `only status and period dates were synced. Migrate this subscription to a current STRIPE_PRICE_IDS entry.`
    );
    const admin = createAdminClient();
    await admin.from("subscriptions").update({
      status:               mapStripeStatus(sub.status),
      current_period_start: new Date(item.current_period_start * 1000).toISOString(),
      current_period_end:   new Date(item.current_period_end * 1000).toISOString(),
      trial_ends_at:        sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      stripe_customer_id:   customerId(sub),
      stripe_subscription_id: sub.id,
      cancel_at_period_end: sub.cancel_at_period_end,
      canceled_at:          sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
      updated_at:           new Date().toISOString(),
    }).eq("workspace_id", workspaceId);
    return;
  }

  const { planId, billingInterval, priceId } = resolved;

  await syncSubscriptionFromStripe({
    workspaceId,
    planId,
    billingInterval,
    status:               mapStripeStatus(sub.status),
    creditsTotal:         PLAN_CREDITS[planId] ?? PLAN_CREDITS.basic,
    leadsTotal:           PLAN_LEADS[planId] ?? 0,
    currentPeriodStart:   new Date(item.current_period_start * 1000),
    currentPeriodEnd:     new Date(item.current_period_end * 1000),
    trialEndsAt:          sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    stripeCustomerId:     customerId(sub),
    stripeSubscriptionId: sub.id,
    stripePriceId:        priceId,
    cancelAtPeriodEnd:    sub.cancel_at_period_end,
    canceledAt:           sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
  });

  // Only ever finalize a promo from the actual checkout.session.completed
  // event, where checkoutSessionId is real and known — not from every later
  // subscription.updated/invoice.paid event for this workspace, which would
  // grab and grant whatever stale pending redemption happens to exist.
  if (checkoutSessionId) {
    await finalizePendingPromotion(workspaceId, { stripeSubscriptionId: sub.id, checkoutSessionId });
  }
}

export async function POST(req: NextRequest) {
  const signature     = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const rawBody        = await req.text();

  let event: Stripe.Event;
  try {
    if (!signature || !webhookSecret) throw new Error("Missing signature or STRIPE_WEBHOOK_SECRET");
    event = stripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[billing/webhook] signature verification failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.log("[billing/webhook]", event.type);

  // Stripe explicitly documents that the same event can be delivered more
  // than once (a retry after a slow/failed response, or a genuine
  // redelivery) — this is the one general guard against reprocessing it,
  // on top of the idempotency each individual operation below already has.
  const admin = createAdminClient();
  const { data: alreadyProcessed } = await admin
    .from("stripe_processed_events")
    .select("event_id")
    .eq("event_id", event.id)
    .maybeSingle();
  if (alreadyProcessed) {
    console.log(`[billing/webhook] duplicate event ${event.id} (${event.type}) — already processed, skipping`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      // New subscriber's Checkout Session finished — fetch the subscription
      // it created and sync it (checkout-return usually beats this, but the
      // webhook is the reconciliation fallback for e.g. closed-tab cases).
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const sub = await stripe().subscriptions.retrieve(subId);
          await upsertFromSubscription(sub, session.id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await upsertFromSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const workspaceId = await resolveWorkspace(sub);
        if (workspaceId) {
          await admin.from("subscriptions")
            .update({ status: "canceled", cancel_at_period_end: false, canceled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("workspace_id", workspaceId);
        }
        break;
      }
      // A renewal's invoice being paid — reset the cycle's credit/lead
      // allowance. subscription_cycle is Stripe's billing_reason for
      // recurring renewals specifically (not the first invoice, not a
      // plan-change proration invoice).
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = invoice.parent?.subscription_details?.subscription;
        if (invoice.billing_reason === "subscription_cycle" && subRef) {
          const subId = typeof subRef === "string" ? subRef : subRef.id;
          const sub = await stripe().subscriptions.retrieve(subId);
          const workspaceId = await resolveWorkspace(sub);
          // invoice.id as the idempotency key — Stripe can redeliver this
          // exact event, and without a key tied to this specific invoice,
          // a redelivery would grant a second free cycle refill.
          if (workspaceId) await resetCycleCredits(workspaceId, invoice.id);
          await upsertFromSubscription(sub);
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = invoice.parent?.subscription_details?.subscription;
        if (subRef) {
          const subId = typeof subRef === "string" ? subRef : subRef.id;
          const sub = await stripe().subscriptions.retrieve(subId);
          const workspaceId = await resolveWorkspace(sub);
          if (workspaceId) {
            await admin.from("subscriptions")
              .update({ status: "past_due", updated_at: new Date().toISOString() })
              .eq("workspace_id", workspaceId);
          }
        }
        break;
      }
      default:
        // Unknown/unhandled event — acknowledge without processing
        break;
    }
  } catch (err) {
    console.error("[billing/webhook] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  // Record success AFTER processing (not before) — if processing above had
  // thrown, Stripe's retry needs this event to still look unprocessed.
  await admin.from("stripe_processed_events").upsert(
    { event_id: event.id, event_type: event.type },
    { onConflict: "event_id", ignoreDuplicates: true }
  );

  return NextResponse.json({ received: true });
}
