"use server";

import { getSubscription } from "@/lib/queries/subscriptions";

export interface AiCreditsUsage {
  used: number;
  total: number;
  planId: string;
}

/**
 * Returns AI credit usage from the active subscription. Only called from the
 * app sidebar, which never renders without a subscription (AppLayout gates
 * on it first), so the no-subscription case here is unreachable in practice.
 */
export async function getAiCreditsUsage(): Promise<AiCreditsUsage> {
  const sub = await getSubscription();
  if (!sub) return { used: 0, total: 0, planId: "basic" };
  return { used: sub.credits_total - sub.credits_remaining, total: sub.credits_total, planId: sub.plan_id };
}
