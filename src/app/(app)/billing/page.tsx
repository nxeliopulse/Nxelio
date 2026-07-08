import { getAiCreditsUsage } from "@/lib/queries/credits";
import { createClient } from "@/lib/supabase/server";
import { BillingView } from "@/components/billing/billing-view";

export default async function BillingPage() {
  const supabase = await createClient();

  const [credits, leadsRes, sentRes] = await Promise.all([
    getAiCreditsUsage(),
    supabase.from("leads").select("id", { count: "exact", head: true }),
    supabase
      .from("inbox_messages")
      .select("id", { count: "exact", head: true })
      .eq("direction", "outbound"),
  ]);

  const leadsCount = leadsRes.count ?? 0;
  const sentCount = sentRes.count ?? 0;

  return <BillingView credits={credits} leadsCount={leadsCount} sentCount={sentCount} />;
}
