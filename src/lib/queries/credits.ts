"use server";

import { createClient } from "@/lib/supabase/server";

export interface AiCreditsUsage {
  used: number;
  total: number;
}

const TOTAL_CREDITS = 5000;

/**
 * Approximate AI credit usage for the current workspace.
 * 1 credit per outbound inbox message + 0.5 per lead activity.
 */
export async function getAiCreditsUsage(): Promise<AiCreditsUsage> {
  const supabase = await createClient();

  const { count: outboundCount } = await supabase
    .from("inbox_messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "outbound");

  const { count: activityCount } = await supabase
    .from("lead_activities")
    .select("id", { count: "exact", head: true });

  const used = (outboundCount ?? 0) + Math.floor((activityCount ?? 0) / 2);
  return { used, total: TOTAL_CREDITS };
}
