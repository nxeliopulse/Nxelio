import { getDashboardStats } from "@/lib/queries/analytics";
import { getOnboarding } from "@/lib/queries/onboarding";
import { getUsers } from "@/lib/queries/users";
import { getAiCreditsUsage } from "@/lib/queries/credits";
import { getMeetings } from "@/lib/queries/meetings";
import { createClient } from "@/lib/supabase/server";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { buildAiDashboardSummary } from "@/lib/ai/dashboard-insights";
import { listProactiveAlerts } from "@/lib/queries/proactive-ai";

export default async function DashboardPage() {
  const supabase = await createClient();
  const [stats, { data: onboardingData, completed: essentialsDone }, users, credits, meetings, proactiveAlerts] = await Promise.all([
    getDashboardStats(),
    getOnboarding(),
    getUsers(),
    getAiCreditsUsage(),
    getMeetings(),
    listProactiveAlerts(),
  ]);

  const { count: outreachCount } = await supabase
    .from("outreach_accounts")
    .select("id", { count: "exact", head: true })
    .eq("status", "connected");

  const { data: recentDeals } = await supabase
    .from("opportunities")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  const onboardingStatus = {
    essentialsDone,
    inboxConnected: (outreachCount || 0) > 0,
    goals: onboardingData?.goals ?? [],
    userName: onboardingData?.company_name ?? "",
  };

  // Real workspace teammates for the header's collaborator avatars — was
  // previously a hardcoded fake array (Jessica Sen, Sharon Roy, ...).
  const collaborators = users
    .filter((u) => u.status === "ACTIVE")
    .slice(0, 4)
    .map((u) => ({ name: u.full_name || u.email }));

  const { data: { user } } = await supabase.auth.getUser();
  const currentUser = users.find((u) => u.user_id === user?.id);
  const userName = currentUser?.full_name || user?.email?.split("@")[0] || "User";

  return (
    <DashboardView
      stats={stats}
      userName={userName}
      onboardingStatus={onboardingStatus}
      recentDeals={recentDeals || []}
      collaborators={collaborators}
      meetings={meetings}
      credits={credits}
      aiSummary={buildAiDashboardSummary(stats, proactiveAlerts)}
    />
  );
}
