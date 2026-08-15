"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import type {
  PlanId, BillingInterval, SubscriptionStatus,
  SubscriptionPlan, SubscriptionWithPlan, DeductResult,
} from "@/lib/queries/subscription-types";

// Re-export types so existing imports of subscriptions.ts keep working
export type {
  PlanId, BillingInterval, SubscriptionStatus, PlanFeatures,
  SubscriptionPlan, Subscription, SubscriptionWithPlan, DeductResult,
} from "@/lib/queries/subscription-types";

// ── Read queries ──────────────────────────────────────────────────────────────

export async function getSubscription(): Promise<SubscriptionWithPlan | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*, plan:subscription_plans(*)")
    .maybeSingle();
  if (error) {
    console.error("[getSubscription] query failed:", error.message);
    return null;
  }
  return data as SubscriptionWithPlan | null;
}

export async function getPlans(): Promise<SubscriptionPlan[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscription_plans")
    .select("*")
    .order("sort_order");
  return (data ?? []) as SubscriptionPlan[];
}

export async function hasFeature(feature: keyof import("./subscription-types").PlanFeatures): Promise<boolean> {
  const sub = await getSubscription();
  if (!sub) return false;
  if (sub.status !== "active" && sub.status !== "trialing") return false;
  return Boolean(sub.plan.features[feature]);
}

export async function canAfford(amount = 1): Promise<boolean> {
  const sub = await getSubscription();
  if (!sub) return false;
  if (sub.status !== "active" && sub.status !== "trialing") return false;
  return sub.credits_remaining >= amount;
}

export async function canAffordLeads(amount = 1): Promise<boolean> {
  const sub = await getSubscription();
  if (!sub) return false;
  if (sub.status !== "active" && sub.status !== "trialing") return false;
  return sub.leads_remaining >= amount;
}

/** Buy Leads' per-request cap: at most 100 in one go, further capped by
 *  whatever's actually left on the plan this cycle. */
export async function getMaxBuyLeadsCount(): Promise<number> {
  const sub = await getSubscription();
  if (!sub) return 100;
  return Math.max(1, Math.min(100, sub.leads_remaining));
}

export async function getCreditHistory(limit = 50, resourceType?: "credits" | "leads") {
  const supabase = await createClient();
  let query = supabase
    .from("credit_ledger")
    .select("id, operation_type, credits_delta, resource_type, status, created_at, metadata")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (resourceType) query = query.eq("resource_type", resourceType);
  const { data } = await query;
  return data ?? [];
}

// ── Credit / lead deduction ────────────────────────────────────────────────────

/**
 * Resolves the workspace to charge the SAME way getSubscription() resolves
 * which workspace to display — RLS-scoped directly on `subscriptions`, not
 * via the separate `users.workspace_id` column. For any account belonging to
 * more than one workspace, `users.workspace_id` can be stale (e.g. still
 * pointing at that user's very first/original workspace), which silently
 * deducted credits from the wrong workspace's balance while the dashboard
 * displayed a different, unrelated workspace's balance.
 */
async function resolveChargeWorkspaceId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("workspace_id")
    .maybeSingle();
  return sub?.workspace_id ?? null;
}

export async function deductCredits(
  operationType: string,
  amount = 1,
  options: { leadId?: string; campaignId?: string; metadata?: Record<string, unknown> } = {}
): Promise<DeductResult> {
  const supabase = await createClient();

  const workspaceId = await resolveChargeWorkspaceId(supabase);
  if (!workspaceId) return { ok: false, error: "No subscription found for this workspace" };

  const { data, error } = await supabase.rpc("deduct_credits", {
    p_workspace_id:   workspaceId,
    p_operation_type: operationType,
    p_amount:         amount,
    p_lead_id:        options.leadId     ?? null,
    p_campaign_id:    options.campaignId ?? null,
    p_metadata:       options.metadata   ?? {},
  });

  if (error) return { ok: false, error: error.message };
  return data as DeductResult;
}

/** Deducts from the monthly lead-discovery allowance. */
export async function deductLeads(
  amount = 1,
  metadata: Record<string, unknown> = {}
): Promise<DeductResult> {
  const supabase = await createClient();

  const workspaceId = await resolveChargeWorkspaceId(supabase);
  if (!workspaceId) return { ok: false, error: "No subscription found for this workspace" };

  const { data, error } = await supabase.rpc("deduct_leads", {
    p_workspace_id: workspaceId,
    p_amount:       amount,
    p_metadata:     metadata,
  });

  if (error) return { ok: false, error: error.message };
  return data as DeductResult;
}

// ── Admin helpers (webhook handler) ──────────────────────────────────────────

export interface SyncPayload {
  workspaceId: string;
  planId: PlanId;
  billingInterval: BillingInterval;
  status: SubscriptionStatus;
  creditsTotal: number;
  leadsTotal: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEndsAt?: Date | null;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
}

/**
 * Delegates the whole read-decide-write-ledger sequence to the
 * sync_subscription_from_stripe() RPC, which does it atomically under a row
 * lock. Doing this in application code (separate select + upsert + ledger
 * insert) used to race against itself: cancel/resume/checkout all call Stripe
 * directly and then sync themselves, while Stripe's own webhook fires and
 * syncs the same change independently around the same time — two unlocked
 * read-then-writes for one real change could double-grant a plan-change's
 * credits/ledger entry or clobber a concurrent credit spend.
 */
export async function syncSubscriptionFromStripe(payload: SyncPayload): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("sync_subscription_from_stripe", {
    p_workspace_id:           payload.workspaceId,
    p_plan_id:                payload.planId,
    p_billing_interval:       payload.billingInterval,
    p_status:                 payload.status,
    p_credits_total:          payload.creditsTotal,
    p_leads_total:            payload.leadsTotal,
    p_current_period_start:   payload.currentPeriodStart.toISOString(),
    p_current_period_end:     payload.currentPeriodEnd.toISOString(),
    p_trial_ends_at:          payload.trialEndsAt?.toISOString() ?? null,
    p_stripe_customer_id:     payload.stripeCustomerId,
    p_stripe_subscription_id: payload.stripeSubscriptionId,
    p_stripe_price_id:        payload.stripePriceId,
    p_cancel_at_period_end:   payload.cancelAtPeriodEnd,
    p_canceled_at:            payload.canceledAt?.toISOString() ?? null,
  });
  if (error) console.error("[syncSubscriptionFromStripe] RPC failed:", error.message);
}

/**
 * `idempotencyKey` should be the Stripe invoice ID that triggered this
 * reset. Stripe redelivers webhooks (at-least-once delivery), so without
 * this the same renewal invoice could grant a second full free credits/
 * leads refill if its invoice.paid event ever arrives twice.
 */
export async function resetCycleCredits(workspaceId: string, idempotencyKey?: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("reset_subscription_cycle", { p_workspace_id: workspaceId, p_idempotency_key: idempotencyKey ?? null });
  if (error) console.error("[resetCycleCredits] RPC failed:", error.message);
}

export async function workspaceByStripeCustomer(
  stripeCustomerId: string
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("subscriptions")
    .select("workspace_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .single();
  return data?.workspace_id ?? null;
}
