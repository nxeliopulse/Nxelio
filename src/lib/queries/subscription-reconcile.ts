"use server";
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
import type Stripe from "stripe";

/**
 * Safety net for renewals our webhook never heard about.
 *
 * The webhook (src/app/api/billing/webhook/route.ts) is the primary path: on
 * invoice.paid it advances the period and refills the cycle. But a webhook is
 * a single point of failure — a missed delivery, a rotated
 * STRIPE_WEBHOOK_SECRET, an endpoint that was never registered for the
 * current Stripe mode — and the failure is SILENT. The row simply keeps a
 * current_period_end in the past while Stripe carries on charging.
 *
 * That is not hypothetical here: 11 of 14 'active' rows were found sitting
 * 7-15 days past their period end, having received no Stripe event since a
 * test-clock run.
 *
 * IMPORTANT — this function grants nothing on its own authority. For each
 * stale row it asks STRIPE what the truth is and copies that back. So a
 * customer who did not actually renew gets no credits: Stripe would report
 * the old period (nothing to sync) or a non-active status, which is synced
 * as-is. That is what makes running it on a schedule safe.
 */

/** Mirrors resolvePlan() in the webhook route. Duplicated deliberately rather
 *  than refactoring the live payment path for a background job — the webhook
 *  handles real charges and is left untouched. If the price map or plan
 *  shape ever changes, BOTH copies need the change. */
function resolvePlan(
  sub: Stripe.Subscription
): { planId: PlanId; billingInterval: BillingInterval; priceId: string } | null {
  const priceId = sub.items.data[0]?.price.id ?? "";
  const mapped = PRICE_ID_TO_PLAN[priceId];
  if (!mapped) return null;
  return { planId: mapped.planId as PlanId, billingInterval: mapped.interval as BillingInterval, priceId };
}

function customerIdOf(sub: Stripe.Subscription): string {
  return typeof sub.customer === "string" ? sub.customer : sub.customer.id;
}

async function resolveWorkspace(sub: Stripe.Subscription): Promise<string | null> {
  if (sub.metadata?.workspace_id) return sub.metadata.workspace_id;
  return workspaceByStripeCustomer(customerIdOf(sub));
}

export interface ReconcileResult {
  /** Rows that looked stale and were checked against Stripe. */
  checked: number;
  /** Rows Stripe reported differently, so our copy was corrected. */
  synced: number;
  /** Rows where Stripe agreed with us — genuinely overdue at Stripe too. */
  unchanged: number;
  /** Rows whose credits were refilled for a new cycle. */
  refilled: number;
  /** Rows that could not be processed. */
  failed: number;
  /** One short line per failure, for the cron response body. */
  errors: string[];
}

/**
 * Finds subscriptions whose period end has passed and re-syncs each from
 * Stripe. Safe to run on a schedule and safe to run twice: the sync is an
 * upsert, and the credit refill is keyed on the Stripe invoice id, so a
 * refill the webhook already applied is a no-op.
 */
export async function reconcileStaleSubscriptions(limit = 50): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    checked: 0, synced: 0, unchanged: 0, refilled: 0, failed: 0, errors: [],
  };
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // 'canceled' is excluded: a cancelled subscription is SUPPOSED to sit in
  // the past and must never be revived by a background job.
  const { data: stale, error } = await admin
    .from("subscriptions")
    .select("workspace_id, stripe_subscription_id, current_period_end, credits_remaining")
    .in("status", ["active", "trialing", "past_due"])
    .lt("current_period_end", nowIso)
    .not("stripe_subscription_id", "is", null)
    .order("current_period_end", { ascending: true })
    .limit(limit);

  if (error) {
    result.failed++;
    result.errors.push(`query failed: ${error.message}`);
    return result;
  }
  if (!stale?.length) return result;

  for (const row of stale) {
    result.checked++;
    const subId = row.stripe_subscription_id as string;
    try {
      const sub = await stripe().subscriptions.retrieve(subId);
      const workspaceId = await resolveWorkspace(sub);
      if (!workspaceId) {
        result.failed++;
        result.errors.push(`${subId}: no workspace could be resolved`);
        continue;
      }

      const item = sub.items.data[0];
      if (!item) {
        result.failed++;
        result.errors.push(`${subId}: subscription has no line items`);
        continue;
      }

      const periodEnd = new Date(item.current_period_end * 1000);
      // Compare as instants, NOT as strings. Postgres returns
      // "2026-09-08T05:05:12+00:00" while toISOString() produces
      // "2026-09-08T05:05:12.000Z" — for the SAME instant a string compare
      // reaches "." vs "+" and reports the Stripe value as greater, which
      // would refill credits on a period that never moved.
      const storedEnd = row.current_period_end ? new Date(row.current_period_end as string).getTime() : 0;
      const advanced = periodEnd.getTime() > storedEnd;

      const resolved = resolvePlan(sub);
      if (!resolved) {
        // Retired/legacy price — sync only the safe fields. Never guess a
        // plan here: writing the wrong credits_total would corrupt a real
        // customer's entitlements. Same rule the webhook applies.
        await admin.from("subscriptions").update({
          status:               mapStripeStatus(sub.status),
          current_period_start: new Date(item.current_period_start * 1000).toISOString(),
          current_period_end:   periodEnd.toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
          updated_at:           nowIso,
        }).eq("workspace_id", workspaceId);
        if (advanced) result.synced++; else result.unchanged++;
        continue;
      }

      await syncSubscriptionFromStripe({
        workspaceId,
        planId:               resolved.planId,
        billingInterval:      resolved.billingInterval,
        status:               mapStripeStatus(sub.status),
        creditsTotal:         PLAN_CREDITS[resolved.planId] ?? PLAN_CREDITS.basic,
        leadsTotal:           PLAN_LEADS[resolved.planId] ?? 0,
        currentPeriodStart:   new Date(item.current_period_start * 1000),
        currentPeriodEnd:     periodEnd,
        // null is safe now: 0162's trigger refuses to erase an existing
        // trial end, so a Stripe subscription that is no longer trialing
        // cannot blank the date the signup trigger set.
        trialEndsAt:          sub.trial_end ? new Date(sub.trial_end * 1000) : null,
        stripeCustomerId:     customerIdOf(sub),
        stripeSubscriptionId: sub.id,
        stripePriceId:        resolved.priceId,
        cancelAtPeriodEnd:    sub.cancel_at_period_end,
        canceledAt:           sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
      });

      if (advanced) {
        result.synced++;
        // Only refill when Stripe genuinely moved the period on. Keyed on the
        // invoice id so a refill the webhook already did is ignored rather
        // than granting a second free cycle.
        const invoiceRef = sub.latest_invoice;
        const invoiceId = typeof invoiceRef === "string" ? invoiceRef : invoiceRef?.id;
        if (invoiceId && mapStripeStatus(sub.status) === "active") {
          await resetCycleCredits(workspaceId, invoiceId);
          result.refilled++;
        }
      } else {
        // Stripe agrees the period is over and has not renewed it — this row
        // is correctly overdue, nothing to fix.
        result.unchanged++;
      }
    } catch (err) {
      result.failed++;
      result.errors.push(`${subId}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return result;
}
