import { ShieldAlert } from "lucide-react";
import { getSubscription, getPlans } from "@/lib/queries/subscriptions";
import { getPromotionHistory } from "@/lib/queries/promotions";
import { createClient } from "@/lib/supabase/server";
import { navAdminItems, isNavItemAllowed } from "@/lib/nav-config";
import { Card } from "@/components/ui/card";
import { BillingView } from "@/components/billing/billing-view";

export default async function BillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Real enforcement, not just a hidden sidebar link — a user denied "Subscription"
  // in User Management can't reach this page directly by URL either.
  const { data: profile } = user
    ? await supabase.from("users").select("nav_access, roles(role_name)").eq("user_id", user.id).single()
    : { data: null };
  const role = (profile as { roles?: { role_name?: string } } | null)?.roles?.role_name;
  const navAccess = (profile as { nav_access?: Record<string, boolean> | null } | null)?.nav_access ?? null;
  if (!isNavItemAllowed(navAdminItems, "/billing", role, navAccess)) {
    return (
      <div className="max-w-lg mx-auto mt-16">
        <Card className="p-6 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-slate-900">You don&apos;t have access to this page</p>
            <p className="text-sm text-slate-500 mt-1">Ask a Super Admin to grant you access to Subscription in Administration.</p>
          </div>
        </Card>
      </div>
    );
  }

  const [sub, plans, leadsRes, sentRes, promotionHistory] = await Promise.all([
    getSubscription(),
    getPlans(),
    supabase.from("leads").select("id", { count: "exact", head: true }),
    supabase
      .from("inbox_messages")
      .select("id", { count: "exact", head: true })
      .eq("direction", "outbound"),
    getPromotionHistory(),
  ]);

  return (
    <BillingView
      subscription={sub}
      plans={plans}
      leadsCount={leadsRes.count ?? 0}
      sentCount={sentRes.count ?? 0}
      promotionHistory={promotionHistory}
    />
  );
}
