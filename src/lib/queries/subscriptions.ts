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
  return sub.leads_remaining + sub.topup_leads_remaining >= amount;
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

export async function deductCredits(
  operationType: string,
  amount = 1,
  options: { leadId?: string; campaignId?: string; metadata?: Record<string, unknown> } = {}
): Promise<DeductResult> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("users")
    .select("workspace_id")
    .single();
  if (!profile) return { ok: false, error: "User profile not found" };

  const { data, error } = await supabase.rpc("deduct_credits", {
    p_workspace_id:   profile.workspace_id,
    p_operation_type: operationType,
    p_amount:         amount,
    p_lead_id:        options.leadId     ?? null,
    p_campaign_id:    options.campaignId ?? null,
    p_metadata:       options.metadata   ?? {},
  });

  if (error) return { ok: false, error: error.message };
  return data as DeductResult;
}

/** Deducts from the monthly lead-discovery allowance first, then purchased top-up leads. */
export async function deductLeads(
  amount = 1,
  metadata: Record<string, unknown> = {}
): Promise<DeductResult> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("users")
    .select("workspace_id")
    .single();
  if (!profile) return { ok: false, error: "User profile not found" };

  const { data, error } = await supabase.rpc("deduct_leads", {
    p_workspace_id: profile.workspace_id,
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
}

export async function syncSubscriptionFromStripe(payload: SyncPayload): Promise<void> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("subscriptions")
    .select("credits_remaining, credits_total, leads_remaining, leads_total, plan_id")
    .eq("workspace_id", payload.workspaceId)
    .single();

  const planChanged = existing && existing.plan_id !== payload.planId;
  const creditsRemaining = planChanged || !existing
    ? payload.creditsTotal
    : existing.credits_remaining;
  const leadsRemaining = planChanged || !existing
    ? payload.leadsTotal
    : existing.leads_remaining;

  await admin.from("subscriptions").upsert(
    {
      workspace_id:              payload.workspaceId,
      plan_id:                   payload.planId,
      billing_interval:          payload.billingInterval,
      status:                    payload.status,
      credits_remaining:         creditsRemaining,
      credits_total:             payload.creditsTotal,
      leads_remaining:           leadsRemaining,
      leads_total:               payload.leadsTotal,
      trial_ends_at:             payload.trialEndsAt?.toISOString() ?? null,
      current_period_start:      payload.currentPeriodStart.toISOString(),
      current_period_end:        payload.currentPeriodEnd.toISOString(),
      stripe_customer_id:     payload.stripeCustomerId,
      stripe_subscription_id: payload.stripeSubscriptionId,
      stripe_price_id:        payload.stripePriceId,
    },
    { onConflict: "workspace_id" }
  );

  if (planChanged) {
    const { data: sub } = await admin
      .from("subscriptions")
      .select("id")
      .eq("workspace_id", payload.workspaceId)
      .single();

    if (sub) {
      await admin.from("credit_ledger").insert({
        workspace_id:    payload.workspaceId,
        subscription_id: sub.id,
        operation_type:  "plan_change",
        credits_delta:   payload.creditsTotal,
        resource_type:   "credits",
        status:          "completed",
        metadata:        { from: existing?.plan_id, to: payload.planId },
      });
      if (payload.leadsTotal > 0) {
        await admin.from("credit_ledger").insert({
          workspace_id:    payload.workspaceId,
          subscription_id: sub.id,
          operation_type:  "plan_change",
          credits_delta:   payload.leadsTotal,
          resource_type:   "leads",
          status:          "completed",
          metadata:        { from: existing?.plan_id, to: payload.planId },
        });
      }
    }
  }
}

export async function resetCycleCredits(workspaceId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.rpc("reset_subscription_cycle", { p_workspace_id: workspaceId });
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
