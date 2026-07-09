import { getSubscription, getPlans } from "@/lib/queries/subscriptions";
import { createClient } from "@/lib/supabase/server";
import { BillingView } from "@/components/billing/billing-view";

export default async function BillingPage() {
  const supabase = await createClient();

  const [sub, plans, leadsRes, sentRes] = await Promise.all([
    getSubscription(),
    getPlans(),
    supabase.from("leads").select("id", { count: "exact", head: true }),
    supabase
      .from("inbox_messages")
      .select("id", { count: "exact", head: true })
      .eq("direction", "outbound"),
  ]);

  return (
    <BillingView
      subscription={sub}
      plans={plans}
      leadsCount={leadsRes.count ?? 0}
      sentCount={sentRes.count ?? 0}
    />
  );
}
