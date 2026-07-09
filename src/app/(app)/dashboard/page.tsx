import { getDashboardStats } from "@/lib/queries/analytics";
import { getOnboarding } from "@/lib/queries/onboarding";
import { createClient } from "@/lib/supabase/server";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export default async function DashboardPage() {
  const supabase = await createClient();
  const [stats, { data: onboardingData, completed: essentialsDone }] = await Promise.all([
    getDashboardStats(),
    getOnboarding(),
  ]);

  const { count: outreachCount } = await supabase
    .from("outreach_accounts")
    .select("id", { count: "exact", head: true })
    .eq("status", "connected");

  const onboardingStatus = {
    essentialsDone,
    inboxConnected: (outreachCount || 0) > 0,
    goals: onboardingData?.goals ?? [],
    userName: onboardingData?.company_name ?? "",
  };

  return <DashboardView stats={stats} onboardingStatus={onboardingStatus} />;
}
