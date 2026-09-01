import { getDashboardStats } from "@/lib/queries/analytics";
import { getOnboarding } from "@/lib/queries/onboarding";
import { getUsers } from "@/lib/queries/users";
import { getAiCreditsUsage } from "@/lib/queries/credits";
import { getCreditHistory } from "@/lib/queries/subscriptions";
import { getCalendarAccounts } from "@/lib/queries/calendar-accounts";
import { getSetupTaskStates } from "@/lib/queries/setup-tasks";
import { listDashboardLayouts, getActiveDashboardLayout } from "@/lib/queries/dashboard-layouts";
import { createClient } from "@/lib/supabase/server";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export default async function DashboardPage() {
  const supabase = await createClient();
  const [stats, { data: onboardingData, completed: essentialsDone }, users, credits, usageHistory, savedLayouts, activeLayout, calendarAccounts, setupTaskStates] = await Promise.all([
    getDashboardStats(),
    getOnboarding(),
    getUsers(),
    getAiCreditsUsage(),
    getCreditHistory(20),
    listDashboardLayouts(),
    getActiveDashboardLayout(),
    getCalendarAccounts(),
    getSetupTaskStates(),
  ]);

  const { count: outreachCount } = await supabase
    .from("outreach_accounts")
    .select("id", { count: "exact", head: true })
    .eq("status", "connected");

  const { data: recentDeals } = await supabase
    .from("opportunities")
    .select("id, name, stage, deal_value, contact_name, created_at")
    .order("created_at", { ascending: false })
    .limit(8);

  const onboardingStatus = {
    essentialsDone,
    inboxConnected: (outreachCount || 0) > 0,
    calendarConnected: calendarAccounts.some((a) => a.status === "connected"),
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

  // Resolve each owner_id in stats.teamPerformance to a real display name —
  // the query only has the id (see DashboardStats.teamPerformance doc
  // comment), page.tsx already has the full user list loaded.
  const teamPerformance = stats.teamPerformance.map((t) => {
    const owner = users.find((u) => u.user_id === t.ownerId);
    return { name: owner?.full_name || owner?.email || "Unassigned", dealsCount: t.dealsCount, wonValue: t.wonValue };
  });

  return (
    <DashboardView
      stats={stats}
      userName={userName}
      onboardingStatus={onboardingStatus}
      collaborators={collaborators}
      credits={credits}
      usageHistory={usageHistory}
      teamPerformance={teamPerformance}
      recentDeals={recentDeals || []}
      setupTaskStates={setupTaskStates}
      savedLayouts={savedLayouts}
      activeLayoutId={activeLayout.id}
      activeLayoutWidgets={activeLayout.widgets}
    />
  );
}
