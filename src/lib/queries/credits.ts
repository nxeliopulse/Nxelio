"use server";

import { createClient } from "@/lib/supabase/server";
import { getSubscription } from "@/lib/queries/subscriptions";

export interface AiCreditsUsage {
  used: number;
  total: number;
}

/**
 * Returns AI credit usage from the active subscription.
 * Falls back to approximating from activity counts for legacy workspaces.
 */
export async function getAiCreditsUsage(): Promise<AiCreditsUsage> {
  const sub = await getSubscription();
  if (sub) {
    return { used: sub.credits_total - sub.credits_remaining, total: sub.credits_total };
  }

  // Legacy fallback
  const supabase = await createClient();
  const [{ count: outbound }, { count: activities }] = await Promise.all([
    supabase.from("inbox_messages").select("id", { count: "exact", head: true }).eq("direction", "outbound"),
    supabase.from("lead_activities").select("id", { count: "exact", head: true }),
  ]);
  return { used: (outbound ?? 0) + Math.floor((activities ?? 0) / 2), total: 150 };
}
