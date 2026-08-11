// Shared types and pure helpers for the subscription system.
// This file has NO "use server" directive so it can be imported
// from both server components and client components.

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
  opportunities: boolean;
  meetings: boolean;
}

export interface SubscriptionPlan {
  id: PlanId;
  name: string;
  monthly_price_cents: number;
  annual_price_cents: number;
  credits_per_cycle: number;
  leads_per_cycle: number;
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
  leads_remaining: number;
  leads_total: number;
  low_balance_notified_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
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

// ── Pure helpers (safe to call anywhere) ─────────────────────────────────────

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

export function isLowOnLeads(sub: Subscription): boolean {
  if (sub.leads_total === 0) return false;
  return sub.leads_remaining / sub.leads_total <= LOW_BALANCE_THRESHOLD;
}

export function totalLeadsAvailable(sub: Subscription): number {
  return sub.leads_remaining;
}

// ── Promotions ────────────────────────────────────────────────────────────────

export type PromotionCategory = "referral" | "launch" | "seasonal" | "student" | "general";

export interface PromoValidationResult {
  ok: boolean;
  error?: string;
  redemptionId?: string;
  promotionId?: string;
  stripeCouponId?: string | null;
  stripePromotionCodeId?: string | null;
  bonusCredits?: number;
  bonusLeads?: number;
  description?: string | null;
  discountType?: "percentage" | "fixed_amount" | null;
  discountValue?: number | null;
}
