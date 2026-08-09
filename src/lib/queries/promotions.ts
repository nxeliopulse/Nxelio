"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { PlanId } from "@/lib/queries/subscription-types";
import type { PromoValidationResult } from "@/lib/queries/subscription-types";

export type { PromoValidationResult, PromotionCategory } from "@/lib/queries/subscription-types";

interface PromotionRow {
  id: string;
  code: string;
  description: string | null;
  category: string | null;
  discount_type: "percentage" | "fixed_amount" | null;
  discount_value: number | null;
  stripe_coupon_id: string | null;
  stripe_promotion_code_id: string | null;
  bonus_credits: number;
  bonus_leads: number;
  applicable_plans: string[] | null;
  max_redemptions: number | null;
  times_redeemed: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  restricted_email: string | null;
}

async function currentWorkspaceId(): Promise<string | null> {
  const supabase = await createClient();
  // Resolve via `subscriptions` (RLS-scoped), matching getSubscription() —
  // not the separate `users.workspace_id` column, which can be stale for
  // accounts belonging to more than one workspace.
  const { data } = await supabase.from("subscriptions").select("workspace_id").maybeSingle();
  return data?.workspace_id ?? null;
}

/**
 * Read-only validation used for inline "Apply" feedback as the user types —
 * never writes a promotion_redemptions row (so rapid typing/blurring can't
 * create junk pending rows). Mirrors the checks in redeem_promotion_start().
 */
export async function previewPromoCode(code: string, planId: PlanId): Promise<PromoValidationResult> {
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, error: "Enter a code" };

  const supabase = await createClient();
  const { data: promo, error } = await supabase
    .from("promotions")
    .select("*")
    .eq("code", trimmed.toUpperCase())
    .maybeSingle<PromotionRow>();

  if (error || !promo) return { ok: false, error: "Invalid promo code" };
  if (!promo.is_active) return { ok: false, error: "This code is no longer active" };

  const now = Date.now();
  if (new Date(promo.valid_from).getTime() > now) return { ok: false, error: "This code isn't active yet" };
  if (promo.valid_until && new Date(promo.valid_until).getTime() < now) return { ok: false, error: "This code has expired" };

  if (promo.restricted_email) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email || user.email.toLowerCase() !== promo.restricted_email.toLowerCase()) {
      return { ok: false, error: "This code is not valid for your account" };
    }
  }

  if (promo.applicable_plans?.length && !promo.applicable_plans.includes(planId)) {
    return { ok: false, error: "This code is not valid for the selected plan" };
  }

  if (promo.max_redemptions !== null && promo.times_redeemed >= promo.max_redemptions) {
    return { ok: false, error: "This code has reached its redemption limit" };
  }

  const workspaceId = await currentWorkspaceId();
  if (workspaceId) {
    const { count } = await supabase
      .from("promotion_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("promotion_id", promo.id)
      .eq("status", "completed");
    if ((count ?? 0) > 0) return { ok: false, error: "You have already used this code" };
  }

  return {
    ok: true,
    promotionId: promo.id,
    stripeCouponId: promo.stripe_coupon_id,
    stripePromotionCodeId: promo.stripe_promotion_code_id,
    bonusCredits: promo.bonus_credits,
    bonusLeads: promo.bonus_leads,
    description: promo.description,
  };
}

/**
 * Authoritative validate-and-reserve — called from checkout/route.ts right
 * before the Stripe Checkout Session is created. Creates (or reuses, if an
 * earlier attempt was abandoned) a 'pending' promotion_redemptions row.
 */
export async function startPromoRedemption(
  workspaceId: string,
  code: string,
  planId: PlanId
): Promise<PromoValidationResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc("redeem_promotion_start", {
    p_workspace_id: workspaceId,
    p_code: code,
    p_plan_id: planId,
    p_email: user?.email ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as {
    ok: boolean; error?: string; redemption_id?: string; promotion_id?: string;
    stripe_coupon_id?: string | null; stripe_promotion_code_id?: string | null;
    bonus_credits?: number; bonus_leads?: number; description?: string | null;
  };
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    redemptionId: result.redemption_id,
    promotionId: result.promotion_id,
    stripeCouponId: result.stripe_coupon_id,
    stripePromotionCodeId: result.stripe_promotion_code_id,
    bonusCredits: result.bonus_credits,
    bonusLeads: result.bonus_leads,
    description: result.description,
  };
}

/** Tags a pending redemption with the Stripe Checkout Session id, so finalize can target it precisely. */
export async function attachCheckoutSessionToRedemption(redemptionId: string, checkoutSessionId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("promotion_redemptions").update({ stripe_checkout_session_id: checkoutSessionId }).eq("id", redemptionId);
}

/**
 * Called AFTER Stripe confirms the subscription actually went through
 * (checkout-return, and the webhook as a reconciliation fallback). Grants
 * bonus credits/leads and marks the redemption completed. A no-op
 * ({applied:false}) if there's no pending redemption for this workspace —
 * the normal case when no promo code was used.
 */
export async function finalizePendingPromotion(
  workspaceId: string,
  opts: { checkoutSessionId?: string; stripeSubscriptionId?: string } = {}
): Promise<{ ok: boolean; applied: boolean; bonusCredits?: number; bonusLeads?: number }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("redeem_promotion_finalize", {
    p_workspace_id: workspaceId,
    p_checkout_session_id: opts.checkoutSessionId ?? null,
    p_stripe_subscription_id: opts.stripeSubscriptionId ?? null,
  });
  if (error) {
    console.error("[finalizePendingPromotion]", error.message);
    return { ok: false, applied: false };
  }
  const result = data as { ok: boolean; applied: boolean; bonus_credits?: number; bonus_leads?: number };
  return { ok: result.ok, applied: result.applied, bonusCredits: result.bonus_credits, bonusLeads: result.bonus_leads };
}

export interface PromotionHistoryEntry {
  id: string;
  status: string;
  bonus_credits_granted: number;
  bonus_leads_granted: number;
  created_at: string;
  completed_at: string | null;
  promotion: { code: string; description: string | null; category: string | null } | null;
}

/** For the dashboard's "Promotion history" section. */
export async function getPromotionHistory(limit = 20): Promise<PromotionHistoryEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("promotion_redemptions")
    .select("id, status, bonus_credits_granted, bonus_leads_granted, created_at, completed_at, promotion:promotions(code, description, category)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as PromotionHistoryEntry[];
}
