import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getOnboardingStatus } from "@/lib/queries/onboarding";
import { getSubscription } from "@/lib/queries/subscriptions";
import { SubscriptionGate } from "@/components/billing/subscription-gate";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";
import { getMyWorkspaces } from "@/lib/queries/workspaces";
import { isPlatformAdmin } from "@/lib/queries/platform-admin";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The platform admin login (admin@nxelio.com) isn't a real tenant — it exists
  // only to manage every customer workspace from /admin, not to run campaigns
  // itself. It still has a `users` row (tied to some workspace) for legacy
  // reasons, so without this it would hit the same onboarding/subscription
  // gates as any customer. Send it straight to the admin panel instead.
  if (await isPlatformAdmin()) redirect("/admin");

  // If an admin removed this login's access to its currently-active workspace
  // (updateUserStatus on workspace_members) since their last request, their
  // users.workspace_id pointer may now point at a workspace they're no longer
  // a member of — don't silently render with stale access.
  const { data: activeCheck } = await supabase.from("users").select("workspace_id").eq("user_id", user.id).single();
  if (activeCheck?.workspace_id) {
    const { data: activeMembership } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("workspace_id", activeCheck.workspace_id)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (!activeMembership) {
      await supabase.auth.signOut();
      redirect("/login");
    }
  }

  // Hard onboarding gate — runs BEFORE the subscription check, since a
  // brand-new workspace has no subscription row yet either; checking
  // subscription first would let someone pay before finishing onboarding.
  const onboardingStatus = await getOnboardingStatus();
  if (!onboardingStatus.completed) return <OnboardingGate status={onboardingStatus} />;

  // Card-first gate: a brand-new workspace has no subscription row at all
  // until checkout completes (see migration 0035). Block the whole dashboard
  // until that happens — nothing else here matters if there's no subscription.
  const subscription = await getSubscription();
  if (!subscription) return <SubscriptionGate />;

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, email, role_id, nav_access, roles(role_name)")
    .eq("user_id", user.id)
    .single();

  const userName = profile?.full_name || user.email?.split("@")[0] || "User";
  const userEmail = profile?.email || user.email || "";
  const userRole =
    (profile as { roles?: { role_name?: string } } | null)?.roles?.role_name || "User";
  const navAccess =
    (profile as { nav_access?: Record<string, boolean> | null } | null)?.nav_access ?? null;

  const workspaces = await getMyWorkspaces();

  return (
    <AppShell
      userName={userName}
      userEmail={userEmail}
      userRole={userRole}
      navAccess={navAccess}
      workspaces={workspaces}
    >
      {children}
    </AppShell>
  );
}
