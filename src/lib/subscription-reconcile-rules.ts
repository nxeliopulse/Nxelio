// Pure decision logic for the renewal reconciler. NO "use server" and no
// Next.js imports, so this is unit-testable on its own — the same split as
// subscription-types.ts, kill-switch-rules.ts and trial-rules.ts.
//
// src/lib/queries/subscription-reconcile.ts does the I/O (Stripe + Supabase)
// and delegates every decision here. That matters: the I/O side transitively
// imports next/headers and cannot be loaded outside the Next runtime, so
// anything left in it is untestable by definition.

import type { SubscriptionStatus } from "@/lib/queries/subscription-types";

/**
 * Statuses worth re-checking against Stripe when the period end has passed.
 *
 * 'canceled' is deliberately absent: a cancelled subscription is SUPPOSED to
 * sit in the past, and a background job must never revive one.
 */
export const RECONCILE_STATUSES = ["active", "trialing", "past_due"] as const;

export type ReconcileStatus = (typeof RECONCILE_STATUSES)[number];

export function isReconcilable(status: string): boolean {
  return (RECONCILE_STATUSES as readonly string[]).includes(status);
}

/**
 * Did Stripe move the billing period past what we have stored?
 *
 * Compares INSTANTS, never strings. Postgres hands back
 * "2026-09-08T05:05:12+00:00" while Date#toISOString() produces
 * "2026-09-08T05:05:12.000Z" — the same moment in two spellings. A string
 * compare of those reaches "." vs "+", decides the Stripe value is greater,
 * and reports a renewal that never happened. That bug would have refilled a
 * customer's credits every single hour.
 *
 * A missing stored value counts as advanced: we have no period on record, so
 * whatever Stripe says is newer than nothing.
 */
export function hasPeriodAdvanced(
  stripePeriodEnd: Date,
  storedPeriodEnd: string | Date | null | undefined
): boolean {
  const stripeMs = stripePeriodEnd.getTime();
  if (!Number.isFinite(stripeMs)) return false;
  if (storedPeriodEnd === null || storedPeriodEnd === undefined || storedPeriodEnd === "") return true;
  const storedMs = new Date(storedPeriodEnd).getTime();
  if (!Number.isFinite(storedMs)) return true;
  return stripeMs > storedMs;
}

/**
 * Whether to refill the cycle's credit allowance.
 *
 * Both conditions are required. "Advanced" alone is not enough: a subscription
 * that moved period while past_due or trialing has not been paid for this
 * cycle, and refilling it would hand out credits for an unpaid month.
 */
export function shouldRefillCycle(advanced: boolean, status: SubscriptionStatus): boolean {
  return advanced && status === "active";
}

/** Stripe returns `customer` as either an id or an expanded object. */
export function stripeCustomerIdOf(customer: string | { id: string }): string {
  return typeof customer === "string" ? customer : customer.id;
}

export interface ResolvedPlan {
  planId: string;
  billingInterval: string;
  priceId: string;
}

/**
 * Maps a Stripe price id to our plan. Returns null for a price we don't
 * recognise (a retired or legacy price), which the caller must treat as
 * "sync dates only, never guess a plan" — writing the wrong credits_total
 * would corrupt a real customer's entitlements.
 */
export function resolvePlanFromPriceId(
  priceId: string | null | undefined,
  priceMap: Record<string, { planId: string; interval: string }>
): ResolvedPlan | null {
  if (!priceId) return null;
  const mapped = priceMap[priceId];
  if (!mapped) return null;
  return { planId: mapped.planId, billingInterval: mapped.interval, priceId };
}
