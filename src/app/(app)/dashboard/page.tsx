import { getDashboardStats } from "@/lib/queries/analytics";
import { getOnboarding } from "@/lib/queries/onboarding";
import { getUsers } from "@/lib/queries/users";
import { getCampaignStats } from "@/lib/queries/campaigns";
import { getTourState } from "@/lib/queries/tour";
import { buildGettingStartedItems } from "@/lib/getting-started";
import { createClient } from "@/lib/supabase/server";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export default async function DashboardPage() {
  const supabase = await createClient();
  const [stats, { data: onboardingData, completed: essentialsDone }, users, campaignStats, tourState] = await Promise.all([
    getDashboardStats(),
    getOnboarding(),
    getUsers(),
    getCampaignStats(),
    getTourState(),
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

  const inboxConnected = (outreachCount || 0) > 0;

  const onboardingStatus = {
    essentialsDone,
    inboxConnected,
    goals: onboardingData?.goals ?? [],
    userName: onboardingData?.company_name ?? "",
  };

  // Real workspace teammates for the header's collaborator avatars — was
  // previously a hardcoded fake array (Jessica Sen, Sharon Roy, ...).
  const activeUsers = users.filter((u) => u.status === "ACTIVE");
  const collaborators = activeUsers.slice(0, 4).map((u) => ({ name: u.full_name || u.email }));

  const { data: { user } } = await supabase.auth.getUser();
  const currentUser = users.find((u) => u.user_id === user?.id);
  const userName = currentUser?.full_name || user?.email?.split("@")[0] || "User";

  const gettingStartedItems = buildGettingStartedItems({
    totalLeads: stats.totalLeads,
    inboxConnected,
    campaignsSent: campaignStats.totalSent,
    opportunitiesCount: recentDeals?.length ?? 0,
    activeTeammates: activeUsers.length,
    tourTaken: Boolean(tourState.checklist.productTourDismissed || tourState.seenTours.dashboard),
  });

  return (
    <DashboardView
      stats={stats}
      userName={userName}
      onboardingStatus={onboardingStatus}
      recentDeals={recentDeals || []}
      collaborators={collaborators}
      gettingStartedItems={gettingStartedItems}
    />
  );
}
