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
  type SubscriptionStatus,
} from "@/lib/queries/subscriptions";
import { stripe, PRICE_ID_TO_PLAN, PLAN_CREDITS, PLAN_LEADS } from "@/lib/stripe";
import { finalizePendingPromotion } from "@/lib/queries/promotions";
import type Stripe from "stripe";

// Map Stripe subscription status → our status
function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "trialing":            return "trialing";
    case "active":               return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":  return "past_due";
    case "canceled":             return "canceled";
    default:                     return "active";
  }
}

// Extract our planId + billingInterval from the Stripe subscription's price
function resolvePlan(sub: Stripe.Subscription): { planId: PlanId; billingInterval: BillingInterval; priceId: string } {
  const priceId = sub.items.data[0]?.price.id ?? "";
  const mapped = PRICE_ID_TO_PLAN[priceId];
  if (mapped) {
    return { planId: mapped.planId as PlanId, billingInterval: mapped.interval as BillingInterval, priceId };
  }
  return { planId: "basic", billingInterval: "monthly", priceId };
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

async function upsertFromSubscription(sub: Stripe.Subscription) {
  const workspaceId = await resolveWorkspace(sub);
  if (!workspaceId) return;

  const { planId, billingInterval, priceId } = resolvePlan(sub);
  const item = sub.items.data[0];

  await syncSubscriptionFromStripe({
    workspaceId,
    planId,
    billingInterval,
    status:               mapStatus(sub.status),
    creditsTotal:         PLAN_CREDITS[planId] ?? PLAN_CREDITS.basic,
    leadsTotal:           PLAN_LEADS[planId] ?? 0,
    currentPeriodStart:   new Date(item.current_period_start * 1000),
    currentPeriodEnd:     new Date(item.current_period_end * 1000),
    trialEndsAt:          sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    stripeCustomerId:     customerId(sub),
    stripeSubscriptionId: sub.id,
    stripePriceId:        priceId,
  });

  await finalizePendingPromotion(workspaceId, { stripeSubscriptionId: sub.id });
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
          await upsertFromSubscription(sub);
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
          const admin = createAdminClient();
          await admin.from("subscriptions")
            .update({ status: "canceled", updated_at: new Date().toISOString() })
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
          if (workspaceId) await resetCycleCredits(workspaceId);
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
            const admin = createAdminClient();
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

  return NextResponse.json({ received: true });
}
