"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlanId = "basic" | "starter" | "pro";
export type BillingInterval = "monthly" | "annual";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

export interface PlanFeatures {
  discovery: boolean;
  reply_tracking: boolean;
  csv_import: boolean;
  enrichment: boolean;
  scoring: boolean;
  linkedin_outreach: boolean;
  core_workflows: boolean;
  crm_export: boolean;
  priority_support: boolean;
}

export interface SubscriptionPlan {
  id: PlanId;
  name: string;
  monthly_price_cents: number;
  annual_price_cents: number;
  credits_per_cycle: number;
  trial_days: number;
  features: PlanFeatures;
  sort_order: number;
}

export interface Subscription {
  id: string;
  workspace_id: string;
  plan_id: PlanId;
  billing_interval: BillingInterval;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_start: string;
  current_period_end: string;
  credits_remaining: number;
  credits_total: number;
  low_balance_notified_at: string | null;
  chargebee_customer_id: string | null;
  chargebee_subscription_id: string | null;
  chargebee_plan_id: string | null;
  created_at: string;
}

export interface SubscriptionWithPlan extends Subscription {
  plan: SubscriptionPlan;
}

export interface DeductResult {
  ok: boolean;
  remaining?: number;
  deducted?: number;
  error?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const LOW_BALANCE_THRESHOLD = 0.1; // 10%

export function isLowBalance(sub: Subscription): boolean {
  if (sub.credits_total === 0) return false;
  return sub.credits_remaining / sub.credits_total <= LOW_BALANCE_THRESHOLD;
}

export function trialDaysLeft(sub: Subscription): number {
  if (sub.status !== "trialing" || !sub.trial_ends_at) return 0;
  const ms = new Date(sub.trial_ends_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

// ── Read queries (user-scoped) ────────────────────────────────────────────────

export async function getSubscription(): Promise<SubscriptionWithPlan | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*, plan:subscription_plans(*)")
    .single();
  if (error || !data) return null;
  return data as SubscriptionWithPlan;
}

export async function getPlans(): Promise<SubscriptionPlan[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscription_plans")
    .select("*")
    .order("sort_order");
  return (data ?? []) as SubscriptionPlan[];
}

export async function hasFeature(feature: keyof PlanFeatures): Promise<boolean> {
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

export async function getCreditHistory(limit = 50) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("credit_ledger")
    .select("id, operation_type, credits_delta, status, created_at, metadata")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

// ── Credit deduction (calls SECURITY DEFINER DB function) ────────────────────

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
    p_lead_id:        options.leadId    ?? null,
    p_campaign_id:    options.campaignId ?? null,
    p_metadata:       options.metadata  ?? {},
  });

  if (error) return { ok: false, error: error.message };
  return data as DeductResult;
}

// ── Admin helpers (called from webhook handler with service role) ──────────────

export interface SyncPayload {
  workspaceId: string;
  planId: PlanId;
  billingInterval: BillingInterval;
  status: SubscriptionStatus;
  creditsTotal: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEndsAt?: Date | null;
  chargebeeCustomerId: string;
  chargebeeSubscriptionId: string;
  chargebeePlanId: string;
}

/**
 * Upsert a subscription row from a Chargebee webhook event.
 * Uses the service-role client so it bypasses RLS.
 */
export async function syncSubscriptionFromChargebee(payload: SyncPayload): Promise<void> {
  const admin = createAdminClient();

  // Fetch current credits_remaining so we don't reset if only status changed
  const { data: existing } = await admin
    .from("subscriptions")
    .select("credits_remaining, credits_total, plan_id")
    .eq("workspace_id", payload.workspaceId)
    .single();

  // If plan changed, grant the new plan's credit allowance; otherwise keep current balance
  const planChanged = existing && existing.plan_id !== payload.planId;
  const creditsRemaining = planChanged || !existing
    ? payload.creditsTotal
    : existing.credits_remaining;

  await admin.from("subscriptions").upsert(
    {
      workspace_id:              payload.workspaceId,
      plan_id:                   payload.planId,
      billing_interval:          payload.billingInterval,
      status:                    payload.status,
      credits_remaining:         creditsRemaining,
      credits_total:             payload.creditsTotal,
      trial_ends_at:             payload.trialEndsAt?.toISOString() ?? null,
      current_period_start:      payload.currentPeriodStart.toISOString(),
      current_period_end:        payload.currentPeriodEnd.toISOString(),
      chargebee_customer_id:     payload.chargebeeCustomerId,
      chargebee_subscription_id: payload.chargebeeSubscriptionId,
      chargebee_plan_id:         payload.chargebeePlanId,
    },
    { onConflict: "workspace_id" }
  );

  // Log plan change in ledger
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
        status:          "completed",
        metadata:        { from: existing?.plan_id, to: payload.planId },
      });
    }
  }
}

/**
 * Reset credits at cycle renewal (called from subscription_renewed webhook).
 */
export async function resetCycleCredits(workspaceId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.rpc("reset_subscription_cycle", { p_workspace_id: workspaceId });
}

/**
 * Look up workspace_id from a Chargebee customer/subscription ID.
 */
export async function workspaceByChargebeeCustomer(
  chargebeeCustomerId: string
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("subscriptions")
    .select("workspace_id")
    .eq("chargebee_customer_id", chargebeeCustomerId)
    .single();
  return data?.workspace_id ?? null;
}
