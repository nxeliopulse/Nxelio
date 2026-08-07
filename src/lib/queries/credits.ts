"use server";

import { getSubscription } from "@/lib/queries/subscriptions";
import type { SubscriptionStatus } from "@/lib/queries/subscription-types";

export interface AiCreditsUsage {
  used: number;
  total: number;
  planId: string;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  /** Leads remaining/total on the plan's monthly discovery allowance (0 for Basic). */
  leadsRemaining: number;
  leadsTotal: number;
}

/**
 * Returns AI credit (and lead-balance) usage from the active subscription.
 * Only called from the app sidebar, which never renders without a
 * subscription (AppLayout gates on it first), so the no-subscription case
 * here is unreachable in practice.
 */
export async function getAiCreditsUsage(): Promise<AiCreditsUsage> {
  const sub = await getSubscription();
  if (!sub) return { used: 0, total: 0, planId: "basic", status: "trialing", trialEndsAt: null, leadsRemaining: 0, leadsTotal: 0 };
  return {
    used: sub.credits_total - sub.credits_remaining,
    total: sub.credits_total,
    planId: sub.plan_id,
    status: sub.status,
    trialEndsAt: sub.trial_ends_at,
    leadsRemaining: sub.leads_remaining,
    leadsTotal: sub.leads_total,
  };
}
